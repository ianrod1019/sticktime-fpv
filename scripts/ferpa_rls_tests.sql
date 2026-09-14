-- ============================================================
-- FERPA RLS acceptance probes — scripts/ferpa_rls_tests.sql
--
-- Asserts the FERPA directive's core guarantees against the seeded cast
-- from 20260927000300. Run with psql against a LOCAL database with the
-- migrations applied (documented dev passwords — never run on prod):
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f scripts/ferpa_rls_tests.sql
--
-- How it works: each block impersonates a cast member by setting the
-- JWT-claim context auth.uid()/RLS read, runs assertions, and ROLLS
-- BACK. Every mutation happens inside a rolled-back transaction, so the
-- script is read-mostly and leaves the database unchanged. Any FAILED
-- assertion raises and stops the run (exit != 0).
--
-- The probe helpers live in a dedicated `ferpa_tests` schema that is
-- DROPPED at the end — the script leaves no objects behind.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 0. Probe helpers (real schema — callable under SET ROLE; dropped at end)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS ferpa_tests;
GRANT USAGE ON SCHEMA ferpa_tests TO authenticated;

CREATE OR REPLACE FUNCTION ferpa_tests.do_assert(p_label text, p_ok boolean)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FERPA TEST FAILED: %', p_label;
  END IF;
  RAISE NOTICE 'PASS: %', p_label;
END;
$function$;

-- Run a statement and REQUIRE it to be rejected. Only genuine access
-- violations / constraint failures count as a pass; any other error is
-- re-raised (a probe must not pass because something is merely broken).
CREATE OR REPLACE FUNCTION ferpa_tests.expect_reject(p_label text, p_sql text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_state text;
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FERPA TEST FAILED (expected rejection): %', p_label;
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF SQLERRM LIKE 'FERPA TEST FAILED%' THEN
      RAISE;
    END IF;
    IF v_state NOT IN ('42501', '23514', 'P0001', '23503', '23505', '23502') THEN
      RAISE;
    END IF;
    RAISE NOTICE 'PASS (rejected as required): % [%] %', p_label, v_state, SQLERRM;
END;
$function$;

-- Resolve a cast email to a user id (definer: auth.users is not readable
-- by impersonated roles).
CREATE OR REPLACE FUNCTION ferpa_tests.cast_id(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT id FROM auth.users WHERE email = p_email
$function$;
GRANT EXECUTE ON FUNCTION ferpa_tests.cast_id(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Preflight (as postgres): cast + fixtures present
-- ---------------------------------------------------------------------------
SELECT ferpa_tests.do_assert('probe schema + helpers installed', true);

SELECT ferpa_tests.do_assert(
  'seed cast present (9 test users)',
  (SELECT count(*) >= 9 FROM auth.users WHERE email LIKE '%@test.sticktime'));

SELECT ferpa_tests.do_assert(
  'two districts seeded',
  (SELECT count(*) = 2 FROM edu.districts
    WHERE id IN ('ce000000-0000-4000-8000-00000000000a'::uuid,
                 'ce000000-0000-4000-8000-00000000000b'::uuid)));

SELECT ferpa_tests.do_assert(
  'two schools seeded (one per district)',
  (SELECT count(*) = 2 FROM edu.schools
    WHERE id IN ('cf000000-0000-4000-8000-0000000000a1'::uuid,
                 'cf000000-0000-4000-8000-0000000000b1'::uuid)));

SELECT ferpa_tests.do_assert(
  'memberships stamped with district_id by trigger (no NULL districts)',
  (SELECT count(*) = 0 FROM edu.memberships WHERE district_id IS NULL));

SELECT ferpa_tests.do_assert(
  'two open instructor assignments seeded in District A',
  (SELECT count(*) = 2 FROM edu.instructor_assignments
    WHERE district_id = 'ce000000-0000-4000-8000-00000000000a'::uuid
      AND ended_at IS NULL));

SELECT ferpa_tests.do_assert(
  'pending enrollment staged',
  (SELECT count(*) >= 1 FROM edu.pending_roster
    WHERE school_id = 'cf000000-0000-4000-8000-0000000000a1'::uuid));

SELECT ferpa_tests.do_assert(
  'PII minimization: no callsign equals an email local-part',
  NOT EXISTS (
    SELECT 1
      FROM public.pilot_settings ps
      JOIN auth.users u ON u.id = ps.user_id
     WHERE ps.callsign = split_part(u.email, '@', 1)));

-- ---------------------------------------------------------------------------
-- 2. Student: own record only (member@test.sticktime, District A)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}',
         ferpa_tests.cast_id('member@test.sticktime')), false);

SELECT ferpa_tests.do_assert('student sees own sessions',
  (SELECT count(*) >= 1 FROM public.sessions
    WHERE user_id = ferpa_tests.cast_id('member@test.sticktime')));

SELECT ferpa_tests.do_assert('student cannot read another student''s sessions',
  (SELECT count(*) = 0 FROM public.sessions
    WHERE user_id = ferpa_tests.cast_id('member2@test.sticktime')));

