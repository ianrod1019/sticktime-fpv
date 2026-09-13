-- ============================================================
-- Migration: Effective permission matrix (integration)
--
-- 20260925120000 added per-member capability switches + custom role
-- templates; 20260926000000 added the typed org_role contract with a
-- simpler get_my_org_role (written before the switches existed — it
-- hardcodes can_write = true for every member and has no analytics
-- flag). This migration unifies them:
--
--   * get_my_org_role returns the FULL effective matrix the RLS
--     policies and management RPCs enforce: role switches OR'd with
--     the assigned role template. A NULL member switch means "default
--     access" (gear editing + analytics on, matching the documented
--     matrix and the seeded cast); an explicit false revokes.
--   * get_my_org_memberships exposes the same effective flags per
--     team (plus role_id/role_name), so hubs and dashboards need one
--     call instead of per-team role fetches.
--   * org_gear.can_edit_gear / can_view_squadron_analytics adopt the
--     same NULL-means-default semantics so RLS matches the RPCs.
--   * The failure-analytics RPC gate flips to the same default.
--   * Legacy ledger-only RPCs (superseded by set_member_permission +
--     get_squadron_permissions) are dropped.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. get_my_org_role — the full effective matrix
--    (owner/manager short-circuit; members: own switch OR role template;
--    NULL switch = default; platform staff override everything.)
-- ---------------------------------------------------------------------------
-- Return type gained can_view_analytics → a drop+create, not a replace.
DROP FUNCTION IF EXISTS public.get_my_org_role(uuid);

CREATE FUNCTION public.get_my_org_role(_team_id uuid)
RETURNS TABLE(
  role              org_gear.org_role,
  can_write         boolean,
  can_edit_money    boolean,
  can_manage_members boolean,
  can_view_ledger   boolean,
  can_view_analytics boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'org_gear'
AS $function$
DECLARE
  v_role     text;
  v_admin    boolean;
  v_ledger   boolean;
  v_gear     boolean;
  v_analytics boolean;
BEGIN
  v_admin := org_gear.is_site_admin();

  SELECT tm.team_role,
         COALESCE(tm.can_view_ledger, false) OR COALESCE(r.can_view_ledger, false),
         COALESCE(tm.can_edit_gear, true)    OR COALESCE(r.can_edit_gear, false),
         COALESCE(tm.can_view_analytics, true) OR COALESCE(r.can_view_analytics, false)
    INTO v_role, v_ledger, v_gear, v_analytics
  FROM public.team_members tm
  LEFT JOIN public.team_roles r ON r.id = tm.role_id
  WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL THEN
    IF NOT v_admin THEN
      RETURN; -- zero rows: caller is not a member and not staff
    END IF;
    v_role := 'owner'; -- platform admin acts with full rights
  END IF;

  RETURN QUERY SELECT
    v_role::org_gear.org_role,                   -- CHECK constraint guards labels
    v_admin OR v_role IN ('owner', 'manager') OR v_gear,
    v_admin OR v_role IN ('owner', 'manager'),
    v_admin OR v_role = 'owner',
    v_admin OR v_role IN ('owner', 'manager') OR v_ledger,
    v_admin OR v_role IN ('owner', 'manager') OR v_analytics;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. get_my_org_memberships — effective flags per team (hub/dashboard use)
-- ---------------------------------------------------------------------------
-- Return type gained the effective flags + role columns → drop+create.
DROP FUNCTION IF EXISTS public.get_my_org_memberships();

CREATE FUNCTION public.get_my_org_memberships()
RETURNS TABLE(
  team_id          uuid,
  team_name        text,
  team_description text,
  owner_id         uuid,
  team_role        org_gear.org_role,
  joined_at        timestamp with time zone,
  can_view_ledger  boolean,
  can_edit_gear    boolean,
  can_view_analytics boolean,
  role_id          uuid,
  role_name        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.description, t.owner_id,
         tm.team_role::org_gear.org_role,
         tm.joined_at,
         tm.team_role IN ('owner', 'manager') OR COALESCE(tm.can_view_ledger, false) OR COALESCE(r.can_view_ledger, false),
         tm.team_role IN ('owner', 'manager') OR COALESCE(tm.can_edit_gear, true) OR COALESCE(r.can_edit_gear, false),
         tm.team_role IN ('owner', 'manager') OR COALESCE(tm.can_view_analytics, true) OR COALESCE(r.can_view_analytics, false),
         tm.role_id,
         r.name
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  LEFT JOIN public.team_roles r ON r.id = tm.role_id
  WHERE tm.user_id = auth.uid()
  ORDER BY t.name, tm.joined_at;
$function$;

-- ---------------------------------------------------------------------------
-- 3. RLS-side gates adopt the same NULL-means-default semantics
-- ---------------------------------------------------------------------------
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
      OR COALESCE(tm.can_edit_gear, true)
      OR COALESCE(r.can_edit_gear, false)
    FROM public.team_members tm
    LEFT JOIN public.team_roles r ON r.id = tm.role_id
    WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  ), false) OR org_gear.is_site_admin();
$$;

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
      OR COALESCE(tm.can_view_analytics, true)
      OR COALESCE(r.can_view_analytics, false)
    FROM public.team_members tm
    LEFT JOIN public.team_roles r ON r.id = tm.role_id
    WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  ), false) OR org_gear.is_site_admin();
$$;

-- ---------------------------------------------------------------------------
-- 4. Failure-analytics RPC: flip its member gate to the same default
--    (surgical patch of the applied function — the 180-line body is
--    otherwise unchanged from 20260925120000's restatement).
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.get_org_failure_analytics(uuid)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'get_org_failure_analytics(uuid) not found';
  END IF;
  IF position('COALESCE(tm.can_view_analytics, false)' in v_def) = 0 THEN
    RAISE EXCEPTION 'analytics gate: expected COALESCE guard not found';
  END IF;
  v_def := replace(v_def, 'COALESCE(tm.can_view_analytics, false)',
                           'COALESCE(tm.can_view_analytics, true)');
  EXECUTE v_def;
END
$patch$;

-- ---------------------------------------------------------------------------
-- 5. Retire the ledger-only management RPCs (superseded by
--    set_member_permission / get_squadron_permissions from 20260925120000).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_member_ledger_access(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.get_squadron_ledger_access(uuid);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
