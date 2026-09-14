-- ===========================================================================
-- 20260927100500_enterprise_metrics_volatility_fix.sql
-- Repair pass (from live playtest): get_enterprise_metrics was declared
-- STABLE but performs an audit INSERT — Postgres rejects writes inside
-- non-volatile functions at runtime ('0A000: INSERT is not allowed in a
-- non-volatile function'). Re-asserts the function as VOLATILE.
-- The base migration (20260927100300) already ships the corrected source;
-- this file exists so backends that applied the earlier STABLE definition
-- converge to the same state.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_enterprise_metrics(_enterprise uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO 'public', 'org_gear'
  AS $fn$
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

    -- Aggregate-only, no per-pilot rows. Audit who pulled district totals.
    INSERT INTO public.admin_audit_logs (actor_id, action, payload)
    VALUES (v_uid, 'view_enterprise_metrics',
            jsonb_build_object('enterprise_id', _enterprise, 'at', now()));

    RETURN v_result;
  END;
  $fn$;

REVOKE ALL ON FUNCTION public.get_enterprise_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_enterprise_metrics(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
