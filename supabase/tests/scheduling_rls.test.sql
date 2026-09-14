-- ============================================================================
-- Test: scheduling module — tier gating, add-on flag, RLS isolation,
--       gear double-booking, person-conflict lookup, status-only assignee
--
-- Exercises 20260914120000_scheduling_module.sql + the seed cast from
-- 20260926010000 (squadron bb…01; tiers: owner=pro, manager=pro,
-- member=free, member2=free, pilot=free, admin=enterprise), plus the
-- scheduling demo seed (add-on purchased; member2 holds can_schedule).
--
-- Access matrix under test:
--   owner   (pro, owner role)      → full calendar + manage
--   manager (pro, manager role)    → full calendar + manage
--   member  (free, plain member)   → BLOCKED (hobbyist)
--   member2 (free, can_schedule)   → BLOCKED (tier outranks the grant)
--   pilot   (free, non-member)     → BLOCKED (not a member)
--   admin   (enterprise, site dev) → full calendar + manage
--
-- School-tier branches are exercised by temporarily flipping tiers/add-on
-- (restored before every exit path). Each check raises its own FAIL; the
-- wrapping transaction rolls everything back either way.
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

  c_drone1   uuid := 'cc000000-0000-4000-8000-000000000001'::uuid;
  c_batt12   uuid := 'cc000000-0000-4000-8000-000000000012'::uuid;
  c_bk_ff01  uuid := 'ff000000-0000-4000-8000-000000000001'::uuid;

  v_enabled  boolean;
  v_tier_ok  boolean;
  v_addon    boolean;
  v_manage   boolean;
  v_count    int;
  v_probe    uuid;
  v_title    text;
