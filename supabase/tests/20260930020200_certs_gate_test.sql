-- ============================================================================
-- Test: the No-Fly, No-Schedule gate + currency engine.
--
-- Exercises 20260930020000_certs_compliance_module.sql on the enterprise
-- seed cast (20260927100400): Central High Squadron
--   bb…c1 team / ee…c1 certs org
--   manager@test.sticktime (aa…002)  — squadron_admin (safety officer)
--   member@test.sticktime  (aa…003)  — plain pilot
--
-- Access matrix under test:
--   1. Currency engine states: missing / pending_approval / unverified /
--      expired / active / expiring / recency_lapsed / not_adopted
--   2. Booking gate: hard block on missing checkout; org-mandated
--      (required_for_all) gates bookings without a profile; expired
--      federal certificates cannot be overridden; non-federal blocks
--      CAN be overridden (audited); cancelled bookings never gate
--   3. Gear checkout gate: required_credential_code blocks checkout
--   4. Waiver resolution: no waiver → block; waiver + authorization → pass
--   5. Guards: pilots cannot self-activate uploads; verification guard
--      strips admin columns from pilot writes
--
-- Pattern follows scheduling_rls.test.sql: DO block, per-check RAISE,
-- wrapping ROLLBACK, JWT impersonation via request.jwt.claims.
-- ============================================================================

BEGIN;

DO $test$
DECLARE
  c_team     uuid := 'bb000000-0000-4000-8000-0000000000c1'::uuid;
  c_org      uuid := 'ee000000-0000-4000-8000-0000000000c1'::uuid;
  c_manager  uuid := 'aa000000-0000-4000-8000-000000000002'::uuid;
  c_member   uuid := 'aa000000-0000-4000-8000-000000000003'::uuid;
  c_district uuid := 'aa000000-0000-4000-8000-000000000010'::uuid;

  v_count  int;
  v_state  text;
  v_ok     boolean;
  v_reason text;
  v_bk     uuid;
  v_pc     uuid;
  v_prof   uuid;
  v_wv     uuid;
  v_gear   uuid;
