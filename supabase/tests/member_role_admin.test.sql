-- ============================================================================
-- Test: member role administration — batch RPCs, explicit revocations, guards
--
-- Exercises the administration surface added by
-- 20260926140000_member_role_rpc.sql against the cast seeded by
-- 20260926010000_seed_org_role_test_accounts (RBAC Test Squadron):
--
--   1. Owner batch-promotes BOTH members to manager in one call:
--      get_my_org_role flags flip for both; batch-demote restores.
--   2. Explicit-false revocation: set_member_permission('can_edit_gear',
--      false) → the member's INSERT into org_gear.squadron_gear is denied
--      by RLS (can_edit_gear NULL-default flipped off) and get_my_org_role
--      reports can_write = false; re-grant restores the default.
--   3. Batch switch grant: ledger granted to both members in one call.
--   4. Denials, all server-side:
--        - a manager calling set_member_org_role_batch
--        - a member calling either batch RPC
--        - a batch containing the team-owner row (atomic: nothing applied)
--        - a batch containing a non-member (atomic: nothing applied)
--        - an unknown permission label
--        - flipping switches on an owner/manager row
--
-- On success the run ends with the expected exception
-- 'MARKER-STOP-ALL-PASSED'; any other error is a failed assertion.
--
-- Impersonation matches the org_role_access.test.sql mechanism: set
-- request.jwt.claims to a seeded uuid (as PostgREST does) and, where RLS
-- must apply, set role 'authenticated'. Everything rolls back.
-- ============================================================================

BEGIN;

DO $test$
DECLARE
  c_team    uuid := 'bb000000-0000-4000-8000-000000000001'::uuid;
  c_owner   uuid := 'aa000000-0000-4000-8000-000000000001'::uuid;
  c_manager uuid := 'aa000000-0000-4000-8000-000000000002'::uuid;
  c_member  uuid := 'aa000000-0000-4000-8000-000000000003'::uuid;
  c_member2 uuid := 'aa000000-0000-4000-8000-000000000004'::uuid;
  c_pilot   uuid := 'aa000000-0000-4000-8000-000000000005'::uuid;

  v_members uuid[] := ARRAY[c_member, c_member2];
  v_count   int;
  v_write   boolean;
  v_money   boolean;
  v_ledger  boolean;
  v_gear    boolean;
  v_role    text;