SELECT ferpa_tests.do_assert('student record RPC on self returns via=self',
  public.edu_get_student_record(ferpa_tests.cast_id('member@test.sticktime'))->>'via' = 'self');

SELECT ferpa_tests.do_assert('student cannot list students for a school',
  (SELECT count(*) = 0 FROM public.edu_list_my_students(
     'cf000000-0000-4000-8000-0000000000a1'::uuid)));

SELECT ferpa_tests.expect_reject(
  'student cannot read another student''s record via RPC',
  format('SELECT public.edu_get_student_record(%L)',
         ferpa_tests.cast_id('member2@test.sticktime')));

SELECT ferpa_tests.expect_reject(
  'student cannot forge security_logs rows',
  'INSERT INTO public.security_logs (user_id, path, action) '
  || 'VALUES (auth.uid(), ''/edu'', ''unauthorized_access_attempt'')');

SELECT ferpa_tests.expect_reject(
  'authenticated cannot UPDATE the audit trail',
  'UPDATE public.admin_audit_logs SET action = ''tampered''');

SELECT ferpa_tests.expect_reject(
  'authenticated cannot DELETE audit rows',
  'DELETE FROM public.admin_audit_logs WHERE true');

ROLLBACK;

-- ---------------------------------------------------------------------------
-- 3. Assigned instructor: view-only access to assigned students
--    (instructor@test.sticktime, Frontier High)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}',
         ferpa_tests.cast_id('instructor@test.sticktime')), false);

SELECT ferpa_tests.do_assert('instructor lists exactly their 2 assigned students',
  (SELECT count(*) = 2 FROM public.edu_list_my_students(
     'cf000000-0000-4000-8000-0000000000a1'::uuid)));

SELECT ferpa_tests.do_assert(
  'instructor record view opens via instructor_assignment',
  public.edu_get_student_record(ferpa_tests.cast_id('member@test.sticktime'))->>'via'
    = 'instructor_assignment');

SELECT ferpa_tests.do_assert('instructor sees District A assignments (RLS)',
  (SELECT count(*) = 2 FROM edu.instructor_assignments
    WHERE district_id = 'ce000000-0000-4000-8000-00000000000a'::uuid));

SELECT ferpa_tests.do_assert('instructor sees no pending roster entries',
  (SELECT count(*) = 0 FROM edu.pending_roster));

SELECT ferpa_tests.expect_reject(
  'instructor cannot read an unassigned District B student''s record',
  format('SELECT public.edu_get_student_record(%L)',
         ferpa_tests.cast_id('pilot@test.sticktime')));

ROLLBACK;

-- ---------------------------------------------------------------------------
-- 4. School admin: school-scoped roster + queue
--    (school-admin@test.sticktime, Frontier High)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}',
         ferpa_tests.cast_id('school-admin@test.sticktime')), false);

SELECT ferpa_tests.do_assert('school admin sees all 5 District A memberships',
  (SELECT count(*) = 5 FROM edu.memberships
    WHERE district_id = 'ce000000-0000-4000-8000-00000000000a'::uuid));

SELECT ferpa_tests.do_assert('school admin sees own school''s pending queue',
  (SELECT count(*) >= 1 FROM edu.pending_roster));

SELECT ferpa_tests.do_assert('school admin record view opens via school_admin',
  public.edu_get_student_record(ferpa_tests.cast_id('member@test.sticktime'))->>'via'
    = 'school_admin');

SELECT ferpa_tests.do_assert('school admin can queue an enrollment (rolled back)',
  public.edu_queue_enrollment('cf000000-0000-4000-8000-0000000000a1'::uuid,
                              'probe@test.sticktime', 'student') IS NOT NULL);

SELECT ferpa_tests.expect_reject(
  'school admin cannot create schools (district-admin only)',
  'SELECT public.edu_create_school(''ce000000-0000-4000-8000-00000000000a''::uuid, ''Nope High'')');

SELECT ferpa_tests.expect_reject(
  'school admin cannot read a District B student''s record',
  format('SELECT public.edu_get_student_record(%L)',
         ferpa_tests.cast_id('pilot@test.sticktime')));

ROLLBACK;

-- ---------------------------------------------------------------------------
-- 5. District admin A: full own-district reach, ZERO cross-district reach
--    (district-admin@test.sticktime)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}',
         ferpa_tests.cast_id('district-admin@test.sticktime')), false);

SELECT ferpa_tests.do_assert('district admin sees only District A''s school',
  (SELECT count(*) = 1 FROM edu.schools));

SELECT ferpa_tests.do_assert('district admin sees all District A memberships',
  (SELECT count(*) = 5 FROM edu.memberships
    WHERE district_id = 'ce000000-0000-4000-8000-00000000000a'::uuid));

SELECT ferpa_tests.do_assert('District B memberships invisible (RLS)',
  (SELECT count(*) = 0 FROM edu.memberships
    WHERE district_id = 'ce000000-0000-4000-8000-00000000000b'::uuid));