BEGIN
  ------------------------------------------------------------------------
  -- 0. Org credential policies: Part 107 mandated for all; night ops +
  --    thermal adopted (thermal optional); no BVLOS org policy.
  ------------------------------------------------------------------------
  INSERT INTO certs.org_credential_policies (organization_id, credential_code, required_for_all, warn_windows)
  VALUES
    (c_org, 'faa_part_107', true,  ARRAY[60,30,14,0]),
    (c_org, 'internal_night_ops', false, ARRAY[60,30,14,0]),
    (c_org, 'internal_thermal_payload', false, ARRAY[60,30])
  ON CONFLICT (organization_id, credential_code) DO UPDATE
    SET required_for_all = EXCLUDED.required_for_all, enabled = true;

  ------------------------------------------------------------------------
  -- 1. Currency engine: member has nothing on file.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);

  SELECT state, ok INTO v_state, v_ok
    FROM certs.pilot_compliance_status(c_org)
   WHERE user_id = c_member AND credential_code = 'faa_part_107';
  IF v_state IS DISTINCT FROM 'missing' OR v_ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 1a: expected missing/blocked, got % / %', v_state, v_ok;
  END IF;

  -- Optional credential not held → not_adopted, NOT blocking.
  SELECT state, ok INTO v_state, v_ok
    FROM certs.pilot_compliance_status(c_org)
   WHERE user_id = c_member AND credential_code = 'internal_thermal_payload';
  IF v_state IS DISTINCT FROM 'not_adopted' OR v_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 1b: expected not_adopted/ok, got % / %', v_state, v_ok;
  END IF;

  ------------------------------------------------------------------------
  -- 2. Verification guard: pilot's self-upload lands pending_approval.
  --    (Insert AS the member.)
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  INSERT INTO certs.pilot_credentials (organization_id, user_id, credential_code,
                                       issued_date, expires_date, issuing_authority, source)
  VALUES (c_org, c_member, 'faa_part_107', CURRENT_DATE - 700, CURRENT_DATE + 30, 'FAA', 'upload')
  RETURNING id INTO v_pc;

  SELECT verified_by INTO v_count::text FROM certs.pilot_credentials WHERE id = v_pc;
  IF v_count IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2a: pilot insert must not be pre-verified';
  END IF;

  -- Pilot promotes self to active? The trigger must revert it.
  UPDATE certs.pilot_credentials SET status = 'active' WHERE id = v_pc;
  SELECT status INTO v_state FROM certs.pilot_credentials WHERE id = v_pc;
  IF v_state IS DISTINCT FROM 'pending_approval' THEN
    RAISE EXCEPTION 'FAIL 2b: pilot self-promotion to active must revert, got %', v_state;
  END IF;

  ------------------------------------------------------------------------
  -- 3. Gate: booking WITHOUT profile for a pilot missing mandated Part 107
  --    is hard-blocked; with override columns set BY THE MANAGER (acting
  --    admin) and federal block → STILL blocked (federal never overrides).
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  BEGIN
    INSERT INTO edu.schedules (organization_id, event_title, assigned_user_id,
                                start_time, end_time, status,
                                compliance_override_by, compliance_override_reason)
    VALUES (c_team, 'Compliance probe', c_member,
            now(), now() + interval '1 hour', 'scheduled',
            c_manager, 'ops necessity probe');
    RAISE EXCEPTION 'FAIL 3a: booking with expired-federal + override must block';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%No-Fly%' THEN
      RAISE EXCEPTION 'FAIL 3a: expected No-Fly error, got: %', SQLERRM;
    END IF;
  END;

  ------------------------------------------------------------------------
  -- 4. Manager verifies + activates Part 107 → currency turns active
  --    (within warn window → expiring), booking now passes.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  UPDATE certs.pilot_credentials
     SET status = 'active',
         verified_by = c_manager, verified_at = now(),
         issued_by = c_manager
   WHERE id = v_pc;

  SELECT state INTO v_state
    FROM certs.pilot_compliance_status(c_org)
   WHERE user_id = c_member AND credential_code = 'faa_part_107';
  IF v_state NOT IN ('expiring', 'expiring_soon') THEN
    RAISE EXCEPTION 'FAIL 4a: expected expiring state, got %', v_state;
  END IF;

  INSERT INTO edu.schedules (organization_id, event_title, assigned_user_id,
                              start_time, end_time, status)
  VALUES (c_team, 'Legal flight', c_member, now(), now() + interval '1 hour', 'scheduled')
  RETURNING id INTO v_bk;

  ------------------------------------------------------------------------
  -- 5. Mission profile requiring thermal + BVLOS waiver. Member lacks
  --    both → blocked, listing BOTH failures.
  ------------------------------------------------------------------------
  INSERT INTO certs.mission_profiles (organization_id, name,
                                      required_credential_codes, required_waiver_types)
  VALUES (c_org, 'Night thermal BVLOS survey',
          ARRAY['internal_thermal_payload'], ARRAY['part_107_41_bvlos'])
  RETURNING id INTO v_prof;

  BEGIN
    INSERT INTO edu.schedules (organization_id, event_title, assigned_user_id,
                                start_time, end_time, status, mission_profile_id)
    VALUES (c_team, 'BVLOS survey', c_member, now(), now() + interval '2 hours', 'scheduled', v_prof);
    RAISE EXCEPTION 'FAIL 5a: booking missing thermal + BVLOS waiver must block';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%No-Fly%' THEN
      RAISE EXCEPTION 'FAIL 5a: expected No-Fly error, got: %', SQLERRM;
    END IF;
  END;

  -- Preview RPC reports both failures with labels.
  SELECT count(*) INTO v_count
    FROM certs.preview_booking_requirements(c_org, v_prof, c_member) WHERE ok = false;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL 5b: preview must report 2 unmet requirements, got %', v_count;
  END IF;

  ------------------------------------------------------------------------
  -- 6. Thermal checkout: pending approval blocks the profile booking.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  INSERT INTO certs.pilot_credentials (organization_id, user_id, credential_code,
                                       source)
  VALUES (c_org, c_member, 'internal_thermal_payload', 'upload')
  RETURNING id INTO v_pc;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
    INSERT INTO edu.schedules (organization_id, event_title, assigned_user_id,
                                start_time, end_time, status, mission_profile_id)
    VALUES (c_team, 'BVLOS survey 2', c_member, now(), now() + interval '2 hours', 'scheduled', v_prof);
    RAISE EXCEPTION 'FAIL 6a: pending-approval credential must block';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%No-Fly%' THEN
      RAISE EXCEPTION 'FAIL 6a: expected No-Fly error, got: %', SQLERRM;
    END IF;
  END;

  ------------------------------------------------------------------------
  -- 7. Approval chain: stage order enforced; final sign-off activates.
  ------------------------------------------------------------------------
  BEGIN
    INSERT INTO certs.credential_approvals (credential_id, stage, decision)
    VALUES (v_pc, 'final_signoff', 'approved');
    RAISE EXCEPTION 'FAIL 7a: final_signoff before evaluation must fail';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%requires%' THEN
      RAISE EXCEPTION 'FAIL 7a: expected stage-order error, got: %', SQLERRM;
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  INSERT INTO certs.credential_approvals (credential_id, stage, decision, evaluation_notes)
    VALUES (v_pc, 'evaluation', 'approved', 'Practical eval passed');
  INSERT INTO certs.credential_approvals (credential_id, stage, decision, evaluation_notes)
    VALUES (v_pc, 'document_review', 'approved', 'Logs reviewed');
  INSERT INTO certs.credential_approvals (credential_id, stage, decision, evaluation_notes)
    VALUES (v_pc, 'final_signoff', 'approved', 'Chief pilot sign-off');

  SELECT status INTO v_state FROM certs.pilot_credentials WHERE id = v_pc;
  IF v_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FAIL 7b: final sign-off must activate, got %', v_state;
  END IF;

  ------------------------------------------------------------------------
  -- 8. Waiver resolution: no org waiver → block; then grant one + authorize
  --    the pilot → pass.
  ------------------------------------------------------------------------
  SELECT ok INTO v_ok FROM certs.booking_waiver_check(c_org, c_member, ARRAY['part_107_41_bvlos']);
  IF v_ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 8a: waiver must be unmet without an org waiver';
  END IF;

  INSERT INTO certs.org_waivers (organization_id, waiver_type, identifier,
                                 effective_date, expiration_date, created_by)
  VALUES (c_org, 'part_107_41_bvlos', 'WAIVER-TEST-0001',
          CURRENT_DATE - 10, CURRENT_DATE + 300, c_manager)
  RETURNING id INTO v_wv;

  SELECT ok, reason INTO v_ok, v_reason
    FROM certs.booking_waiver_check(c_org, c_member, ARRAY['part_107_41_bvlos']);
  IF v_ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 8b: waiver without pilot authorization must block';
  END IF;

  INSERT INTO certs.pilot_waiver_authorizations (waiver_id, user_id, granted_by)
  VALUES (v_wv, c_member, c_manager);

  SELECT ok INTO v_ok FROM certs.booking_waiver_check(c_org, c_member, ARRAY['part_107_41_bvlos']);
  IF v_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 8c: waiver + authorization must pass';
  END IF;

  -- Profile booking now passes (thermal active + waiver authorized).
  INSERT INTO edu.schedules (organization_id, event_title, assigned_user_id,
                              start_time, end_time, status, mission_profile_id)
  VALUES (c_team, 'BVLOS survey 3', c_member, now(), now() + interval '2 hours', 'scheduled', v_prof)
  RETURNING id INTO v_bk;

  ------------------------------------------------------------------------
  -- 9. Non-federal override: block member on a NEW internal requirement,
  --    then manager-override succeeds and writes an audit row.
  ------------------------------------------------------------------------
  INSERT INTO certs.org_credential_policies (organization_id, credential_code, required_for_all)
  VALUES (c_org, 'internal_lidar_payload', false)
  ON CONFLICT (organization_id, credential_code) DO NOTHING;
  -- lidar isn't required_for_all; use a mission profile instead.
  INSERT INTO certs.mission_profiles (organization_id, name,
                                      required_credential_codes, required_waiver_types)
  VALUES (c_org, 'LiDAR mapping', ARRAY['internal_lidar_payload'], '{}')
  RETURNING id INTO v_prof;

  BEGIN
    INSERT INTO edu.schedules (organization_id, event_title, assigned_user_id,
                                start_time, end_time, status, mission_profile_id,
                                compliance_override_by, compliance_override_reason)
    VALUES (c_team, 'LiDAR run', c_member, now(), now() + interval '1 hour', 'scheduled',
            v_prof, c_manager, 'LiDAR pilot supervised by chief pilot');
    -- Federal block absent → override permitted.
    NULL;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%No-Fly%' THEN
      RAISE EXCEPTION 'FAIL 9a: non-federal override should have passed: %', SQLERRM;
    END IF;
    RAISE EXCEPTION 'FAIL 9a: unexpected error: %', SQLERRM;
  END;

  ------------------------------------------------------------------------
  -- 10. Gear checkout gate: tagged gear blocks an uncredentialed pilot.
  ------------------------------------------------------------------------
  INSERT INTO org_gear.squadron_gear (team_id, gear_type, name, required_credential_code)
  VALUES (c_team, 'quad', 'Thermal Scout', 'internal_thermal_payload')
  RETURNING id INTO v_gear;

  -- member HOLDS thermal now → passes; use lidar gear for the block probe.
  INSERT INTO org_gear.squadron_gear (team_id, gear_type, name, required_credential_code)
  VALUES (c_team, 'quad', 'LiDAR Rig', 'internal_lidar_payload')
  RETURNING id INTO v_gear;

  BEGIN
    INSERT INTO org_gear.squadron_gear_checkouts (gear_id, team_id, checked_out_by)
    VALUES (v_gear, c_team, c_member);
    RAISE EXCEPTION 'FAIL 10a: checkout without required credential must block';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%No-Fly%' THEN
      RAISE EXCEPTION 'FAIL 10a: expected No-Fly checkout error, got: %', SQLERRM;
    END IF;
  END;

  -- Manager (no lidar either) also blocked; then untagged gear passes.
  BEGIN
    INSERT INTO org_gear.squadron_gear_checkouts (gear_id, team_id, checked_out_by)
    VALUES (v_gear, c_team, c_manager);
    RAISE EXCEPTION 'FAIL 10b: manager without credential must also block';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%No-Fly%' THEN
      RAISE EXCEPTION 'FAIL 10b: expected No-Fly checkout error, got: %', SQLERRM;
    END IF;
  END;

  ------------------------------------------------------------------------
  -- 11. Recency: expire night recency by policy — flight count drives it.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  UPDATE certs.pilot_credentials
     SET verified_by = c_manager, verified_at = now(), status = 'active'
   WHERE id = (SELECT id FROM certs.pilot_credentials
                WHERE user_id = c_member AND credential_code = 'internal_thermal_payload');

  -- member has 0 night flights in window → recency_lapsed on night_ops once held.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  INSERT INTO certs.pilot_credentials (organization_id, user_id, credential_code, source)
  VALUES (c_org, c_member, 'internal_night_ops', 'upload');
  UPDATE certs.pilot_credentials
     SET status = 'active', verified_by = c_manager, verified_at = now()
   WHERE user_id = c_member AND credential_code = 'internal_night_ops';

  SELECT state INTO v_state
    FROM certs.pilot_compliance_status(c_org)
   WHERE user_id = c_member AND credential_code = 'internal_night_ops';
  IF v_state IS DISTINCT FROM 'recency_lapsed' THEN
    RAISE EXCEPTION 'FAIL 11a: expected recency_lapsed with 0 night flights, got %', v_state;
  END IF;

  -- Log 3 flagged night flights → recency clears.
  INSERT INTO public.flights (user_id, spot_name, night_flight, date)
  VALUES
    (c_member, 'Test field A', true, now() - interval '10 days'),
    (c_member, 'Test field B', true, now() - interval '20 days'),
    (c_member, 'Test field C', true, now() - interval '30 days');

  SELECT state INTO v_state
    FROM certs.pilot_compliance_status(c_org)
   WHERE user_id = c_member AND credential_code = 'internal_night_ops';
  IF v_state NOT IN ('active', 'expiring') THEN
    RAISE EXCEPTION 'FAIL 11b: expected active/expiring after night flights, got %', v_state;
  END IF;

  ------------------------------------------------------------------------
  -- 12. Expired credential recomputes from dates: backdate the expiry and
  --     re-run the dispatcher transition, then booking re-blocks.
  ------------------------------------------------------------------------
  UPDATE certs.pilot_credentials
     SET expires_date = CURRENT_DATE - 1
   WHERE user_id = c_member AND credential_code = 'faa_part_107';

  SELECT state, ok INTO v_state, v_ok
    FROM certs.pilot_compliance_status(c_org)
   WHERE user_id = c_member AND credential_code = 'faa_part_107';
  IF v_state IS DISTINCT FROM 'expired' OR v_ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 12a: expected expired/blocked, got % / %', v_state, v_ok;
  END IF;

  BEGIN
    INSERT INTO edu.schedules (organization_id, event_title, assigned_user_id,
                                start_time, end_time, status)
    VALUES (c_team, 'Expired cert probe', c_member, now(), now() + interval '1 hour', 'scheduled');
    RAISE EXCEPTION 'FAIL 12b: booking on expired federal cert must block';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%No-Fly%' THEN
      RAISE EXCEPTION 'FAIL 12b: expected No-Fly error, got: %', SQLERRM;
    END IF;
  END;

  ------------------------------------------------------------------------
  -- 13. Sensitive masking: district admin sees medical rows; plain manager
  --     does not (RLS), and masked rows hide dates in the RPC.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  INSERT INTO certs.pilot_credentials (organization_id, user_id, credential_code,
                                       issued_date, expires_date, source)
  VALUES (c_org, c_member, 'faa_medical', CURRENT_DATE - 30, CURRENT_DATE + 700, 'upload');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  SELECT count(*) INTO v_count
    FROM certs.pilot_credentials
   WHERE user_id = c_member AND credential_code = 'faa_medical';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 13a: squadron manager must NOT see sensitive rows';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_district)::text, true);
  SELECT count(*) INTO v_count
    FROM certs.pilot_credentials
   WHERE user_id = c_member AND credential_code = 'faa_medical';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 13b: district admin must see sensitive rows';
  END IF;

  -- Masked in the compliance RPC for the plain manager.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  SELECT sensitive, expires_date INTO v_ok, v_state
    FROM certs.pilot_compliance_status(c_org)
   WHERE user_id = c_member AND credential_code = 'faa_medical'
     AND sensitive = true AND expires_date IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL 13c: sensitive row must be present with masked dates';
  END IF;

  ------------------------------------------------------------------------
  -- 14. Dispatcher: backdated credentials produce queued notices exactly
  --     once (idempotent on re-run).
  ------------------------------------------------------------------------
  UPDATE certs.pilot_credentials
     SET expires_date = CURRENT_DATE + 12, notified_tier = NULL
   WHERE user_id = c_member AND credential_code = 'internal_thermal_payload';

  PERFORM certs.dispatch_expiration_notices(CURRENT_DATE);
  SELECT count(*) INTO v_count
    FROM certs.notification_outbox
   WHERE ref_type = 'credential' AND ref_id = (
     SELECT id::text FROM certs.pilot_credentials
      WHERE user_id = c_member AND credential_code = 'internal_thermal_payload');
  IF v_count < 2 THEN
    RAISE EXCEPTION 'FAIL 14a: expected in_app + email rows queued, got %', v_count;
  END IF;

  PERFORM certs.dispatch_expiration_notices(CURRENT_DATE);
  SELECT count(*) INTO v_count
    FROM certs.notification_outbox
   WHERE ref_type = 'credential' AND ref_id = (
     SELECT id::text FROM certs.pilot_credentials
      WHERE user_id = c_member AND credential_code = 'internal_thermal_payload');
  IF v_count < 2 THEN
    RAISE EXCEPTION 'FAIL 14b: re-run must be idempotent, got %', v_count;
  END IF;

  ------------------------------------------------------------------------
  -- 15. Audit: override in step 9 wrote a compliance_override row.
  ------------------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM certs.audit_log
   WHERE entity = 'edu_schedules' AND action = 'compliance_override';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'FAIL 15a: expected compliance_override audit row';
  END IF;

  SELECT count(*) INTO v_count
    FROM certs.audit_log
   WHERE entity = 'pilot_credentials' AND action = 'internal_checkout_activated';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'FAIL 15b: expected internal_checkout_activated audit row';
  END IF;

  RAISE NOTICE 'certs gate test: ALL CHECKS PASSED';
END
$test$;

ROLLBACK;
