-- ============================================================
-- Migration: Member role administration (batch, backend-enforced)
--
-- The manage page could already flip per-member switches and assign
-- role templates (set_member_permission / assign_member_role,
-- 20260925120000) but nothing could change a member's org_role
-- (member <-> manager): the only path was a direct row UPDATE, which
-- RLS restricts to the team owner, so managers and the UI had no
-- route. This migration adds the administration RPCs, batch-first
-- and atomic (one statement = all-or-nothing):
--
--   * set_member_org_role_batch(_team_id, _user_ids[], _new_role):
--     caller must be the team OWNER (teams.owner_id = auth.uid()) or
--     a platform admin. Managers cannot promote/demote. Refuses the
--     team-owner row itself. On transition the member's switch
--     columns are reset to their defaults so the effective matrix
--     (20260926120000) stays the single source of truth. The
--     team_members.team_role CHECK constraint remains the write
--     boundary for role labels.
--   * set_member_permissions_batch(_team_id, _user_ids[], _permission,
--     _granted): the guard of the singular set_member_permission,
--     applied to many members in one atomic call.
--   * set_member_org_role (singular) delegates to the batch so there
--     is exactly one enforcement path.
--
-- The client never writes team_members directly; every change flows
-- through these guarded RPCs.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Batch role change (promote / demote)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_member_org_role_batch(
  _team_id  uuid,
  _user_ids uuid[],
  _new_role org_gear.org_role
)
RETURNS integer -- rows updated
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $function$
DECLARE
  v_caller_role text;
  v_is_owner    boolean;
  v_is_admin    boolean;
  v_bad         int;
  v_updated     int;
BEGIN
  v_is_admin := org_gear.is_site_admin();

  SELECT tm.team_role INTO v_caller_role
  FROM public.team_members tm
  WHERE tm.team_id = _team_id AND tm.user_id = auth.uid();

  SELECT EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = _team_id AND t.owner_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT (v_is_owner OR v_is_admin) THEN
    RAISE EXCEPTION
      'Access denied: only the squadron owner can change member roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No members selected'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The team owner's own membership row defines their ownership; it may
  -- not be demoted (use squadron dissolve / ownership transfer instead).
  SELECT count(*) INTO v_bad
  FROM unnest(_user_ids) u(uid)
  JOIN public.teams t ON t.id = _team_id AND t.owner_id = u.uid;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'The squadron owner''s own role cannot be changed here'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every targeted user must be a member of this squadron: fail the whole
  -- batch rather than applying a subset (atomicity).
  SELECT count(*) INTO v_bad
  FROM unnest(_user_ids) u(uid)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id AND tm.user_id = u.uid
  );
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% selected user(s) are not members of this squadron', v_bad
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Reset the per-member switches on transition: owner/manager rows are
  -- role-gated anyway, and a returning member must get the documented
  -- default access, not stale explicit grants. can_edit_gear /
  -- can_view_analytics are nullable (NULL = default-on); can_view_ledger
  -- is NOT NULL with default-off, where false is equivalent to the NULL
  -- default under the matrix's COALESCE(..., false).
  UPDATE public.team_members tm
  SET team_role    = _new_role,
      role_id      = NULL,
      can_edit_gear    = NULL,
      can_view_analytics = NULL,
      can_view_ledger    = false
  WHERE tm.team_id = _team_id
    AND tm.user_id = ANY (_user_ids);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> array_length(_user_ids, 1) THEN
    RAISE EXCEPTION 'Batch incomplete: updated % of % rows', v_updated, array_length(_user_ids, 1)
      USING ERRCODE = 'internal_error';
  END IF;

  RETURN v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 1b. squadron_gear write policies adopt can_edit_gear: the 20260925120000
