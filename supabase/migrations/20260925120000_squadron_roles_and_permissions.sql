-- ============================================================
-- Migration: Squadron custom roles + per-member permissions
--
-- Extends the RBAC work (20260921120000) from a single ledger flag to a
-- general permission framework:
--
--   * team_roles — squadron-defined named roles ("student", "coach", ...)
--    as reusable grant templates per team.
--   * team_members.role_id + three per-member capability switches:
--    can_edit_gear, can_view_analytics, can_view_ledger.
--   * Backfill: existing members keep what they can do today (analytics +
--    gear editing; ledger stays under the existing can_view_ledger flag).
--   * org_gear write policies now require can_edit_gear (owner/manager or
--    explicitly granted member); org RLS reads stay member-wide.
--   * Failure analytics additionally gated on can_view_analytics.
--   * Management RPCs (owner/manager only): role CRUD, role assignment,
--    per-member switches, permission roster.
--
-- Owner/manager role access is immutable: role checks short-circuit on
-- team_role IN ('owner','manager') everywhere, and team_roles rows for
-- those names cannot exist (CHECK).
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Custom roles: per-team named grant templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name       text NOT NULL,
  can_edit_gear     boolean NOT NULL DEFAULT false,
  can_view_analytics boolean NOT NULL DEFAULT false,
  can_view_ledger   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, name),
  CONSTRAINT team_roles_no_builtin CHECK (
    lower(name) NOT IN ('owner', 'manager', 'member', 'pilot')
  )
);

ALTER TABLE public.team_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team roles readable by members"
  ON public.team_roles FOR SELECT
  USING (public.can_view_team(team_id));

CREATE POLICY "Team roles managed by owner or manager"
  ON public.team_roles FOR ALL
  USING (public.user_team_role(team_id) IN ('owner', 'manager'))
  WITH CHECK (public.user_team_role(team_id) IN ('owner', 'manager'));

-- ---------------------------------------------------------------------------
-- 2. Per-member capability switches. can_view_ledger already exists
--    (20260921120000); the other two are new.
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.team_roles(id) ON DELETE SET NULL;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS can_edit_gear boolean;
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS can_view_analytics boolean;

-- Preserve existing access: every member can do today what they could
-- before this migration. NULL = inherit role template; owner/manager rows
-- are role-gated anyway.
UPDATE public.team_members
SET can_edit_gear = NOT (team_role IN ('owner', 'manager'))
WHERE can_edit_gear IS NULL;

