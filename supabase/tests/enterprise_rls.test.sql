-- ============================================================================
-- Test: enterprise plane — RLS matrix, lockdown triggers, RPC guards
--
-- Exercises 20260927100000–20260927100400 against the cast seeded by
-- 20260926010000 + 20260927100400:
--
--   district-admin@test.sticktime  billing owner of Tulsa STEM District
--   manager@test.sticktime         squadron_admin of Central High
--   owner@test.sticktime           squadron_admin of North High
--   member@test.sticktime          pilot at Central High
--   district-admin2@…              billing owner of Single Prop (standard)
--   pilot@test.sticktime           no enterprise org at all
--
-- Impersonation = set_config('request.jwt.claims', …, true), exactly as
-- PostgREST drives auth.uid(). Every check raises FAIL on violation;
-- the wrapping transaction is rolled back either way.
-- ============================================================================

BEGIN;

DO $test$
DECLARE
  c_district_admin uuid := 'aa000000-0000-4000-8000-000000000010'::uuid;
  c_district_admin2 uuid := 'aa000000-0000-4000-8000-000000000011'::uuid;
  c_manager uuid := 'aa000000-0000-4000-8000-000000000002'::uuid;
  c_owner uuid := 'aa000000-0000-4000-8000-000000000001'::uuid;
  c_member uuid := 'aa000000-0000-4000-8000-000000000003'::uuid;
  c_outsider uuid := 'aa000000-0000-4000-8000-000000000005'::uuid;

  c_enterprise uuid := 'ee000000-0000-4000-8000-00000000000a'::uuid;
  c_org_ch uuid := 'ee000000-0000-4000-8000-0000000000c1'::uuid;  -- Central High
  c_org_nh uuid := 'ee000000-0000-4000-8000-0000000000c2'::uuid;  -- North High
  c_team_ch uuid := 'bb000000-0000-4000-8000-0000000000c1'::uuid;
  c_team_nh uuid := 'bb000000-0000-4000-8000-0000000000c2'::uuid;

  v_count bigint;
  v_text text;
  v_uuid uuid;