--     loop tightened the 11 asset tables but skipped squadron_gear (its
--     policies are individually named), so an explicitly revoked member
--     could still INSERT/UPDATE shared gear. Same semantics as the loop:
--     writes require can_edit_gear; reads stay member-wide; checkout
--     ownership preserved on UPDATE; INSERT attribution preserved.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Squadron gear insertable by team members" ON org_gear.squadron_gear;
CREATE POLICY "Squadron gear insertable by team members"
  ON org_gear.squadron_gear
  FOR INSERT
  WITH CHECK (
    org_gear.can_edit_gear(team_id)
    AND (created_by = auth.uid() OR created_by IS NULL)
  );

DROP POLICY IF EXISTS "Squadron gear updatable by team members" ON org_gear.squadron_gear;
CREATE POLICY "Squadron gear updatable by team members"
  ON org_gear.squadron_gear
  FOR UPDATE
  USING (org_gear.can_edit_gear(team_id))
  WITH CHECK (
    org_gear.can_edit_gear(team_id)
    AND ((status <> 'checked_out'::text) OR (checked_out_by = auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 2. Singular role change — delegate to the batch (one enforcement path)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_member_org_role(
  _team_id  uuid,
  _user_id  uuid,
  _new_role org_gear.org_role
)
RETURNS integer
LANGUAGE sql
SET search_path = public, org_gear
AS $function$
  SELECT public.set_member_org_role_batch(_team_id, ARRAY[_user_id], _new_role);
$function$;

-- ---------------------------------------------------------------------------
-- 3. Batch per-member switch toggle (same guard as set_member_permission)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_member_permissions_batch(
  _team_id    uuid,
  _user_ids   uuid[],
  _permission text,
  _granted    boolean
)
RETURNS integer -- rows updated
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $function$
DECLARE
  v_caller_role text;
  v_staff       boolean;
  v_is_admin    boolean;
  v_staff_hits  int;
  v_updated     int;
BEGIN
  v_is_admin := org_gear.is_site_admin();

  SELECT tm.team_role INTO v_caller_role
  FROM public.team_members tm
  WHERE tm.team_id = _team_id AND tm.user_id = auth.uid();

  v_staff := v_caller_role IN ('owner', 'manager');
  IF NOT (v_staff OR v_is_admin) THEN
    RAISE EXCEPTION
      'Access denied: only the squadron owner and managers can set permissions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No members selected'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  CASE _permission
    WHEN 'can_edit_gear', 'can_view_analytics', 'can_view_ledger' THEN NULL;
    ELSE
      RAISE EXCEPTION 'Unknown permission: %', _permission
        USING ERRCODE = 'invalid_parameter_value';
  END CASE;

  -- Owner/manager rows are role-gated ("Always on"); flipping their
  -- switches is meaningless, so refuse rather than write dead values.
  SELECT count(*) INTO v_staff_hits
  FROM public.team_members tm
  WHERE tm.team_id = _team_id
    AND tm.user_id = ANY (_user_ids)
    AND tm.team_role IN ('owner', 'manager');
  IF v_staff_hits > 0 THEN
    RAISE EXCEPTION 'Owners and managers always have full access'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.team_members tm
  SET can_edit_gear    = CASE WHEN _permission = 'can_edit_gear'    THEN _granted ELSE tm.can_edit_gear    END,
      can_view_analytics = CASE WHEN _permission = 'can_view_analytics' THEN _granted ELSE tm.can_view_analytics END,
      can_view_ledger    = CASE WHEN _permission = 'can_view_ledger'    THEN _granted ELSE tm.can_view_ledger    END
  WHERE tm.team_id = _team_id
    AND tm.user_id = ANY (_user_ids);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> array_length(_user_ids, 1) THEN
    RAISE EXCEPTION 'Batch incomplete: updated % of % rows', v_updated, array_length(_user_ids, 1)
      USING ERRCODE = 'internal_error';
  END IF;

  RETURN v_updated;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Grants + schema cache reload
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.set_member_org_role_batch(uuid, uuid[], org_gear.org_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_member_org_role_batch(uuid, uuid[], org_gear.org_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_member_org_role(uuid, uuid, org_gear.org_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_member_org_role(uuid, uuid, org_gear.org_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_member_permissions_batch(uuid, uuid[], text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_member_permissions_batch(uuid, uuid[], text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
