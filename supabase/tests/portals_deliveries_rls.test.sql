-- ============================================================================
-- Test: portals.deliveries / portals.delivery_files — RLS isolation
--       (any org member, not just admins), the storage path-ownership
--       check, and the public get_delivery RPC's not-found/expired paths.
--
-- Reuses the Central High fixture from 20260927100400_enterprise_seed.sql
-- (org ee…c1) and the RBAC user cast from 20260926010000:
--   c_manager (manager@test.sticktime) → squadron_admin of Central High
--   c_member  (member@test.sticktime)  → plain pilot, Central High org member
--   c_pilot   (pilot@test.sticktime)   → not a member of any org
--   c_admin   (admin@test.sticktime)   → site admin (dev role)
-- ============================================================================

BEGIN;

DO $test$
DECLARE
  c_org      uuid := 'ee000000-0000-4000-8000-0000000000c1'::uuid;
  c_manager  uuid := 'aa000000-0000-4000-8000-000000000002'::uuid;
  c_member   uuid := 'aa000000-0000-4000-8000-000000000003'::uuid;
  c_pilot    uuid := 'aa000000-0000-4000-8000-000000000005'::uuid;
  c_admin    uuid := 'aa000000-0000-4000-8000-000000000006'::uuid;

  v_delivery uuid;
  v_token    uuid;
  v_count    int;
  v_view     jsonb;
  v_failed   boolean;
