-- ====================================================
-- Migration: Fix get_cost_per_flight_hour_ledger
--
-- The previous definition queried public.sessions.gear_id — a column that
-- does not exist. Sessions reference gear through three FKs:
--   drone_id (quads), controller_id (transmitters), goggles_id (goggles).
-- The function therefore threw on every call and the Cost Ledger never had
-- a data source.
--
-- Rewrite: aggregate real-session flight minutes per gear from the three
-- session FKs, union all five personal_gear tables for the investment side,
-- and add maintenance_log costs. Battery/other gear has no session FK, so
-- their hours stay 0 (they accrue cost, not burn rate).
--
-- Also hardened: SECURITY INVOKER (RLS of the caller applies), pinned
-- search_path, EXECUTE limited to authenticated.
-- ====================================================

CREATE OR REPLACE FUNCTION public.get_cost_per_flight_hour_ledger(p_user_id uuid)
RETURNS TABLE(
  gear_id uuid,
  gear_name text,
  gear_type text,
  purchase_cost numeric,
  repair_cost numeric,
  total_cost numeric,
  flight_minutes bigint,
  flight_count bigint,
  last_flight timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, personal_gear
AS $$
  WITH flight_data AS (
    SELECT
      s.drone_id AS gear_id,
      SUM(s.duration_minutes) AS flight_minutes,
      COUNT(*) AS flight_count,
      MAX(s.flown_on)::timestamptz AS last_flight
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.session_type = 'real'
      AND s.drone_id IS NOT NULL
    GROUP BY s.drone_id

    UNION ALL

    SELECT
      s.controller_id,
      SUM(s.duration_minutes),
      COUNT(*),
      MAX(s.flown_on)::timestamptz
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.session_type = 'real'
      AND s.controller_id IS NOT NULL
    GROUP BY s.controller_id

    UNION ALL

    SELECT
      s.goggles_id,
      SUM(s.duration_minutes),
      COUNT(*),
      MAX(s.flown_on)::timestamptz
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.session_type = 'real'
      AND s.goggles_id IS NOT NULL
    GROUP BY s.goggles_id
  ),
  all_gear AS (
    SELECT d.id AS gear_id, d.name AS gear_name, 'quad'::text AS gear_type,
           COALESCE(d.purchase_cost, 0) AS purchase_cost
    FROM personal_gear.drones d
    WHERE d.user_id = p_user_id

    UNION ALL

    SELECT b.id, b.name, 'battery', COALESCE(b.purchase_cost, 0)
    FROM personal_gear.batteries b
    WHERE b.user_id = p_user_id

    UNION ALL

    SELECT t.id, t.name, 'transmitter', COALESCE(t.purchase_cost, 0)
    FROM personal_gear.transmitters t
    WHERE t.user_id = p_user_id

    UNION ALL

    SELECT g.id, g.name, 'goggles', COALESCE(g.purchase_cost, 0)
    FROM personal_gear.goggles g
    WHERE g.user_id = p_user_id

    UNION ALL

    SELECT o.id, o.name, 'other', COALESCE(o.purchase_cost, 0)
    FROM personal_gear.other_gear o
    WHERE o.user_id = p_user_id
  ),
  repair_costs AS (
    SELECT
      ml.gear_id,
      COALESCE(SUM(ml.cost), 0) AS repair_cost
    FROM personal_gear.maintenance_logs ml
    WHERE ml.user_id = p_user_id
      AND ml.gear_id IS NOT NULL
    GROUP BY ml.gear_id
  )
  SELECT
    ag.gear_id,
    ag.gear_name,
    ag.gear_type,
    ag.purchase_cost,
    COALESCE(rc.repair_cost, 0) AS repair_cost,
    (ag.purchase_cost + COALESCE(rc.repair_cost, 0)) AS total_cost,
    COALESCE(fd.flight_minutes, 0) AS flight_minutes,
    COALESCE(fd.flight_count, 0) AS flight_count,
    fd.last_flight
  FROM all_gear ag
  LEFT JOIN repair_costs rc ON rc.gear_id = ag.gear_id
  LEFT JOIN flight_data fd ON fd.gear_id = ag.gear_id
  ORDER BY ag.gear_type, ag.gear_name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cost_per_flight_hour_ledger(uuid)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_cost_per_flight_hour_ledger(uuid)
  TO authenticated;

-- ====================================================
-- End of migration
-- ====================================================
