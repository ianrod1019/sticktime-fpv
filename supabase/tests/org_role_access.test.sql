-- ============================================================================
-- Test: org_role access matrix — typed roles, RPC permissions, RLS boundaries
--
-- Exercises the contract added by 20260926000000_org_role_typed_rbac against
-- the cast seeded by 20260926010000_seed_org_role_test_accounts:
--
--   1. get_my_org_role returns the exact permission flags per role.
--   2. A non-member gets zero rows; a platform admin gets full flags even
--      with only a 'member' membership row.
--   3. RLS: a plain member can INSERT org gear but cannot set money columns
--      (money_lock trigger); owner/manager can. Non-members see and write
--      nothing (org_member_* policies after the bypass drop).
--   4. The CHECK constraint rejects unknown role labels at the write
--      boundary (the typed-contract guarantee).
--
-- Each block impersonates a seeded account by setting request.jwt.claims to
-- its fixed uuid — the same mechanism PostgREST uses to drive auth.uid().
-- All inserts inside are rolled back: the final block raises to abort the
-- transaction ONLY on a failure path (each check raises its own FAIL first).
-- On success the block completes and the implicit rollback of the wrapping
-- transaction discards the test gear row.
-- ============================================================================

BEGIN;

DO $test$
DECLARE
  c_team     uuid := 'bb000000-0000-4000-8000-000000000001'::uuid;
  c_owner    uuid := 'aa000000-0000-4000-8000-000000000001'::uuid;
  c_manager  uuid := 'aa000000-0000-4000-8000-000000000002'::uuid;
  c_member   uuid := 'aa000000-0000-4000-8000-000000000003'::uuid;
  c_member2  uuid := 'aa000000-0000-4000-8000-000000000004'::uuid;
  c_pilot    uuid := 'aa000000-0000-4000-8000-000000000005'::uuid;
  c_admin    uuid := 'aa000000-0000-4000-8000-000000000006'::uuid;

  v_gear     uuid;
  v_count    int;
  v_role     text;
  v_write    boolean;
  v_money    boolean;
  v_cost     numeric;
  v_manage   boolean;
  v_ledger   boolean;
