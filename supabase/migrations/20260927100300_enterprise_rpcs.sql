-- ============================================================
-- Migration: Enterprise RPCs 1 — districts + aggregate metrics
--
-- Discovery + the aggregate-only district metrics RPC (section 1).
-- House style: SECURITY DEFINER, pinned search_path, REVOKE from
-- anon/public, GRANT to authenticated, every mutation audited in
-- admin_audit_logs (now immutable-by-construction — see FERPA
-- Phase 0, 20260927000000).
--
-- Read RPCs return AGGREGATES ONLY for district surfaces — zero
-- per-pilot rows cross the boundary (privacy-preserving reporting:
-- the district sees counts and hours, not rosters of other squads'
-- members).
-- ============================================================

-- ---------------------------------------------------------------------------
-- 0. Caller gate — enterprise admins only (district/squadron/staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ent_assert_admin(_org uuid)
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_role text := public.ent_effective_role(_org);
  BEGIN
    IF v_role NOT IN ('district_admin', 'squadron_admin', 'platform_admin') THEN
      RAISE EXCEPTION 'Access denied: org admins only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END;
  $$;

-- ---------------------------------------------------------------------------
-- 1. Districts — discovery + aggregate metrics
-- ---------------------------------------------------------------------------

-- The caller's enterprises (as billing owner) or orgs (as member).
CREATE OR REPLACE FUNCTION public.get_my_enterprises()
  RETURNS TABLE(
    enterprise_id   uuid,
    enterprise_name text,
    plan_code       text,
    plan_name       text,
    annual_price_floor numeric,
    district_features boolean,
    my_role         text,
    organization_id uuid,
    organization_name text,
    team_id         uuid,
    is_school       boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    -- District admin rows: one per org of their enterprise.
    SELECT e.id, e.name, e.plan_code, p.name, p.annual_price_floor,
           p.district_features,
           'district_admin'::text,
           o.id, o.name, o.team_id, o.is_school
      FROM public.enterprises e
      JOIN public.enterprise_plans p ON p.code = e.plan_code
      JOIN public.organizations o ON o.enterprise_id = e.id
     WHERE e.billing_owner_id = auth.uid()

     UNION ALL

     -- Member rows: the orgs they belong to. Orgs of an enterprise the
     -- caller OWNS are excluded here — the district branch already
     -- carries them (a billing owner who is also a team 'member' keeps
     -- their district_admin row, not a duplicate pilot row).
     SELECT e.id, e.name, e.plan_code, p.name, p.annual_price_floor,
            p.district_features,
            CASE tm.team_role WHEN 'owner' THEN 'squadron_admin'
                              WHEN 'manager' THEN 'squadron_admin'
                              ELSE 'pilot' END,
            o.id, o.name, o.team_id, o.is_school
       FROM public.team_members tm
       JOIN public.organizations o ON o.team_id = tm.team_id
       JOIN public.enterprises e ON e.id = o.enterprise_id
       JOIN public.enterprise_plans p ON p.code = e.plan_code
      WHERE tm.user_id = auth.uid()
        AND NOT EXISTS (
          SELECT 1 FROM public.enterprises e2
           WHERE e2.id = e.id
             AND e2.billing_owner_id = auth.uid()
        );
  $$;

-- District aggregate metrics across ALL sub-squadrons. Returns
-- enterprise_totals + per_org. No per-pilot rows, ever.
-- VOLATILE (the default), not STABLE: the audit INSERT at the end of the
-- body is illegal in STABLE/VOLATILE-called-from-SELECT contexts — Postgres
-- rejects non-volatile functions that write ('0A000: INSERT is not allowed
-- in a non-volatile function', reproduced in playtest).
CREATE OR REPLACE FUNCTION public.get_enterprise_metrics(_enterprise uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO 'public', 'org_gear'
  AS $$
  DECLARE
    v_uid uuid := auth.uid();
    v_result jsonb;
  BEGIN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT (
      public.ent_is_district_admin_of(_enterprise) OR public.ent_is_site_admin()
      -- Squadron admins may read district roll-ups of their own org's
      -- district (they are inside the trust boundary).
      OR EXISTS (
        SELECT 1 FROM public.organizations o
         WHERE o.enterprise_id = _enterprise
           AND public.ent_is_squadron_admin(o.id)
      )
    ) THEN
      RAISE EXCEPTION 'Access denied: enterprise admins only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT jsonb_build_object(
      'enterprise_id', _enterprise,
      'generated_at', now(),
      'totals', jsonb_build_object(
        'org_count',
          (SELECT COUNT(*) FROM public.organizations
            WHERE enterprise_id = _enterprise),
        'active_pilots',
          (SELECT COUNT(DISTINCT tm.user_id)
             FROM public.organizations o
             JOIN public.team_members tm ON tm.team_id = o.team_id
            WHERE o.enterprise_id = _enterprise),
        'squadron_admins',
          (SELECT COUNT(DISTINCT tm.user_id)
             FROM public.organizations o
             JOIN public.team_members tm ON tm.team_id = o.team_id
            WHERE o.enterprise_id = _enterprise
              AND tm.team_role IN ('owner', 'manager')),
        'fleet_size',
          (SELECT COUNT(*)
             FROM public.organizations o
             JOIN org_gear.drones d ON d.team_id = o.team_id
            WHERE o.enterprise_id = _enterprise),
        'flight_hours_30d',
          (SELECT COALESCE(ROUND(SUM(s.duration_minutes) / 60.0, 1), 0)
             FROM public.sessions s
             JOIN public.team_members tm ON tm.user_id = s.user_id
             JOIN public.organizations o ON o.team_id = tm.team_id
            WHERE o.enterprise_id = _enterprise
              AND s.created_at > now() - interval '30 days'),
        'active_enforcements',
          (SELECT COUNT(*) FROM public.enterprise_policies
            WHERE enabled AND enterprise_id = _enterprise)
      ),
      'per_org', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'organization_id', o.id,
          'name', o.name,
          'is_school', o.is_school,
          'team_id', o.team_id,
          'active_pilots', (
            SELECT COUNT(*) FROM public.team_members tm
             WHERE tm.team_id = o.team_id),
          'squadron_admins', (
            SELECT COUNT(*) FROM public.team_members tm
             WHERE tm.team_id = o.team_id
               AND tm.team_role IN ('owner', 'manager')),
          'fleet_size', (
            SELECT COUNT(*) FROM org_gear.drones d
             WHERE d.team_id = o.team_id),
          'flight_hours_30d', (
            SELECT COALESCE(ROUND(SUM(s.duration_minutes) / 60.0, 1), 0)
              FROM public.sessions s
              JOIN public.team_members tm ON tm.user_id = s.user_id
             WHERE tm.team_id = o.team_id
               AND s.created_at > now() - interval '30 days'),
          'active_policies', (
            SELECT COUNT(*) FROM public.enterprise_policies p
             WHERE p.enabled AND (p.org_id = o.id OR (p.org_id IS NULL
                    AND p.enterprise_id = o.enterprise_id))
          )
        ) ORDER BY o.name), '[]'::jsonb)
        FROM public.organizations o
        WHERE o.enterprise_id = _enterprise
      )
    ) INTO v_result;

    INSERT INTO public.admin_audit_logs (actor_id, action, payload)
    VALUES (v_uid, 'view_enterprise_metrics',
            jsonb_build_object('enterprise_id', _enterprise, 'at', now()));

    RETURN v_result;
  END;
  $$;

-- ---------------------------------------------------------------------------
-- 5. Execute grants for the discovery + metrics RPCs
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_my_enterprises() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_enterprise_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_enterprises() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_enterprise_metrics(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration (policies + meetups RPCs continue in
-- 20260927100320_enterprise_rpcs_2.sql)
-- ============================================================