BEGIN
  ------------------------------------------------------------------------
  -- 0. Seed preconditions: add-on purchased, member2 holds the grant
  ------------------------------------------------------------------------
  SELECT scheduling_enabled INTO v_addon
  FROM edu.organization_addons WHERE team_id = c_team;
  IF v_addon IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 0a: scheduling add-on not seeded';
  END IF;

  SELECT can_schedule INTO v_addon
  FROM public.team_members
  WHERE team_id = c_team AND user_id = c_member2;
  IF v_addon IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 0b: member2 can_schedule grant not seeded';
  END IF;

  ------------------------------------------------------------------------
  -- 1. Owner (pro tier): enabled, manageable. Pro clears the bar by tier.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  SELECT a.enabled, a.tier_ok, a.addon_purchased, a.can_manage
    INTO v_enabled, v_tier_ok, v_addon, v_manage
  FROM edu.get_scheduling_access(c_team) a;
  IF v_enabled IS DISTINCT FROM true OR v_tier_ok IS DISTINCT FROM true
     OR v_manage IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 1: owner access wrong: % % %', v_enabled, v_tier_ok, v_manage;
  END IF;

  ------------------------------------------------------------------------
  -- 2. Hobbyist members are blocked — tier outranks the can_schedule grant.
  --    member (free, plain) AND member2 (free, instructor grant) both false.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  SELECT a.enabled, a.tier_ok INTO v_enabled, v_tier_ok
  FROM edu.get_scheduling_access(c_team) a;
  IF v_enabled IS DISTINCT FROM false OR v_tier_ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 2a: free member must be blocked: % %', v_enabled, v_tier_ok;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member2)::text, true);
  SELECT a.enabled, a.can_manage INTO v_enabled, v_manage
  FROM edu.get_scheduling_access(c_team) a;
  IF v_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 2b: free member with can_schedule grant must be tier-blocked';
  END IF;

  ------------------------------------------------------------------------
  -- 3. School tier + add-on: members pass, plain members read-only.
  --    (Flip the whole cast to school; the org add-on covers them.)
  ------------------------------------------------------------------------
  UPDATE public.profiles SET tier = 'school' WHERE id IN (c_owner, c_member);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  SELECT a.enabled, a.can_manage INTO v_enabled, v_manage
  FROM edu.get_scheduling_access(c_team) a;
  IF v_enabled IS DISTINCT FROM true OR v_manage IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 3a: school owner with add-on must have manage rights: % %', v_enabled, v_manage;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  SELECT a.enabled, a.can_manage INTO v_enabled, v_manage
  FROM edu.get_scheduling_access(c_team) a;
  IF v_enabled IS DISTINCT FROM true OR v_manage IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 3b: school member with add-on: enabled, not manage: % %', v_enabled, v_manage;
  END IF;

  -- 3c. School WITHOUT the add-on → blocked, and the error says "add-on".
  UPDATE edu.organization_addons SET scheduling_enabled = false WHERE team_id = c_team;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  SELECT a.enabled, a.addon_purchased INTO v_enabled, v_addon
  FROM edu.get_scheduling_access(c_team) a;
  IF v_enabled IS DISTINCT FROM false OR v_addon IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 3c: school without add-on must be blocked';
  END IF;
  BEGIN
    PERFORM edu.get_org_roster(c_team);
    RAISE EXCEPTION 'FAIL 3d: school without add-on reached the roster';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;
  UPDATE edu.organization_addons SET scheduling_enabled = true WHERE team_id = c_team;

  -- Restore the cast's real tiers.
  UPDATE public.profiles SET tier = 'pro'  WHERE id = c_owner;
  UPDATE public.profiles SET tier = 'free' WHERE id = c_member;

  ------------------------------------------------------------------------
  -- 4. Non-member pilot: blocked at the membership layer.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_pilot)::text, true);
  SELECT a.enabled INTO v_enabled FROM edu.get_scheduling_access(c_team) a;
  IF v_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 4a: non-member must be blocked';
  END IF;
  BEGIN
    PERFORM edu.get_schedule_events(c_team, now(), now() + interval '7 days');
    RAISE EXCEPTION 'FAIL 4b: non-member fetched the calendar';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- 5. Enterprise admin: enabled regardless of membership.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  SELECT a.enabled, a.can_manage INTO v_enabled, v_manage
  FROM edu.get_scheduling_access(c_team) a;
  IF v_enabled IS DISTINCT FROM true OR v_manage IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 5: site admin must clear the gate: % %', v_enabled, v_manage;
  END IF;

  ------------------------------------------------------------------------
  -- 6. Gear double-booking: overlapping INSERT for the SAME battery must
  --    die on the exclusion constraint; a back-to-back slot must succeed.
  --    (Runs as owner: full manage rights, so the rejection can only be
  --    the constraint, never RLS.)
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);

  BEGIN
    INSERT INTO edu.schedules
      (organization_id, event_title, assigned_user_id, airframe_id, battery_id,
       start_time, end_time, created_by)
    SELECT organization_id, 'TEST overlap probe', c_manager, airframe_id, battery_id,
           start_time, end_time, c_owner
    FROM edu.schedules WHERE id = c_bk_ff01;
    RAISE EXCEPTION 'FAIL 6a: overlapping battery booking was accepted';
  EXCEPTION
    WHEN exclusion_violation THEN NULL; -- expected: 23P01
  END;

  -- 6b. Back-to-back (starts exactly when ff01 ends) is legal.
  INSERT INTO edu.schedules
    (organization_id, event_title, assigned_user_id, airframe_id, battery_id,
     start_time, end_time, created_by)
  SELECT organization_id, 'TEST back-to-back probe', c_manager, airframe_id, battery_id,
         end_time, end_time + interval '1 hour', c_owner
  FROM edu.schedules WHERE id = c_bk_ff01
  RETURNING id INTO v_probe;

  SELECT count(*) INTO v_count FROM edu.schedules WHERE id = v_probe;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 6b: back-to-back booking did not persist';
  END IF;
  DELETE FROM edu.schedules WHERE id = v_probe;

  ------------------------------------------------------------------------
  -- 7. Cross-tenant gear: booking another org's airframe is rejected.
  --    (Probe org has no fleet — the validator must refuse regardless.)
  ------------------------------------------------------------------------
  BEGIN
    INSERT INTO edu.schedules
      (organization_id, event_title, assigned_user_id, airframe_id,
       start_time, end_time, created_by)
    VALUES (c_team, 'TEST foreign gear probe', c_member,
            'cccccccc-0000-4000-8000-000000000099'::uuid,
            now() + interval '30 days', now() + interval '31 days', c_owner);
    RAISE EXCEPTION 'FAIL 7: foreign/unknown airframe accepted';
  EXCEPTION
    -- The org-ownership trigger fires first (insufficient_privilege); a
    -- missing row would also surface as a plain FK violation.
    WHEN insufficient_privilege THEN NULL;
    WHEN foreign_key_violation THEN NULL;
  END;

  ------------------------------------------------------------------------
  -- 8. Person-conflict lookup: ff01 (member2, Mon 09-11) overlaps a
  --    hypothetical 10-12 booking for member2 → ≥ 1 conflict; owner has none.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  SELECT count(*) INTO v_count
  FROM edu.find_person_conflicts(
    c_member2,
    (SELECT start_time + interval '1 hour' FROM edu.schedules WHERE id = c_bk_ff01),
    (SELECT start_time + interval '3 hours' FROM edu.schedules WHERE id = c_bk_ff01)
  );
  IF v_count < 1 THEN
    RAISE EXCEPTION 'FAIL 8a: person conflict for member2 not found';
  END IF;

  SELECT count(*) INTO v_count
  FROM edu.find_person_conflicts(
    c_owner,
    (SELECT start_time FROM edu.schedules WHERE id = c_bk_ff01),
    (SELECT end_time FROM edu.schedules WHERE id = c_bk_ff01)
  );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 8b: owner should have no conflicts in the ff01 window';
  END IF;

  ------------------------------------------------------------------------
  -- 9. Assignee status-only rule: owner books `member`… wait — member is
  --    free-tier. The assignee path needs no tier, so use member as the
  --    assignee to PROVE the duty-roster path ignores tiers. Status flip
  --    succeeds; a title edit is rejected.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  INSERT INTO edu.schedules
    (organization_id, event_title, assigned_user_id, start_time, end_time, created_by)
  VALUES (c_team, 'TEST assignee probe', c_member,
          now() + interval '20 days', now() + interval '21 days', c_owner)
  RETURNING id INTO v_probe;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  UPDATE edu.schedules SET status = 'checked_in' WHERE id = v_probe;
  SELECT status INTO v_title FROM edu.schedules WHERE id = v_probe;
  IF v_title IS DISTINCT FROM 'checked_in' THEN
    RAISE EXCEPTION 'FAIL 9a: assignee status flip did not persist';
  END IF;

  BEGIN
    UPDATE edu.schedules SET event_title = 'hacked' WHERE id = v_probe;
    RAISE EXCEPTION 'FAIL 9b: assignee was allowed to edit the title';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  -- 9c. …but the same member cannot CREATE bookings (RLS manage gate).
  BEGIN
    INSERT INTO edu.schedules
      (organization_id, event_title, assigned_user_id, start_time, end_time, created_by)
    VALUES (c_team, 'TEST self-serve probe', c_member,
            now() + interval '22 days', now() + interval '23 days', c_member);
    RAISE EXCEPTION 'FAIL 9c: non-manager member created a booking';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- 10. Tenant isolation on the base table: member (blocked from the
  --     module) sees ZERO schedule rows even for their own probe booking…
  --     except the assignee policy grants exactly that row back. Assert
  --     both halves of that contract.
  ------------------------------------------------------------------------
  SELECT count(*) INTO v_count FROM edu.schedules;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 10a: blocked member sees % rows, expected exactly the assignee row', v_count;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_pilot)::text, true);
  SELECT count(*) INTO v_count FROM edu.schedules;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 10b: non-member sees % schedule rows, expected 0', v_count;
  END IF;

  ------------------------------------------------------------------------
  -- 11. Roster PII: blocked members cannot enumerate callsigns.
  ------------------------------------------------------------------------
  BEGIN
    PERFORM edu.get_org_roster(c_team);
    RAISE EXCEPTION 'FAIL 11: blocked member enumerated the roster';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- 12. Add-on switch is admin-only.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_owner)::text, true);
  BEGIN
    PERFORM edu.set_scheduling_addon(c_team, false);
    RAISE EXCEPTION 'FAIL 12: non-admin flipped the add-on flag';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- Done — discard every probe row.
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'postgres', true);
  DELETE FROM edu.schedules WHERE event_title LIKE 'TEST %';

  RAISE NOTICE 'scheduling module: ALL CHECKS PASSED';
END
$test$;

ROLLBACK;