BEGIN
  ------------------------------------------------------------------------
  -- Helper: impersonate via JWT claims (as PostgREST does)
  ------------------------------------------------------------------------
  -- set_config in each block below; kept inline for clarity.

  ------------------------------------------------------------------------
  -- 1. Owner flags
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  SELECT m.role::text, m.can_write, m.can_edit_money, m.can_manage_members, m.can_view_ledger
    INTO v_role, v_write, v_money, v_manage, v_ledger
  FROM public.get_my_org_role(c_team) m;
  IF v_role IS DISTINCT FROM 'owner' OR v_write IS DISTINCT FROM true
     OR v_money IS DISTINCT FROM true OR v_manage IS DISTINCT FROM true
     OR v_ledger IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 1: owner flags wrong: % % % % %', v_role, v_write, v_money, v_manage, v_ledger;
  END IF;

  ------------------------------------------------------------------------
  -- 2. Manager flags: money + ledger yes, member management no
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  SELECT m.role::text, m.can_write, m.can_edit_money, m.can_manage_members, m.can_view_ledger
    INTO v_role, v_write, v_money, v_manage, v_ledger
  FROM public.get_my_org_role(c_team) m;
  IF v_role IS DISTINCT FROM 'manager' OR v_write IS DISTINCT FROM true
     OR v_money IS DISTINCT FROM true OR v_manage IS DISTINCT FROM false
     OR v_ledger IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 2: manager flags wrong: % % % % %', v_role, v_write, v_money, v_manage, v_ledger;
  END IF;

  ------------------------------------------------------------------------
  -- 3. Plain member: write yes; money/manage/ledger no
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  SELECT m.role::text, m.can_write, m.can_edit_money, m.can_manage_members, m.can_view_ledger
    INTO v_role, v_write, v_money, v_manage, v_ledger
  FROM public.get_my_org_role(c_team) m;
  IF v_role IS DISTINCT FROM 'member' OR v_write IS DISTINCT FROM true
     OR v_money IS DISTINCT FROM false OR v_manage IS DISTINCT FROM false
     OR v_ledger IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 3: member flags wrong: % % % % %', v_role, v_write, v_money, v_manage, v_ledger;
  END IF;

  ------------------------------------------------------------------------
  -- 4. Member with the ledger grant: ledger flips true, nothing else
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member2)::text, true);
  SELECT m.role::text, m.can_write, m.can_edit_money, m.can_manage_members, m.can_view_ledger
    INTO v_role, v_write, v_money, v_manage, v_ledger
  FROM public.get_my_org_role(c_team) m;
  IF v_role IS DISTINCT FROM 'member' OR v_ledger IS DISTINCT FROM true
     OR v_money IS DISTINCT FROM false OR v_manage IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 4: granted member flags wrong: % % % % %', v_role, v_write, v_money, v_manage, v_ledger;
  END IF;

  ------------------------------------------------------------------------
  -- 5. Non-member pilot: zero rows
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_pilot)::text, true);
  SELECT count(*) INTO v_count FROM public.get_my_org_role(c_team);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 5: non-member got % role rows, expected 0', v_count;
  END IF;

  ------------------------------------------------------------------------
  -- 6. Platform admin with a 'member' membership row: real role stays
  --    'member', but every permission flag is overridden to true
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  SELECT m.role::text, m.can_write, m.can_edit_money, m.can_manage_members, m.can_view_ledger
    INTO v_role, v_write, v_money, v_manage, v_ledger
  FROM public.get_my_org_role(c_team) m;
  IF v_role IS DISTINCT FROM 'member' OR v_write IS DISTINCT FROM true
     OR v_money IS DISTINCT FROM true OR v_manage IS DISTINCT FROM true
     OR v_ledger IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 6: admin override flags wrong: % % % % %', v_role, v_write, v_money, v_manage, v_ledger;
  END IF;

  -- 6b. Admin with NO membership row acts as owner (zero-row override)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  SELECT m.role::text INTO v_role
  FROM public.get_my_org_role('cccccccc-0000-4000-8000-000000000009'::uuid) m;
  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'FAIL 6b: admin no-membership override wrong: %', v_role;
  END IF;

  ------------------------------------------------------------------------
  -- 7. get_my_org_memberships: pilot none, member exactly the test squadron
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_pilot)::text, true);
  SELECT count(*) INTO v_count FROM public.get_my_org_memberships();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 7a: pilot sees % memberships, expected 0', v_count;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  SELECT count(*) INTO v_count FROM public.get_my_org_memberships();
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 7b: member sees % memberships, expected 1', v_count;
  END IF;

  ------------------------------------------------------------------------
  -- 8-11 run as the `authenticated` role (RLS applies — the postgres
  -- role owns these tables and would bypass RLS entirely).
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'authenticated', true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  INSERT INTO org_gear.squadron_gear (team_id, gear_type, name, created_by)
  VALUES (c_team, 'quad', 'TEST rbac member gear', auth.uid())
  RETURNING id INTO v_gear;

  SELECT count(*) INTO v_count FROM org_gear.squadron_gear WHERE id = v_gear;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 8: member cannot read back own insert';
  END IF;

  ------------------------------------------------------------------------
  -- 9. Money lock: member setting purchase_cost must be rejected
  ------------------------------------------------------------------------
  BEGIN
    UPDATE org_gear.squadron_gear SET purchase_cost = 123.45 WHERE id = v_gear;
    RAISE EXCEPTION 'FAIL 9: member was allowed to set purchase_cost';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- 10. Manager may set money; owner deletes; member delete denied
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  UPDATE org_gear.squadron_gear SET purchase_cost = 199.99 WHERE id = v_gear;

  SELECT purchase_cost INTO v_cost FROM org_gear.squadron_gear WHERE id = v_gear;
  IF v_cost <> 199.99 THEN
    RAISE EXCEPTION 'FAIL 10a: manager money write did not persist (%)', v_cost;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  -- RLS-blocked DELETEs do not raise: they silently affect zero rows.
  BEGIN
    DELETE FROM org_gear.squadron_gear WHERE id = v_gear;
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL 10b: plain member was allowed to delete shared gear';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- also an acceptable denial
  END;
  SELECT count(*) INTO v_count FROM org_gear.squadron_gear WHERE id = v_gear;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 10b-row: gear row disappeared after denied delete';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  DELETE FROM org_gear.squadron_gear WHERE id = v_gear;
  SELECT count(*) INTO v_count FROM org_gear.squadron_gear WHERE id = v_gear;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 10c: owner delete did not remove the row';
  END IF;

  ------------------------------------------------------------------------
  -- 11. Non-member isolation: pilot sees nothing, writes nothing
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  INSERT INTO org_gear.squadron_gear (team_id, gear_type, name, created_by)
  VALUES (c_team, 'quad', 'TEST rbac isolation gear', auth.uid())
  RETURNING id INTO v_gear;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_pilot)::text, true);
  SELECT count(*) INTO v_count FROM org_gear.squadron_gear WHERE id = v_gear;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 11a: non-member can READ squadron gear';
  END IF;

  BEGIN
    UPDATE org_gear.squadron_gear SET name = 'hacked' WHERE id = v_gear;
    IF NOT FOUND THEN
      NULL; -- update silently matched zero rows: RLS hid the row (good)
    ELSE
      RAISE EXCEPTION 'FAIL 11b: non-member can UPDATE squadron gear';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- also acceptable
  END;

  ------------------------------------------------------------------------
  -- 12. Typed write boundary: CHECK rejects a bogus role label
  -- (back as postgres — RLS on team_members would mask the CHECK)
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'postgres', true);
  BEGIN
    INSERT INTO public.team_members (team_id, user_id, team_role)
    VALUES (c_team, c_pilot, 'superadmin');
    RAISE EXCEPTION 'FAIL 12: bogus team_role accepted';
  EXCEPTION
    WHEN check_violation THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- Done. Discard the rows created along the way.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  DELETE FROM org_gear.squadron_gear WHERE name LIKE 'TEST rbac %';

  RAISE NOTICE 'org_role access matrix: ALL CHECKS PASSED';
END $test$;

ROLLBACK;
