-- ============================================================
-- Migration: Pack totals + all-session cost ledger
--
-- 1. public.sessions.battery_set_id  -> which battery SET powered the
--    session (real sessions only in practice).
-- 2. personal_gear.batteries.packs_flown_total -> running lifetime total
--    of packs flown per SET. The app used to abuse `pack_count` (the
--    number of packs the set OWNS) as a flight counter; that column is
--    ownership, not usage, and it is now left alone.
-- 3. Trigger sync_session_pack_totals: on INSERT/UPDATE/DELETE of a REAL
--    session, add/subtract packs_flown from the linked set. Sim sessions
--    never touch a battery, so they are ignored.
-- 4. Backfill: the user's existing real sessions are attributed to the
--    Aquila20 Battery set (7e948288-6ca7-4d22-a2fe-4b3d9e45b7bd) and its
--    packs_flown_total starts at the sum of their packs_flown (5).
-- 5. RPC rewrite: the ledger is COMPLETELY FOR EVERYTHING — hours now
--    count ALL sessions (sim included; a TX16S on the sim burns value
--    exactly like it does in the field), and battery rows expose their
--    packs_flown_total for cost-per-pack-flown.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. sessions.battery_set_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS battery_set_id uuid;

-- Deleting a battery set must not delete flight history: null it out.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_battery_set_id_fkey'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_battery_set_id_fkey
      FOREIGN KEY (battery_set_id)
      REFERENCES personal_gear.batteries(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sessions_battery_set_id_idx
  ON public.sessions (battery_set_id)
  WHERE battery_set_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. batteries.packs_flown_total
-- ---------------------------------------------------------------------------
ALTER TABLE personal_gear.batteries
  ADD COLUMN IF NOT EXISTS packs_flown_total integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN personal_gear.batteries.packs_flown_total IS
  'Lifetime packs-flown running total for the whole set, maintained by the sync_session_pack_totals trigger.';

-- ---------------------------------------------------------------------------
-- 3. Pack-total sync trigger (real sessions only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_session_pack_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, personal_gear
AS $$
BEGIN
  -- Only real sessions burn packs; sim time never touches a battery.
  IF NEW.session_type = 'real' AND NEW.battery_set_id IS NOT NULL THEN
    UPDATE personal_gear.batteries
       SET packs_flown_total = packs_flown_total + COALESCE(NEW.packs_flown, 0)
     WHERE id = NEW.battery_set_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_pack_totals ON public.sessions;

CREATE TRIGGER trg_sessions_pack_totals
AFTER INSERT ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.sync_session_pack_totals();

-- DELETE compensation: give the packs back when a real session is removed.
CREATE OR REPLACE FUNCTION public.restore_packs_on_session_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, personal_gear
AS $$
BEGIN
  IF OLD.session_type = 'real' AND OLD.battery_set_id IS NOT NULL
     AND COALESCE(OLD.packs_flown, 0) > 0 THEN
    UPDATE personal_gear.batteries
       SET packs_flown_total = GREATEST(0, packs_flown_total - OLD.packs_flown)
     WHERE id = OLD.battery_set_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_pack_totals_del ON public.sessions;

CREATE TRIGGER trg_sessions_pack_totals_del
AFTER DELETE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.restore_packs_on_session_delete();

-- ---------------------------------------------------------------------------
-- 4. Backfill the user's real sessions onto the Aquila20 Battery set
-- ---------------------------------------------------------------------------
UPDATE public.sessions
   SET battery_set_id = '7e948288-6ca7-4d22-a2fe-4b3d9e45b7bd'
 WHERE session_type = 'real'
   AND battery_set_id IS NULL
   AND user_id = (
     SELECT user_id FROM personal_gear.batteries
      WHERE id = '7e948288-6ca7-4d22-a2fe-4b3d9e45b7bd'
   );

UPDATE personal_gear.batteries
   SET packs_flown_total = (
     SELECT COALESCE(SUM(s.packs_flown), 0)
       FROM public.sessions s
      WHERE s.battery_set_id = batteries.id
        AND s.session_type = 'real'
   )
 WHERE id = '7e948288-6ca7-4d22-a2fe-4b3d9e45b7bd'
   AND packs_flown_total = 0;

-- ---------------------------------------------------------------------------
-- 5. Ledger RPC — hours count EVERY session, batteries expose packs flown
-- ---------------------------------------------------------------------------
-- Return shape changed (packs_flown added) → must DROP first.
DROP FUNCTION IF EXISTS public.get_cost_per_flight_hour_ledger(uuid);
DROP FUNCTION IF EXISTS public.get_cost_per_flight_hour_ledger(uuid, integer, integer);

-- p_limit / p_offset are optional (NULL = unbounded) so callers that pass
-- pagination params (the app's ledger page does) and callers that don't both
-- resolve to this signature.
CREATE FUNCTION public.get_cost_per_flight_hour_ledger(
  p_user_id uuid,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT NULL
)
RETURNS TABLE(
  gear_id uuid,
  gear_name text,
  gear_type text,
  part_category text,
  purchase_cost numeric,
  repair_cost numeric,
  total_cost numeric,
  flight_minutes bigint,
  flight_count bigint,
  last_flight timestamptz,
  packs_flown integer
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, personal_gear
AS $$
  WITH flight_data AS (
    -- Quads/transmitters/goggles: every session (real + sim) counts — the
    -- ledger reflects total usage, and sim hours are still hours on the gear.
    SELECT
      s.drone_id AS fd_gear_id,
      SUM(s.duration_minutes) AS fd_minutes,
      COUNT(*) AS fd_count,
      MAX(s.flown_on)::timestamptz AS fd_last
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.drone_id IS NOT NULL
    GROUP BY s.drone_id

    UNION ALL

    SELECT s.controller_id, SUM(s.duration_minutes), COUNT(*),
           MAX(s.flown_on)::timestamptz
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.controller_id IS NOT NULL
    GROUP BY s.controller_id

    UNION ALL

    SELECT s.goggles_id, SUM(s.duration_minutes), COUNT(*),
           MAX(s.flown_on)::timestamptz
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.goggles_id IS NOT NULL
    GROUP BY s.goggles_id

    -- Batteries: packs flown accrue on real sessions through battery_set_id.
    UNION ALL

    SELECT s.battery_set_id, SUM(s.duration_minutes), COUNT(*),
           MAX(s.flown_on)::timestamptz
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.session_type = 'real'
      AND s.battery_set_id IS NOT NULL
    GROUP BY s.battery_set_id
  ),
  pack_data AS (
    SELECT
      s.battery_set_id AS pd_gear_id,
      SUM(s.packs_flown)::integer AS pd_packs
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.session_type = 'real'
      AND s.battery_set_id IS NOT NULL
    GROUP BY s.battery_set_id
  ),
  all_gear AS (
    SELECT d.id AS ag_id, d.name AS ag_name, 'quad'::text AS ag_type,
           NULL::text AS ag_part_cat, COALESCE(d.purchase_cost, 0) AS ag_cost
    FROM personal_gear.drones d
    WHERE d.user_id = p_user_id

    UNION ALL

    SELECT b.id, b.name, 'battery', NULL, COALESCE(b.purchase_cost, 0)
    FROM personal_gear.batteries b
    WHERE b.user_id = p_user_id

    UNION ALL

    SELECT t.id, t.name, 'transmitter', NULL, COALESCE(t.purchase_cost, 0)
    FROM personal_gear.transmitters t
    WHERE t.user_id = p_user_id

    UNION ALL

    SELECT g.id, g.name, 'goggles', NULL, COALESCE(g.purchase_cost, 0)
    FROM personal_gear.goggles g
    WHERE g.user_id = p_user_id

    UNION ALL

    SELECT o.id, o.name, 'other', NULL, COALESCE(o.purchase_cost, 0)
    FROM personal_gear.other_gear o
    WHERE o.user_id = p_user_id

    UNION ALL

    -- Spare parts & components (bench inventory) are part of the ledger:
    -- their purchase cost counts toward total investment.
    SELECT p.id, p.name, 'component', p.category, COALESCE(p.purchase_cost, 0)
    FROM personal_gear.drone_parts p
    WHERE p.user_id = p_user_id
  ),
  repair_costs AS (
    SELECT
      ml.gear_id AS rc_gear_id,
      COALESCE(SUM(ml.cost), 0) AS rc_cost
    FROM personal_gear.maintenance_logs ml
    WHERE ml.user_id = p_user_id
      AND ml.gear_id IS NOT NULL
    GROUP BY ml.gear_id
  ),
  combined AS (
    SELECT
      ag.ag_id AS c_id,
      ag.ag_name AS c_name,
      ag.ag_type AS c_type,
      ag.ag_part_cat AS c_part_cat,
      ag.ag_cost AS c_purchase,
      COALESCE(rc.rc_cost, 0) AS c_repairs,
      (ag.ag_cost + COALESCE(rc.rc_cost, 0)) AS c_total,
      COALESCE(fd.fd_minutes, 0) AS c_minutes,
      COALESCE(fd.fd_count, 0) AS c_sessions,
      fd.fd_last AS c_last,
      COALESCE(pd.pd_packs, 0) AS c_packs
    FROM all_gear ag
    LEFT JOIN repair_costs rc ON rc.rc_gear_id = ag.ag_id
    LEFT JOIN flight_data fd ON fd.fd_gear_id = ag.ag_id
    LEFT JOIN pack_data pd ON pd.pd_gear_id = ag.ag_id
  )
  SELECT
    c_id AS gear_id,
    c_name AS gear_name,
    c_type AS gear_type,
    c_part_cat AS part_category,
    c_purchase AS purchase_cost,
    c_repairs AS repair_cost,
    c_total AS total_cost,
    c_minutes AS flight_minutes,
    c_sessions AS flight_count,
    c_last AS last_flight,
    c_packs AS packs_flown
  FROM combined
  ORDER BY c_type, c_name
  LIMIT p_limit OFFSET p_offset;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cost_per_flight_hour_ledger(uuid, integer, integer)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_cost_per_flight_hour_ledger(uuid, integer, integer)
  TO authenticated;

-- ============================================================
-- End of migration
-- ============================================================
