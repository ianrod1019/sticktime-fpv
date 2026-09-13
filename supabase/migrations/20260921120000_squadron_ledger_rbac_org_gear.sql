-- ============================================================
-- Migration: Squadron Cost Ledger — RBAC + org_gear source
--
-- Problem: get_squadron_ledger CROSS JOINed every member's PERSONAL
-- ledger (get_cost_per_flight_hour_ledger), so a squad's "fleet ledger"
-- was actually a roll-up of members' private gear + costs. The org-owned
-- fleet lives in org_gear and already has its own ledger RPC that nobody
-- called.
--
-- 1. team_members.can_view_ledger — per-member grant, set by the
--    squadron owner or managers. Default OFF for plain pilots.
-- 2. can_view_squadron_ledger(_team_id) — single RBAC check used by the
--    ledger RPC: members granted access, plus owner/manager always.
-- 3. get_squadron_ledger(_team_id) — REWRITTEN to serve the org_gear
--    fleet (same shape as get_org_cost_per_flight_hour_ledger), gated on
--    can_view_squadron_ledger instead of plain membership.
-- 4. set_member_ledger_access / get_squadron_ledger_access — owner/
--    manager-only RPCs the Squadron Management page drives.
--
-- Applied via the Supabase MCP in four parts (apply_migration wraps each
-- in a transaction): the column + can_view_squadron_ledger +
-- get_squadron_ledger rewrite, then set_member_ledger_access, then
-- get_squadron_ledger_access, then the execute grants.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Per-member ledger grant
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS can_view_ledger boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. RBAC check: owner/manager always; pilots only when granted.
--    SECURITY DEFINER so it can read team_members rows for the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_squadron_ledger(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = _team_id
        AND user_id = auth.uid()
        AND (team_role IN ('owner', 'manager') OR can_view_ledger)
    ),
    false
  ) OR org_gear.is_site_admin();
$$;

-- ---------------------------------------------------------------------------
-- 3. get_squadron_ledger — the squadron's OWN fleet ledger (org_gear).
--    Return shape changed (member attribution dropped), so the old
--    function is dropped first.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_squadron_ledger(uuid);

CREATE FUNCTION public.get_squadron_ledger(_team_id uuid)
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
  IF NOT public.can_view_squadron_ledger(_team_id) THEN
    RAISE EXCEPTION 'Access denied: squadron ledger access has not been granted to you'
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

    -- Bench parts count toward squadron investment.
    UNION ALL
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
    0::bigint,          -- org sessions land in v2; burn ranking works off cost meanwhile
    0::bigint,
    NULL::timestamptz,
    0::integer
  FROM all_gear ag
  LEFT JOIN repair_costs rc ON rc.rc_gear_id = ag.ag_id
  ORDER BY ag.ag_type, ag.ag_name;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4a. set_member_ledger_access — owner/manager only. The grant only makes
--     sense for plain pilots; owner/manager rows keep the role-based
--     access and are rejected so the flag can't drift from the role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_ledger_access(
  _team_id uuid,
  _user_id uuid,
  _can_view boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT tm.team_role INTO v_caller_role
  FROM public.team_members tm
  WHERE tm.team_id = _team_id AND tm.user_id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Access denied: not a member of this squadron'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access denied: only the squadron owner and managers can set ledger access'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT tm.team_role INTO v_target_role
  FROM public.team_members tm
  WHERE tm.team_id = _team_id AND tm.user_id = _user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Member not found in this squadron'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_target_role IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Owners and managers always have ledger access'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.team_members
  SET can_view_ledger = _can_view
  WHERE team_id = _team_id AND user_id = _user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4b. get_squadron_ledger_access — roster + ledger flag for the
--     management page. Owner/manager only (the gate is on the CALLER's
--     role; the query returns the full roster).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_squadron_ledger_access(_team_id uuid)
RETURNS TABLE(
  member_id uuid,
  display_name text,
  team_role text,
  joined_at timestamptz,
  can_view_ledger boolean,
  has_role_access boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT
    tm.user_id,
    COALESCE(ps.callsign, 'Pilot ' || left(tm.user_id::text, 8)),
    tm.team_role,
    tm.joined_at,
    tm.can_view_ledger,
    tm.team_role IN ('owner', 'manager')
  FROM public.team_members tm
  LEFT JOIN public.pilot_settings ps ON ps.user_id = tm.user_id
  WHERE tm.team_id = _team_id
    AND (
      COALESCE(
        (SELECT x.team_role FROM public.team_members x
          WHERE x.team_id = _team_id AND x.user_id = auth.uid())
          IN ('owner', 'manager'),
        false
      )
      OR org_gear.is_site_admin()
    )
  ORDER BY
    CASE tm.team_role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
    tm.joined_at;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.can_view_squadron_ledger(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_view_squadron_ledger(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_member_ledger_access(uuid, uuid, boolean)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_member_ledger_access(uuid, uuid, boolean)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_squadron_ledger_access(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_squadron_ledger_access(uuid) TO authenticated;

-- get_squadron_ledger keeps its existing authenticated grant (signature
-- unchanged), now RBAC-gated inside.

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