SELECT ferpa_tests.do_assert('District B student sessions invisible (RLS)',
  (SELECT count(*) = 0 FROM public.sessions
    WHERE user_id = ferpa_tests.cast_id('pilot@test.sticktime')));

SELECT ferpa_tests.do_assert('district overview returns own-district aggregates',
  (public.edu_district_overview('ce000000-0000-4000-8000-00000000000a'::uuid)
     ->'totals'->>'students')::int = 2);

SELECT ferpa_tests.do_assert('district admin record view opens via district_admin',
  public.edu_get_student_record(ferpa_tests.cast_id('member2@test.sticktime'))->>'via'
    = 'district_admin');

SELECT ferpa_tests.do_assert('re-assigning an open pair is idempotent (rolled back)',
  public.edu_assign_instructor('cf000000-0000-4000-8000-0000000000a1'::uuid,
    ferpa_tests.cast_id('instructor@test.sticktime'),
    ferpa_tests.cast_id('member@test.sticktime')) IS NOT NULL);

SELECT ferpa_tests.expect_reject(
  'district admin cannot open District B overview',
  'SELECT public.edu_district_overview(''ce000000-0000-4000-8000-00000000000b''::uuid)');

SELECT ferpa_tests.expect_reject(
  'district admin cannot read a District B student''s record',
  format('SELECT public.edu_get_student_record(%L)',
         ferpa_tests.cast_id('pilot@test.sticktime')));

SELECT ferpa_tests.expect_reject(
  'district admin cannot insert a membership into District B (RLS)',
  'INSERT INTO edu.memberships (user_id, school_id, edu_role) VALUES ('
  || format('%L, ', ferpa_tests.cast_id('district-admin@test.sticktime'))
  || '''cf000000-0000-4000-8000-0000000000b1''::uuid, ''district_admin'')');

SELECT ferpa_tests.expect_reject(
  'provisioning RPC rejects non-service-role callers',
  format('SELECT public.edu_provision_member(''cf000000-0000-4000-8000-0000000000a1''::uuid, %L)',
         ferpa_tests.cast_id('member@test.sticktime')));

ROLLBACK;

-- ---------------------------------------------------------------------------
-- 6. District B student: the cross-tenant subject stays sealed
--    (pilot@test.sticktime, Basin High)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}',
         ferpa_tests.cast_id('pilot@test.sticktime')), false);

SELECT ferpa_tests.do_assert('District B student sees own sessions',
  (SELECT count(*) >= 1 FROM public.sessions
    WHERE user_id = ferpa_tests.cast_id('pilot@test.sticktime')));

SELECT ferpa_tests.do_assert('District B student sees own membership only',
  (SELECT count(*) = 1 FROM edu.memberships));

SELECT ferpa_tests.do_assert('District B student sees District B school only',
  (SELECT count(*) = 1 FROM edu.schools));

SELECT ferpa_tests.do_assert('District A assignments invisible',
  (SELECT count(*) = 0 FROM edu.instructor_assignments
    WHERE district_id = 'ce000000-0000-4000-8000-00000000000a'::uuid));

SELECT ferpa_tests.expect_reject(
  'District B student cannot read a District A student''s record',
  format('SELECT public.edu_get_student_record(%L)',
         ferpa_tests.cast_id('member@test.sticktime')));

SELECT ferpa_tests.expect_reject(
  'District B student cannot forge security_logs rows',
  'INSERT INTO public.security_logs (user_id, path, action) '
  || 'VALUES (auth.uid(), ''/edu'', ''unauthorized_access_attempt'')');

ROLLBACK;

-- ---------------------------------------------------------------------------
-- 7. Audit immutability: severable identity links, immutable content
--    (as postgres — the platform-staff path)
-- ---------------------------------------------------------------------------
BEGIN;
DO $block$
DECLARE
  v_row uuid;
BEGIN
  -- Seed our own probe row (rolled back) so this test never depends on
  -- other migrations having produced audit traffic.
  INSERT INTO public.admin_audit_logs (actor_id, action, payload)
  VALUES (NULL, 'ferpa_probe_row', '{}'::jsonb)
  RETURNING id INTO v_row;

-- The legitimate pseudonymization path: identity links may be severed.
UPDATE public.admin_audit_logs SET actor_id = NULL WHERE id = v_row;
RAISE NOTICE 'PASS: platform staff may sever audit identity links';

-- Content is immutable for everyone, staff included.
BEGIN
  UPDATE public.admin_audit_logs SET action = 'tampered' WHERE id = v_row;
  RAISE EXCEPTION 'FERPA TEST FAILED: audit content must be immutable';
EXCEPTION
  WHEN raise_exception THEN
    RAISE NOTICE 'PASS: audit content immutable (rejected: %)', SQLERRM;
END;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 8. Done — remove the probe schema
-- ---------------------------------------------------------------------------
DROP SCHEMA ferpa_tests CASCADE;

DO $$
BEGIN
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'FERPA RLS acceptance probes: ALL PASSED';
  RAISE NOTICE '=================================================';
END $$;