BEGIN
  ------------------------------------------------------------------------
  -- 0. Fixture normalization: parallel actors on this shared dev database
  --    may have experimented on the test squadron. Reset the cast to the
  --    documented seed baseline before asserting (rolled back with the tx).
  ------------------------------------------------------------------------
  UPDATE public.team_members
  SET team_role = 'member', role_id = NULL,
      can_edit_gear = NULL, can_view_analytics = NULL, can_view_ledger = false
  WHERE team_id = c_team AND user_id IN (c_member, c_member2);

  UPDATE public.team_members SET team_role = 'owner'
  WHERE team_id = c_team AND user_id = c_owner;

  UPDATE public.team_members SET team_role = 'manager'
  WHERE team_id = c_team AND user_id = c_manager;

  ------------------------------------------------------------------------
  -- 1. Owner batch-promotes both members to manager
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  PERFORM public.set_member_org_role_batch(c_team, v_members, 'manager');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  SELECT m.role::text, m.can_edit_money, m.can_view_ledger
    INTO v_role, v_money, v_ledger
  FROM public.get_my_org_role(c_team) m;
  IF v_role IS DISTINCT FROM 'manager' OR v_money IS DISTINCT FROM true
     OR v_ledger IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 1a: member1 flags after batch promote: % % %', v_role, v_money, v_ledger;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member2)::text, true);
  SELECT m.role::text, m.can_edit_money
    INTO v_role, v_money
  FROM public.get_my_org_role(c_team) m;
  IF v_role IS DISTINCT FROM 'manager' OR v_money IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 1b: member2 flags after batch promote: % %', v_role, v_money;
  END IF;

  -- 1c. Batch-demote both back in one call; switches must come back NULLed
  --     (member2's pre-existing ledger grant must NOT survive the round trip).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  PERFORM public.set_member_org_role_batch(c_team, v_members, 'member');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member2)::text, true);
  SELECT m.role::text, m.can_view_ledger, m.can_edit_money
    INTO v_role, v_ledger, v_money
  FROM public.get_my_org_role(c_team) m;
  IF v_role IS DISTINCT FROM 'member' OR v_ledger IS DISTINCT FROM false
     OR v_money IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 1c: member2 flags after batch demote: % % %', v_role, v_ledger, v_money;
  END IF;

  ------------------------------------------------------------------------
  -- 2. Explicit-false revocation branch (member, NULL-default flipped off)
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  PERFORM public.set_member_permissions_batch(c_team, ARRAY[c_member], 'can_edit_gear', false);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);

  SELECT m.can_write INTO v_write FROM public.get_my_org_role(c_team) m;
  IF v_write IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 2a: RPC still reports can_write=true after explicit revoke';
  END IF;

  -- RLS section: the member can no longer insert org gear.
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO org_gear.squadron_gear (team_id, gear_type, name, created_by)
    VALUES (c_team, 'quad', 'TEST revocation probe', auth.uid());
    RAISE EXCEPTION 'FAIL 2b: explicitly revoked member could still INSERT gear';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  -- 2c. Re-grant: default access restored.
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  PERFORM public.set_member_permissions_batch(c_team, ARRAY[c_member], 'can_edit_gear', true);

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  DELETE FROM org_gear.squadron_gear WHERE name = 'TEST revocation probe' AND false; -- no-op keep
  INSERT INTO org_gear.squadron_gear (team_id, gear_type, name, created_by)
  VALUES (c_team, 'quad', 'TEST regrant probe', auth.uid());
  DELETE FROM org_gear.squadron_gear WHERE name = 'TEST regrant probe';

  PERFORM set_config('role', 'postgres', true);

  ------------------------------------------------------------------------
  -- 3. Batch switch grant: ledger to BOTH members in one call
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  PERFORM public.set_member_permissions_batch(c_team, v_members, 'can_view_ledger', true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  SELECT m.can_view_ledger INTO v_ledger FROM public.get_my_org_role(c_team) m;
  IF v_ledger IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 3a: member1 ledger not granted by batch';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member2)::text, true);
  SELECT m.can_view_ledger INTO v_ledger FROM public.get_my_org_role(c_team) m;
  IF v_ledger IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 3b: member2 ledger not granted by batch';
  END IF;

  ------------------------------------------------------------------------
  -- 4. Denials (server-side guards)
  ------------------------------------------------------------------------

  -- 4a. Manager may flip switches but may NOT change roles.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  BEGIN
    PERFORM public.set_member_org_role_batch(c_team, v_members, 'manager');
    RAISE EXCEPTION 'FAIL 4a: manager was allowed to change member roles';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  -- 4b. Member denied both RPCs.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  BEGIN
    PERFORM public.set_member_permissions_batch(c_team, ARRAY[c_member2], 'can_view_ledger', true);
    RAISE EXCEPTION 'FAIL 4b: member was allowed to set permissions';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  BEGIN
    PERFORM public.set_member_org_role_batch(c_team, ARRAY[c_member2], 'member');
    RAISE EXCEPTION 'FAIL 4c: member was allowed to change roles';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  -- 4d. Batch containing the team-owner row: refused atomically.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  BEGIN
    PERFORM public.set_member_org_role_batch(c_team, array_append(v_members, c_owner), 'member');
    RAISE EXCEPTION 'FAIL 4d: batch including the owner row was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL; -- expected
  END;

  SELECT count(*) INTO v_count FROM public.team_members
  WHERE team_id = c_team AND user_id = c_member AND team_role = 'manager';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 4d-atomic: member role partially applied (% left as manager)', v_count;
  END IF;

  -- 4e. Batch containing a non-member: refused atomically.
  BEGIN
    PERFORM public.set_member_org_role_batch(c_team, array_append(v_members, c_pilot), 'manager');
    RAISE EXCEPTION 'FAIL 4e: batch including a non-member was accepted';
  EXCEPTION
    WHEN no_data_found THEN NULL; -- expected
  END;

  SELECT count(*) INTO v_count FROM public.team_members
  WHERE team_id = c_team AND user_id = c_member AND team_role = 'manager';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 4e-atomic: member role partially applied (% left as manager)', v_count;
  END IF;

  -- 4f. Unknown permission label rejected.
  BEGIN
    PERFORM public.set_member_permissions_batch(c_team, v_members, 'can_fly_without_goggles', true);
    RAISE EXCEPTION 'FAIL 4f: unknown permission accepted';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL; -- expected
  END;

  -- 4g. Switch flips on owner/manager rows refused.
  BEGIN
    PERFORM public.set_member_permissions_batch(c_team, ARRAY[c_manager], 'can_view_ledger', false);
    RAISE EXCEPTION 'FAIL 4g: switch flip on a manager row accepted';
  EXCEPTION
    WHEN check_violation THEN NULL; -- expected
  END;

  -- 4h. Singular delegate agrees with the batch.
  PERFORM public.set_member_org_role(c_team, c_member, 'manager');
  SELECT tm.team_role INTO v_role FROM public.team_members tm
  WHERE tm.team_id = c_team AND tm.user_id = c_member;
  IF v_role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'FAIL 4h: singular delegate did not apply (% )', v_role;
  END IF;
  PERFORM public.set_member_org_role(c_team, c_member, 'member');

  ------------------------------------------------------------------------
  -- Done: restore the seeded baseline for the test squadron (members with
  -- default switches: nullable flags NULL, NOT NULL ledger false), then
  -- raise the completion marker. The wrapping ROLLBACK discards everything.
  --
  -- The marker-exception pattern exists because the Supabase MCP executes
  -- the whole script as one call and surfaces only errors: reaching this
  -- RAISE proves every block above ran. When run through a plain psql/SQL
  -- client the same holds — no FAIL exception means all checks passed.
  ------------------------------------------------------------------------
  UPDATE public.team_members
  SET can_edit_gear = NULL, can_view_analytics = NULL, can_view_ledger = false
  WHERE team_id = c_team AND user_id = ANY (v_members);

  RAISE EXCEPTION 'MARKER-STOP-ALL-PASSED';
END $test$;

ROLLBACK;
