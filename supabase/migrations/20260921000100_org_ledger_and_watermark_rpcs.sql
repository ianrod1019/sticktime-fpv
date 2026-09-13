-- ============================================================
-- Migration: org_gear RPC layer — watermark + org cost ledger
--
-- 1. get_org_gear_watermark(_team_id): GREATEST(max(updated_at)) across the
--    org tables. The client's ledger cache uses this as its cheap
--    high-water probe: unchanged watermark ⇒ serve the cached ledger
--    (0 heavy rows transferred); changed ⇒ re-run the ledger RPC.
--
-- 2. get_org_cost_per_flight_hour_ledger(_team_id, p_limit, p_offset): the
--    squadron-owned mirror of the personal cost-per-flight-hour ledger,
--    sourced entirely from org_gear tables. Session-linked flight-hour math
--    is v2 (org gear is not yet referenced by public.sessions) — hours show
--    as 0 and burn-rate ranking still works off investment + repairs.
--
-- Both are member-gated, SECURITY DEFINER, pinned search_path.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_org_gear_watermark(_team_id uuid)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = org_gear, public
AS $$
  SELECT NULLIF(
    GREATEST(
      (SELECT MAX(updated_at) FROM org_gear.drones WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.batteries WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.transmitters WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.goggles WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.other_gear WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.drone_parts WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.drone_part_installs WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.transmitter_parts WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.goggles_parts WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.other_parts WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.maintenance_logs WHERE team_id = _team_id)
    ),
    '-infinity'::timestamptz
  );
$$;

-- Member-gate: reuse the org_gear RLS helpers (they were revoked from
-- direct EXECUTE, so this SECURITY DEFINER wrapper is the sanctioned path).
CREATE OR REPLACE FUNCTION public.get_org_cost_per_flight_hour_ledger(
  _team_id uuid,
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = org_gear, public
AS $$
BEGIN
  IF NOT org_gear.is_team_member(_team_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this squadron'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH all_gear AS (
    SELECT d.id AS ag_id, d.name AS ag_name, 'quad'::text AS ag_type,
           NULL::text AS ag_part_cat, COALESCE(d.purchase_cost, 0) AS ag_cost
    FROM org_gear.drones d
    WHERE d.team_id = _team_id

    UNION ALL
    SELECT b.id, b.name, 'battery', NULL, COALESCE(b.purchase_cost, 0)
    FROM org_gear.batteries b WHERE b.team_id = _team_id

    UNION ALL
    SELECT t.id, t.name, 'transmitter', NULL, COALESCE(t.purchase_cost, 0)
    FROM org_gear.transmitters t WHERE t.team_id = _team_id

    UNION ALL
    SELECT g.id, g.name, 'goggles', NULL, COALESCE(g.purchase_cost, 0)
    FROM org_gear.goggles g WHERE g.team_id = _team_id

    UNION ALL
    SELECT o.id, o.name, 'other', NULL, COALESCE(o.purchase_cost, 0)
    FROM org_gear.other_gear o WHERE o.team_id = _team_id

    UNION ALL
    -- Bench parts count toward org investment.
    SELECT p.id, p.name, 'component', p.category, COALESCE(p.purchase_cost, 0)
    FROM org_gear.drone_parts p WHERE p.team_id = _team_id
  ),
  repair_costs AS (
    SELECT ml.gear_id AS rc_gear_id, COALESCE(SUM(ml.cost), 0) AS rc_cost
    FROM org_gear.maintenance_logs ml
    WHERE ml.team_id = _team_id
    GROUP BY ml.gear_id
  )
  SELECT
    ag.ag_id,
    ag.ag_name,
    ag.ag_type,
    ag.ag_part_cat,
    ag.ag_cost,
    COALESCE(rc.rc_cost, 0),
    ag.ag_cost + COALESCE(rc.rc_cost, 0),
    0::bigint,
    0::bigint,
    NULL::timestamptz,
    0::integer
  FROM all_gear ag
  LEFT JOIN repair_costs rc ON rc.rc_gear_id = ag.ag_id
  ORDER BY ag.ag_type, ag.ag_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_org_gear_watermark(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_org_gear_watermark(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_org_cost_per_flight_hour_ledger(uuid, integer, integer)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_org_cost_per_flight_hour_ledger(uuid, integer, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