BEGIN
  ------------------------------------------------------------------------
  -- 1. A plain org member (not an admin) creates a delivery portal —
  --    the spec's "org members can create and manage" is deliberately
  --    broader than ent_scheduling's admin-only writes.
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);

  INSERT INTO portals.deliveries (organization_id, client_name, project_title, expires_at)
  VALUES (c_org, 'TEST Client', 'TEST Aerial Survey', now() + interval '7 days')
  RETURNING delivery_id, access_token INTO v_delivery, v_token;

  SELECT count(*) INTO v_count FROM portals.deliveries WHERE delivery_id = v_delivery;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 1: org member could not create a delivery';
  END IF;

  ------------------------------------------------------------------------
  -- 2. A non-member cannot create a delivery for an org they don't belong to.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_pilot)::text, true);
  BEGIN
    INSERT INTO portals.deliveries (organization_id, client_name, project_title, expires_at)
    VALUES (c_org, 'TEST Intruder', 'TEST Intruder Project', now() + interval '7 days');
    RAISE EXCEPTION 'FAIL 2: non-member created a delivery';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL; -- expected
  END;

  ------------------------------------------------------------------------
  -- 3. Tenant isolation: the non-member sees zero rows in this org.
  ------------------------------------------------------------------------
  SELECT count(*) INTO v_count FROM portals.deliveries WHERE organization_id = c_org;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 3: non-member saw % delivery rows, expected 0', v_count;
  END IF;

  ------------------------------------------------------------------------
  -- 4. The squadron_admin (broader group member) also sees and can
  --    update the pilot's delivery.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_manager)::text, true);
  SELECT count(*) INTO v_count FROM portals.deliveries WHERE delivery_id = v_delivery;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 4: squadron_admin could not see the org''s delivery';
  END IF;

  UPDATE portals.deliveries SET client_name = 'TEST Client Renamed' WHERE delivery_id = v_delivery;
  SELECT count(*) INTO v_count
    FROM portals.deliveries WHERE delivery_id = v_delivery AND client_name = 'TEST Client Renamed';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 4b: squadron_admin update did not stick';
  END IF;

  ------------------------------------------------------------------------
  -- 5. Site admin (not an org member) can also see it —
  --    public.ent_is_site_admin covers site admins everywhere.
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  SELECT count(*) INTO v_count FROM portals.deliveries WHERE delivery_id = v_delivery;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 5: site admin could not see the org''s delivery';
  END IF;

  ------------------------------------------------------------------------
  -- 6. A delivery file's storage_path must address its own delivery's
  --    prefix (INSERT WITH CHECK).
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  BEGIN
    INSERT INTO portals.delivery_files (delivery_id, file_name, file_size, storage_path)
    VALUES (v_delivery, 'wrong-prefix.jpg', 1024, gen_random_uuid()::text || '/wrong-prefix.jpg');
    RAISE EXCEPTION 'FAIL 6: file with mismatched storage prefix was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL; -- expected (RLS WITH CHECK -> 23514 under the hood via policy)
    WHEN insufficient_privilege THEN NULL; -- also acceptable depending on PG version's policy-violation code
  END;

  INSERT INTO portals.delivery_files (delivery_id, file_name, file_size, storage_path)
  VALUES (v_delivery, 'final-render.jpg', 2048, v_delivery::text || '/' || gen_random_uuid()::text || '-final-render.jpg');

  SELECT count(*) INTO v_count FROM portals.delivery_files WHERE delivery_id = v_delivery;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 6b: correctly-prefixed file was not accepted';
  END IF;

  ------------------------------------------------------------------------
  -- 7. Storage path ownership: portals.storage_delivery_access() reads
  --    the delivery id from the first path segment (GUC-set by Storage).
  ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_member)::text, true);
  PERFORM set_config('storage.requested_path', v_delivery::text || '/some-file.jpg', true);
  IF NOT portals.storage_delivery_access() THEN
    RAISE EXCEPTION 'FAIL 7a: org member denied access to their own delivery''s storage path';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_pilot)::text, true);
  IF portals.storage_delivery_access() THEN
    RAISE EXCEPTION 'FAIL 7b: non-member allowed access to another org''s delivery storage path';
  END IF;

  PERFORM set_config('storage.requested_path', 'not-a-uuid/some-file.jpg', true);
  IF portals.storage_delivery_access() THEN
    RAISE EXCEPTION 'FAIL 7c: malformed storage path was accepted';
  END IF;

  ------------------------------------------------------------------------
  -- 8. Public RPC: the real client path is anon, through the public
  --    wrapper only (portals.get_delivery itself is revoked from every
  --    role but postgres — see the migration). A valid, unexpired token
  --    returns the delivery view with its file list, never the token.
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  v_view := public.portals_get_delivery(v_token);
  IF (v_view ->> 'client_name') IS DISTINCT FROM 'TEST Client Renamed' THEN
    RAISE EXCEPTION 'FAIL 8a: get_delivery returned wrong client_name: %', v_view;
  END IF;
  IF jsonb_array_length(v_view -> 'files') <> 1 THEN
    RAISE EXCEPTION 'FAIL 8b: get_delivery returned % files, expected 1', jsonb_array_length(v_view -> 'files');
  END IF;
  IF v_view ? 'access_token' THEN
    RAISE EXCEPTION 'FAIL 8c: get_delivery leaked the access_token';
  END IF;

  ------------------------------------------------------------------------
  -- 9. An unknown token raises PT404.
  ------------------------------------------------------------------------
  v_failed := false;
  BEGIN
    PERFORM public.portals_get_delivery(gen_random_uuid());
  EXCEPTION WHEN SQLSTATE 'PT404' THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FAIL 9: an unknown token did not raise PT404';
  END IF;

  ------------------------------------------------------------------------
  -- 10. An expired token raises PT410, even though the row still exists.
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'postgres', true);
  UPDATE portals.deliveries SET expires_at = now() - interval '1 minute' WHERE delivery_id = v_delivery;
  PERFORM set_config('role', 'anon', true);

  v_failed := false;
  BEGIN
    PERFORM public.portals_get_delivery(v_token);
  EXCEPTION WHEN SQLSTATE 'PT410' THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FAIL 10: an expired token did not raise PT410';
  END IF;

  ------------------------------------------------------------------------
  -- Done — discard the probe rows.
  ------------------------------------------------------------------------
  PERFORM set_config('role', 'postgres', true);
  DELETE FROM portals.deliveries WHERE delivery_id = v_delivery;

  RAISE NOTICE 'portals.deliveries: ALL CHECKS PASSED';
END
$test$;

ROLLBACK;