UPDATE public.team_members
SET can_view_analytics = NOT (team_role IN ('owner', 'manager'))
WHERE can_view_analytics IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Shared helpers (STABLE, SECURITY DEFINER, pinned search_path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_team_role(_team_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.team_role FROM public.team_members tm
  WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.can_view_team(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  );
$$;

-- The gear-edit gate: owner/manager always; members when their own switch
-- is true; members inherit their custom role template when set.
CREATE OR REPLACE FUNCTION org_gear.can_edit_gear(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT COALESCE((
    SELECT
      tm.team_role IN ('owner', 'manager')
      OR COALESCE(tm.can_edit_gear, false)
      OR COALESCE(r.can_edit_gear, false)
    FROM public.team_members tm
    LEFT JOIN public.team_roles r ON r.id = tm.role_id
    WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  ), false) OR org_gear.is_site_admin();
$$;

-- Effective analytics permission (own switch OR role template).
CREATE OR REPLACE FUNCTION public.can_view_squadron_analytics(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT COALESCE((
    SELECT
      tm.team_role IN ('owner', 'manager')
      OR COALESCE(tm.can_view_analytics, false)
      OR COALESCE(r.can_view_analytics, false)
    FROM public.team_members tm
    LEFT JOIN public.team_roles r ON r.id = tm.role_id
    WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  ), false) OR org_gear.is_site_admin();
$$;

-- Ledger gate now also honors the role template.
CREATE OR REPLACE FUNCTION public.can_view_squadron_ledger(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT COALESCE((
    SELECT
      tm.team_role IN ('owner', 'manager')
      OR COALESCE(tm.can_view_ledger, false)
      OR COALESCE(r.can_view_ledger, false)
    FROM public.team_members tm
    LEFT JOIN public.team_roles r ON r.id = tm.role_id
    WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  ), false) OR org_gear.is_site_admin();
$$;

-- ---------------------------------------------------------------------------
-- 4. org_gear write policies: editing now requires can_edit_gear. Reads
--    stay member-wide.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'drones', 'batteries', 'transmitters', 'goggles', 'other_gear',
    'drone_parts', 'drone_part_installs', 'transmitter_parts',
    'goggles_parts', 'other_parts', 'maintenance_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_member_insert ON org_gear.%I', t);
    EXECUTE format($f$
      CREATE POLICY org_member_insert ON org_gear.%I
      FOR INSERT WITH CHECK (org_gear.can_edit_gear(team_id))
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS org_member_update ON org_gear.%I', t);
    EXECUTE format($f$
      CREATE POLICY org_member_update ON org_gear.%I
      FOR UPDATE USING (org_gear.can_edit_gear(team_id))
      WITH CHECK (org_gear.can_edit_gear(team_id))
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS org_member_delete ON org_gear.%I', t);
    EXECUTE format($f$
      CREATE POLICY org_member_delete ON org_gear.%I
      FOR DELETE USING (org_gear.can_edit_gear(team_id))
    $f$, t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Management RPCs (owner/manager only, server-enforced)
-- ---------------------------------------------------------------------------

-- 5a. Custom role CRUD.
CREATE OR REPLACE FUNCTION public.create_team_role(
  _team_id uuid,
  _name text,
  _can_edit_gear boolean DEFAULT false,
  _can_view_analytics boolean DEFAULT false,
  _can_view_ledger boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
DECLARE
  v_role text;
  v_id uuid;
BEGIN
  v_role := public.user_team_role(_team_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access denied: not a member of this squadron'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access denied: only the squadron owner and managers can create roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _name := btrim(_name);
  IF _name IS NULL OR char_length(_name) < 2 OR char_length(_name) > 40 THEN
    RAISE EXCEPTION 'Role name must be between 2 and 40 characters';
  END IF;

  INSERT INTO public.team_roles (team_id, name, can_edit_gear, can_view_analytics, can_view_ledger)
  VALUES (_team_id, _name, _can_edit_gear, _can_view_analytics, _can_view_ledger)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_team_role(_team_id uuid, _role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
BEGIN
  IF public.user_team_role(_team_id) NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access denied: only the squadron owner and managers can delete roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.team_roles
  WHERE id = _role_id AND team_id = _team_id;
END;
$$;

-- 5b. Assign a custom role to a member (replaces the member's switches with
-- the role template's; the template keeps tracking future changes).
CREATE OR REPLACE FUNCTION public.assign_member_role(
  _team_id uuid,
  _user_id uuid,
  _role_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
DECLARE
  v_target_role text;
BEGIN
  IF public.user_team_role(_team_id) NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access denied: only the squadron owner and managers can assign roles'
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
    RAISE EXCEPTION 'Owners and managers cannot be assigned custom roles'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_roles WHERE id = _role_id AND team_id = _team_id
  ) THEN
    RAISE EXCEPTION 'Role not found in this squadron'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF _role_id IS NULL THEN
    -- Clearing the role also clears the template-derived switches; the
    -- owner can re-grant individual permissions afterwards.
    UPDATE public.team_members
    SET role_id = NULL,
        can_edit_gear = false,
        can_view_analytics = false,
        can_view_ledger = false
    WHERE team_id = _team_id AND user_id = _user_id;
  ELSE
    UPDATE public.team_members tm
    SET role_id = r.id,
        can_edit_gear = r.can_edit_gear,
        can_view_analytics = r.can_view_analytics,
        can_view_ledger = r.can_view_ledger
    FROM public.team_roles r
    WHERE tm.team_id = _team_id AND tm.user_id = _user_id
      AND r.id = _role_id;
  END IF;
END;
$$;

-- 5c. Set a single per-member switch (independent of any role template).
CREATE OR REPLACE FUNCTION public.set_member_permission(
  _team_id uuid,
  _user_id uuid,
  _permission text,
  _granted boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
DECLARE
  v_target_role text;
BEGIN
  IF public.user_team_role(_team_id) NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access denied: only the squadron owner and managers can set permissions'
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
    RAISE EXCEPTION 'Owners and managers always have full access'
      USING ERRCODE = 'check_violation';
  END IF;

  CASE _permission
    WHEN 'can_edit_gear' THEN
      UPDATE public.team_members SET can_edit_gear = _granted
      WHERE team_id = _team_id AND user_id = _user_id;
    WHEN 'can_view_analytics' THEN
      UPDATE public.team_members SET can_view_analytics = _granted
      WHERE team_id = _team_id AND user_id = _user_id;
    WHEN 'can_view_ledger' THEN
      UPDATE public.team_members SET can_view_ledger = _granted
      WHERE team_id = _team_id AND user_id = _user_id;
    ELSE
      RAISE EXCEPTION 'Unknown permission: %', _permission
        USING ERRCODE = 'invalid_parameter_value';
  END CASE;
END;
$$;

-- 5d. Permission roster for the management page (owner/manager only).
CREATE OR REPLACE FUNCTION public.get_squadron_permissions(_team_id uuid)
RETURNS TABLE(
  member_id          uuid,
  display_name       text,
  team_role          text,
  role_id            uuid,
  role_name          text,
  can_edit_gear      boolean,
  can_view_analytics boolean,
  can_view_ledger    boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT
    tm.user_id,
    COALESCE(ps.callsign, 'Pilot ' || left(tm.user_id::text, 8)),
    tm.team_role,
    tm.role_id,
    r.name,
    COALESCE(tm.can_edit_gear, false) OR COALESCE(r.can_edit_gear, false),
    COALESCE(tm.can_view_analytics, false) OR COALESCE(r.can_view_analytics, false),
    COALESCE(tm.can_view_ledger, false) OR COALESCE(r.can_view_ledger, false)
  FROM public.team_members tm
  LEFT JOIN public.team_roles r ON r.id = tm.role_id
  LEFT JOIN public.pilot_settings ps ON ps.user_id = tm.user_id
  WHERE tm.team_id = _team_id
    AND (
      COALESCE(public.user_team_role(_team_id) IN ('owner', 'manager'), false)
      OR org_gear.is_site_admin()
    )
  ORDER BY
    CASE tm.team_role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
    tm.joined_at;
$$;

-- ---------------------------------------------------------------------------
-- 6. Failure analytics: extend the enterprise gate with the per-member
--    analytics permission. Full function restated from
--    20260924000000_squadron_failure_analytics.sql with the extended guard.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_org_failure_analytics(_team_id uuid DEFAULT NULL)
RETURNS TABLE (
  team_id        uuid,
  team_name      text,
  bucket         text,
  label          text,
  reports        integer,
  broken_parts   integer,
  events         integer,
  repair_cost    numeric,
  is_crash       boolean,
  fleet_minutes  bigint,
  drone_crashes  bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, org_gear
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT COALESCE(public.check_enterprise_access(), false) THEN
    RAISE EXCEPTION 'Access denied: squadron failure analytics requires the Enterprise plan';
  END IF;

  IF _team_id IS NOT NULL THEN
    -- NB: qualify every column — RETURNS TABLE output names shadow table
    -- columns inside PL/pgSQL.
    IF NOT EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
       AND (tm.team_role IN ('owner', 'manager')
            OR COALESCE(tm.can_view_analytics, false)
            OR EXISTS (
              SELECT 1 FROM public.team_roles r
              WHERE r.id = tm.role_id AND r.can_view_analytics
            ))
    ) THEN
      RAISE EXCEPTION 'Access denied: not a member of this squadron';
    END IF;
  END IF;

  RETURN QUERY
  WITH scope_teams AS (
    SELECT t.id AS team_id, t.name AS team_name
    FROM public.teams t
    WHERE _team_id IS NOT NULL
       OR EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = t.id
              AND tm.user_id = auth.uid()
              AND (tm.team_role IN ('owner', 'manager')
                   OR COALESCE(tm.can_view_analytics, false)
                   OR EXISTS (
                     SELECT 1 FROM public.team_roles r
                     WHERE r.id = tm.role_id AND r.can_view_analytics
                   ))
          )
  ),

  all_reports AS (
    SELECT
      st.team_id,
      st.team_name,
      l.id                                AS log_id,
      l.gear_id                           AS log_gear,
      COALESCE(NULLIF(btrim(p.f_part), ''), 'Unspecified')
                                          AS part_label,
      CASE WHEN btrim(p.f_category) IN (
               'Frames', 'Motors', 'ESCs',
               'Flight Controllers', 'VTX/Camera'
             )
           THEN btrim(p.f_category) ELSE 'Other' END
                                          AS bucket,
      lower(btrim(p.f_reason))            AS reason_lc,
      COALESCE(l.cost, 0)                 AS cost
    FROM scope_teams st
    JOIN org_gear.maintenance_logs l
      ON l.team_id = st.team_id
    CROSS JOIN LATERAL public.parse_failure_head(l.description) p
    WHERE p.f_reason IS NOT NULL
  ),

  deduped_reports AS (
    SELECT DISTINCT ON (dr.team_id, dr.log_gear, dr.reason_lc, dr.part_label, dr.bucket, dr.cost)
      dr.*
    FROM all_reports dr
    ORDER BY dr.team_id, dr.log_gear, dr.reason_lc, dr.part_label, dr.bucket, dr.cost, dr.log_id
  ),

  broken AS (
    SELECT
      st.team_id,
      st.team_name,
      public.org_part_bucket(dp.category) AS bucket,
      NULLIF(btrim(dp.name), '')          AS part_label,
      lower(btrim(concat_ws(' ', dp.brand, dp.name))) AS full_label
    FROM scope_teams st
    JOIN org_gear.drone_parts dp
      ON dp.team_id = st.team_id
    WHERE lower(COALESCE(dp.status, '')) = 'broken'
      AND COALESCE(dp.name, '') <> ''
  ),

  report_groups AS (
    SELECT
      dr.team_id,
      dr.team_name,
      dr.bucket,
      dr.part_label        AS label,
      count(*)             AS reports,
      COALESCE(sum(dr.cost), 0) AS cost,
      bool_or(public.org_is_crash_reason(dr.reason_lc)) AS has_crash_reason
    FROM deduped_reports dr
    GROUP BY dr.team_id, dr.team_name, dr.bucket, dr.part_label
  ),

  broken_groups AS (
    SELECT
      b.team_id,
      b.team_name,
      b.bucket,
      COALESCE(
        (SELECT rg.label
           FROM report_groups rg
          WHERE rg.team_id = b.team_id
            AND rg.bucket = b.bucket
            AND (lower(rg.label) = b.part_label
                 OR lower(rg.label) = b.full_label)
          ORDER BY rg.reports DESC
          LIMIT 1),
        b.part_label
      ) AS label,
      count(*) AS broken
    FROM broken b
    GROUP BY b.team_id, b.team_name, b.bucket, 4
  ),

  event_groups AS (
    SELECT
      COALESCE(rg.team_id, bg.team_id)     AS team_id,
      COALESCE(rg.team_name, bg.team_name) AS team_name,
      COALESCE(rg.bucket, bg.bucket)       AS bucket,
      COALESCE(rg.label, bg.label)         AS label,
      COALESCE(rg.reports, 0)              AS reports,
      COALESCE(bg.broken, 0)               AS broken_parts,
      COALESCE(rg.cost, 0)                 AS cost,
      COALESCE(rg.has_crash_reason, false) AS has_crash_reason
    FROM report_groups rg
    FULL JOIN broken_groups bg
      ON  bg.team_id  = rg.team_id
      AND bg.bucket   = rg.bucket
      AND bg.label    = rg.label
  )

  SELECT
    eg.team_id,
    eg.team_name,
    eg.bucket,
    eg.label,
    eg.reports::integer,
    eg.broken_parts::integer,
    GREATEST(eg.reports, eg.broken_parts)::integer AS events,
    eg.cost::numeric,
    eg.has_crash_reason AS is_crash,
    COALESCE(d.total_minutes, 0)::bigint AS fleet_minutes,
    COALESCE(d.crash_total, 0)::bigint   AS drone_crashes
  FROM event_groups eg
  LEFT JOIN LATERAL (
    SELECT
      SUM(d.total_minutes) AS total_minutes,
      SUM(d.crash_count)   AS crash_total
    FROM org_gear.drones d
    WHERE d.team_id = eg.team_id
  ) d ON true
  ORDER BY eg.team_name, eg.bucket, events DESC, eg.label;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.team_roles TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_team_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_team(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_team_role(uuid, text, boolean, boolean, boolean)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_team_role(uuid, text, boolean, boolean, boolean)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_team_role(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_team_role(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.assign_member_role(uuid, uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.assign_member_role(uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_member_permission(uuid, uuid, text, boolean)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_member_permission(uuid, uuid, text, boolean)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_squadron_permissions(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_squadron_permissions(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_squadron_analytics(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_view_squadron_analytics(uuid) TO authenticated;

-- set_member_ledger_access (ledger-only switch from 20260921120000) remains
-- for compatibility; set_member_permission('can_view_ledger', ...) is the
-- general path going forward.

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
