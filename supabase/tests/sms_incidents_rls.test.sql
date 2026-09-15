-- ============================================================================
-- Test: sms.incidents — RLS isolation, closed-requires-corrective-action,
--       and the storage path-ownership check.
--
-- Reuses the Central High fixture from 20260927100400_enterprise_seed.sql
-- (org ee…c1) and the RBAC user cast from 20260926010000:
--   c_manager (manager@test.sticktime) → squadron_admin of Central High
--                                          == the safety-officer tier here.
--   c_member  (member@test.sticktime)  → pilot, Central High org member.
--   c_pilot   (pilot@test.sticktime)   → not a member of any org.
--   c_admin   (admin@test.sticktime)   → site admin (dev role).
-- ============================================================================

BEGIN;

DO $test$
DECLARE
  c_org      uuid := 'ee000000-0000-4000-8000-0000000000c1'::uuid;
  c_manager  uuid := 'aa000000-0000-4000-8000-000000000002'::uuid;
  c_member   uuid := 'aa000000-0000-4000-8000-000000000003'::uuid;
  c_pilot    uuid := 'aa000000-0000-4000-8000-000000000005'::uuid;
  c_admin    uuid := 'aa000000-0000-4000-8000-000000000006'::uuid;

  v_incident uuid;
  v_count    int;
  v_status   text;
BEGIN
  ------------------------------------------------------------------------
  -- 1. A pilot files their own incident report.
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);

  INSERT INTO sms.incidents (organization_id, severity_level, incident_type, description)
  VALUES (c_org, 'medium', 'near_miss', 'TEST near-miss with a tree line on approach.')
  RETURNING incident_id INTO v_incident;

  SELECT count(*) INTO v_count FROM sms.incidents WHERE incident_id = v_incident;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 1: pilot could not file their own incident';
  END IF;

  ------------------------------------------------------------------------
  -- 2. A pilot cannot file a report attributed to someone else.
  ------------------------------------------------------------------------
  BEGIN
    INSERT INTO sms.incidents (organization_id, user_id, severity_level, incident_type, description)
    VALUES (c_org, c_manager, 'low', 'crash', 'TEST impersonation probe');
    RAISE EXCEPTION 'FAIL 2: pilot filed a report as another user';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- 3. A non-member cannot file into an org they don't belong to.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_pilot)::text, true);
  BEGIN
    INSERT INTO sms.incidents (organization_id, severity_level, incident_type, description)
    VALUES (c_org, 'low', 'crash', 'TEST non-member probe');
    RAISE EXCEPTION 'FAIL 3: non-member filed an incident';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- 4. Tenant isolation: the non-member sees zero rows in this org.
  ------------------------------------------------------------------------
  SELECT count(*) INTO v_count FROM sms.incidents WHERE organization_id = c_org;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 4: non-member saw % incident rows, expected 0', v_count;
  END IF;

  ------------------------------------------------------------------------
  -- 5. The safety officer (squadron_admin) sees the pilot's report.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  SELECT count(*) INTO v_count FROM sms.incidents WHERE incident_id = v_incident;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 5: safety officer could not see the org''s incident';
  END IF;

  ------------------------------------------------------------------------
  -- 6. A pilot cannot update their own report — filing is immutable
  --    from the pilot's side; only the safety officer reviews it. The
  --    UPDATE policy's USING clause excludes the row outright, so this
  --    is a silent 0-row no-op, not a thrown exception — assert on the
  --    unchanged status instead of expecting an error.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  UPDATE sms.incidents SET status = 'closed' WHERE incident_id = v_incident;
  SELECT status INTO v_status FROM sms.incidents WHERE incident_id = v_incident;
  IF v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'FAIL 6: pilot''s update to their own incident took effect (status=%)', v_status;
  END IF;

  ------------------------------------------------------------------------
  -- 7. Closing without a corrective_action is rejected (DB constraint) —
  --    even for the safety officer.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  BEGIN
    UPDATE sms.incidents SET status = 'closed' WHERE incident_id = v_incident;
    RAISE EXCEPTION 'FAIL 7: incident closed with no corrective action';
  EXCEPTION
    WHEN check_violation THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- 8. The safety officer reviews and closes it with a corrective action.
  ------------------------------------------------------------------------
  UPDATE sms.incidents
     SET status = 'closed', corrective_action = 'TEST re-briefed pilot on approach clearances.'
   WHERE incident_id = v_incident;

  SELECT status INTO v_status FROM sms.incidents WHERE incident_id = v_incident;
  IF v_status IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'FAIL 8: incident did not close with a corrective action present';
  END IF;

  ------------------------------------------------------------------------
  -- 9. Site admin (c_admin, not an org member) can also manage the org's
  --    incidents — public.ent_can_manage covers site admins everywhere.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  SELECT count(*) INTO v_count FROM sms.incidents WHERE incident_id = v_incident;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 9: site admin could not see the org''s incident';
  END IF;

  ------------------------------------------------------------------------
  -- 10. Storage path ownership: sms.storage_access(<org>/<user>/<file>).
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  IF NOT sms.storage_access(c_org::text || '/' || c_member::text || '/photo.jpg') THEN
    RAISE EXCEPTION 'FAIL 10a: pilot denied access to their own attachment path';
  END IF;
  IF sms.storage_access(c_org::text || '/' || c_manager::text || '/photo.jpg') THEN
    RAISE EXCEPTION 'FAIL 10b: pilot allowed access to another user''s attachment path';
  END IF;
  IF sms.storage_access('not-a-valid-path') THEN
    RAISE EXCEPTION 'FAIL 10c: malformed path was accepted';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  IF NOT sms.storage_access(c_org::text || '/' || c_member::text || '/photo.jpg') THEN
    RAISE EXCEPTION 'FAIL 10d: safety officer denied access to a pilot''s attachment path';
  END IF;

  ------------------------------------------------------------------------
  -- Done — discard the probe row.
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'postgres', true);
  DELETE FROM sms.incidents WHERE incident_id = v_incident;

  RAISE NOTICE 'sms.incidents: ALL CHECKS PASSED';
END
$test$;

ROLLBACK;
