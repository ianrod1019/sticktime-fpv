-- ============================================================
-- Migration: Typed org_role RBAC
--
-- team_members.team_role was free-form text compared with string
-- literals in six client sites and three SQL helpers. This adds the
-- typed role contract WITHOUT converting the column in place: the one
-- RLS policy and ~7 SECURITY DEFINER functions that compare team_role
-- against text literals would break under an in-place enum conversion,
-- which is too much live surface for one migration.
--
-- 1. org_gear.org_role enum ('owner','manager','member') — the typed
--    INTERFACE of the new RPCs and the client contract.
-- 2. CHECK constraint on team_members.team_role — the write boundary:
--    nothing outside the three roles can enter the table. The column
--    type conversion becomes a zero-risk follow-up once consumers
--    migrate to get_my_org_role.
-- 3. get_my_org_role(_team_id) — the client's single source of truth:
--    { role, can_write, can_edit_money, can_manage_members,
--      can_view_ledger }. Mirrors org_gear.team_has_money_access and
--    can_view_squadron_ledger exactly; site admins/devs override.
-- 4. get_my_org_memberships() — the teams+team_members join the
--    hanger/ledger/analytics hubs each re-implement inline.
--
-- Both RPCs are SECURITY DEFINER with pinned search_path and execute
-- granted to authenticated (house style per 20260921120000).
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. The enum — typed interface of the role RPCs
-- ---------------------------------------------------------------------------
CREATE TYPE org_gear.org_role AS ENUM ('owner', 'manager', 'member');

-- ---------------------------------------------------------------------------
-- 2. The write boundary: constrain the stored role values
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_team_role_check
  CHECK (team_role IN ('owner', 'manager', 'member'))
  NOT VALID;

ALTER TABLE public.team_members
  VALIDATE CONSTRAINT team_members_team_role_check;

-- ---------------------------------------------------------------------------
-- 3. Client-facing role check. Returns the caller's org role plus the
--    resolved permission flags — the exact matrix the UI renders from.
--    SECURITY DEFINER because org_gear.team_role() already is.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_org_role(_team_id uuid)
RETURNS TABLE(
  role org_gear.org_role,
  can_write boolean,
  can_edit_money boolean,
  can_manage_members boolean,
  can_view_ledger boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
DECLARE
  v_role  text;
  v_admin boolean;
  v_ledger_grant boolean;
BEGIN
  v_admin := org_gear.is_site_admin();

  SELECT tm.team_role, COALESCE(tm.can_view_ledger, false)
    INTO v_role, v_ledger_grant
  FROM public.team_members tm
  WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL THEN
    IF NOT v_admin THEN
      RETURN; -- zero rows: caller is not a member and not staff
    END IF;
    v_role := 'owner'; -- platform admin with no membership row acts as owner
  END IF;
  -- An admin WITH a membership row keeps their real squadron role in the
  -- `role` column; their admin powers show up as the flag overrides below.

  RETURN QUERY SELECT
    v_role::org_gear.org_role, -- safe: CHECK constraint guards the labels
    true,                      -- any role (and admin) writes gear
    v_admin OR v_role IN ('owner', 'manager'),
    v_admin OR v_role = 'owner',
    v_admin OR v_role IN ('owner', 'manager') OR v_ledger_grant;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Memberships for the hub pages: the squadron plus the caller's role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_org_memberships()
RETURNS TABLE(
  team_id uuid,
  team_name text,
  team_description text,
  owner_id uuid,
  team_role org_gear.org_role,
  joined_at timestamptz,
  can_view_ledger boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.description, t.owner_id,
         tm.team_role::org_gear.org_role, tm.joined_at,
         COALESCE(tm.can_view_ledger, false)
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.user_id = auth.uid()
  ORDER BY t.name, tm.joined_at;
$$;

-- ---------------------------------------------------------------------------
-- 5. Execute grants (authenticated only, matching house style)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_my_org_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_org_memberships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_org_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_org_memberships() TO authenticated;