BEGIN
  ------------------------------------------------------------------------
  -- 1. Role resolution (ent_effective_role)
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_district_admin)::text, true);
  IF public.ent_effective_role(c_org_ch) IS DISTINCT FROM 'district_admin' THEN
    RAISE EXCEPTION 'FAIL 1a: billing owner is not district_admin';
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_manager)::text, true);
  IF public.ent_effective_role(c_org_ch) IS DISTINCT FROM 'squadron_admin' THEN
    RAISE EXCEPTION 'FAIL 1b: team manager is not squadron_admin';
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_member)::text, true);
  IF public.ent_effective_role(c_org_ch) IS DISTINCT FROM 'pilot' THEN
    RAISE EXCEPTION 'FAIL 1c: plain member is not pilot';
  END IF;
  IF public.ent_effective_role(c_org_nh) IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'FAIL 1d: Central member resolved in North High';
  END IF;

  ------------------------------------------------------------------------
  -- 2. Discovery RPC — membership rows per caller
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_district_admin)::text, true);
  SELECT count(*) INTO v_count FROM public.get_my_enterprises();
  IF v_count <> 2 THEN -- Central + North org rows
    RAISE EXCEPTION 'FAIL 2a: district admin discovery rows = %, want 2', v_count;
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_member)::text, true);
  SELECT count(*) INTO v_count FROM public.get_my_enterprises();
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 2b: pilot discovery rows = %, want 1', v_count;
  END IF;

  ------------------------------------------------------------------------
  -- 3. Metrics RPC — aggregate only; guard blocks outsiders
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_district_admin)::text, true);
  SELECT (public.get_enterprise_metrics(c_enterprise)
          ->'totals'->>'active_pilots')::bigint INTO v_count;
  IF v_count IS NULL OR v_count < 3 THEN
    RAISE EXCEPTION 'FAIL 3a: metrics active_pilots = %, want >= 3', v_count;
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_outsider)::text, true);
  BEGIN
    PERFORM public.get_enterprise_metrics(c_enterprise);
    RAISE EXCEPTION 'FAIL 3b: outsider read district metrics';
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- 4. Policy writes — pilots denied, admins allowed (RLS + RPC)
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_member)::text, true);
  BEGIN
    INSERT INTO public.enterprise_policies
      (enterprise_id, org_id, policy_key, enabled)
    VALUES (c_enterprise, c_org_ch, 'lock_inventory', true);
    RAISE EXCEPTION 'FAIL 4a: pilot inserted a policy';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; -- RLS
  END;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_manager)::text, true);
  PERFORM public.set_org_policies(c_org_ch,
    '[{"key":"lock_inventory","enabled":true}]'::jsonb);
  IF NOT public.ent_policy_active(c_org_ch, 'lock_inventory') THEN
    RAISE EXCEPTION 'FAIL 4b: squadron_admin set_org_policies had no effect';
  END IF;
  -- Restore the seeded state.
  PERFORM public.set_org_policies(c_org_ch,
    '[{"key":"lock_inventory","enabled":false}]'::jsonb);

  ------------------------------------------------------------------------
  -- 5. Seat cap — 26th member of a standard-tier org is rejected
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'postgres', true);
  DECLARE
    v_i int;
    v_standard_org uuid := 'ee000000-0000-4000-8000-0000000000c3'::uuid;
    v_standard_team uuid := 'bb000000-0000-4000-8000-0000000000c3'::uuid;
  BEGIN
    FOR v_i IN 1..24 LOOP
      BEGIN
        INSERT INTO public.team_members (team_id, user_id, team_role)
        VALUES (v_standard_team,
                ('99000000-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid,
                'member');
      EXCEPTION WHEN unique_violation THEN NULL; -- idempotent re-runs
      END;
    END LOOP;

    SELECT count(*) INTO v_count FROM public.team_members
     WHERE team_id = v_standard_team;
    IF v_count < 25 THEN
      RAISE EXCEPTION 'FAIL 5-setup: standard team has % members, want 25', v_count;
    END IF;

    BEGIN
      INSERT INTO public.team_members (team_id, user_id, team_role)
      VALUES (v_standard_team,
              '99000000-0000-4000-8000-0000000000ff'::uuid, 'member');
      RAISE EXCEPTION 'FAIL 5a: seat cap not enforced on 26th member';
    EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
    END;
  END;
  PERFORM set_config('role', 'authenticated', true);

  ------------------------------------------------------------------------
  -- 6. lock_profile_settings — North High pilot cannot update settings
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_owner)::text, true);
  BEGIN
    UPDATE public.pilot_settings
       SET bio = 'hijacked'::text
     WHERE user_id = c_owner;
    RAISE EXCEPTION 'FAIL 6a: locked pilot updated pilot_settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
  END;

  -- Same write succeeds where profiles are open (Central High pilot).
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_member)::text, true);
  UPDATE public.pilot_settings
     SET updated_at = now()
   WHERE user_id = c_member;

  -- And a squadron admin is NEVER profile-locked (only pilots are).
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_manager)::text, true);
  UPDATE public.pilot_settings
     SET updated_at = now()
   WHERE user_id = c_manager;

  ------------------------------------------------------------------------
  -- 7. Flight gates — preflight + firmware enforced at Central High
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_member)::text, true);

  BEGIN
    INSERT INTO public.sessions (user_id, session_type, flown_on,
                                 duration_minutes, preflight_completed,
                                 firmware_version)
    VALUES (c_member, 'real'::session_type, to_char(now(), 'YYYY-MM-DD'),
            10, false, '4.6.0');
    RAISE EXCEPTION 'FAIL 7a: session inserted without preflight';
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
  END;

  BEGIN
    INSERT INTO public.sessions (user_id, session_type, flown_on,
                                 duration_minutes, preflight_completed,
                                 firmware_version)
    VALUES (c_member, 'real'::session_type, to_char(now(), 'YYYY-MM-DD'),
            10, true, '4.4.9');
    RAISE EXCEPTION 'FAIL 7b: session inserted below firmware floor';
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
  END;

  -- Compliant insert passes.
  INSERT INTO public.sessions (user_id, session_type, flown_on,
                               duration_minutes, preflight_completed,
                               firmware_version)
  VALUES (c_member, 'real'::session_type, to_char(now(), 'YYYY-MM-DD'),
          10, true, '4.6.0');
  SELECT session_id INTO v_uuid FROM public.squadron_meetups
   WHERE id = 'ff000000-0000-4000-8000-0000000000m1'::uuid;
  IF v_uuid IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7c: seeded meetup already linked a session';
  END IF;

  ------------------------------------------------------------------------
  -- 8. Meetup writes — member denied, squadron_admin allowed
  ------------------------------------------------------------------------
  BEGIN
    PERFORM public.create_meetup(
      c_org_ch, 'member event', now(), now() + interval '1 hour');
    RAISE EXCEPTION 'FAIL 8a: pilot created a meetup';
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
  END;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_manager)::text, true);
  v_uuid := public.create_meetup(
    c_org_ch, 'TEST meetup %', now(), now() + interval '1 hour');
  IF v_uuid IS NULL THEN
    RAISE EXCEPTION 'FAIL 8b: squadron_admin meetup creation failed';
  END IF;

  ------------------------------------------------------------------------
  -- 9. RSVPs — own-only, org-only
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_member)::text, true);
  PERFORM public.respond_to_meetup(v_uuid, 'attending');

  BEGIN
    PERFORM public.respond_to_meetup(
      'ff000000-0000-4000-8000-0000000000m2'::uuid, 'attending');
    RAISE EXCEPTION 'FAIL 9a: member RSVPd another org''s meetup';
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
  END;

  -- RSVP rows are visible only to members of the org.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_outsider)::text, true);
  SELECT count(*) INTO v_count
    FROM public.meetup_rsvps r
    JOIN public.squadron_meetups m ON m.id = r.meetup_id
   WHERE m.organization_id = c_org_ch;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 9b: outsider sees org RSVP rows';
  END IF;

  ------------------------------------------------------------------------
  -- 10. lock_inventory — Central High pilot cannot write org fleet
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_manager)::text, true);
  PERFORM public.set_org_policies(c_org_ch,
    '[{"key":"lock_inventory","enabled":true}]'::jsonb);

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_member)::text, true);
  BEGIN
    INSERT INTO org_gear.drones (team_id, user_id, name)
    VALUES (c_team_ch, c_member, 'TEST locked build');
    RAISE EXCEPTION 'FAIL 10a: pilot wrote org fleet under lock';
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
  END;

  -- squadron_admin still writes.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', c_manager)::text, true);
  INSERT INTO org_gear.drones (team_id, user_id, name)
  VALUES (c_team_ch, c_manager, 'TEST admin build');
  DELETE FROM org_gear.drones WHERE name = 'TEST admin build';

  -- Cleanup the lock (seeded state was off).
  PERFORM public.set_org_policies(c_org_ch,
    '[{"key":"lock_inventory","enabled":false}]'::jsonb);

  ------------------------------------------------------------------------
  -- Done. Discard everything created along the way.
  ------------------------------------------------------------------------
  RAISE NOTICE 'enterprise RLS matrix: ALL CHECKS PASSED';
END $test$;

ROLLBACK;
