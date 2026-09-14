-- ============================================================
-- Migration: FERPA Phase 4a — seeded edu cast + cross-tenant fixtures
--
-- Two districts, one school each, and a cast covering every gate:
--
--   District A (Frontier USD) — school "Frontier High"
--     member@test.sticktime         student  (assigned)
--     member2@test.sticktime        student  (assigned)
--     instructor@test.sticktime     instructor of both students
--     school-admin@test.sticktime   school_admin
--     district-admin@test.sticktime district_admin (anchored at Frontier High)
--
--   District B (Basin USD) — school "Basin High"
--     pilot@test.sticktime          student — THE cross-tenant subject:
--                                   nobody in District A may see their data
--
--   No edu membership: owner@, manager@, admin@ (platform admin ≠ edu
--   access — the two planes stay separate by design).
--
-- PASSWORDS ARE DOCUMENTED DEV CREDENTIALS — DO NOT RUN ON PROD.
--   Passw0rd!instructor / Passw0rd!district-admin / Passw0rd!school-admin
-- (existing cast keeps Passw0rd!<local-part>.)
--
-- Follows 20260926010000: fixed ids, confirmed emails, identities inserted
-- directly — NO auth email is ever sent.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Tenancy fixtures (fixed ids)
-- ---------------------------------------------------------------------------
INSERT INTO edu.districts (id, name, state)
VALUES
  ('ce000000-0000-4000-8000-00000000000a'::uuid, 'Frontier USD', 'CA'),
  ('ce000000-0000-4000-8000-00000000000b'::uuid, 'Basin USD', 'NV')
ON CONFLICT (id) DO NOTHING;

INSERT INTO edu.schools (id, district_id, name, site_code)
VALUES
  ('cf000000-0000-4000-8000-0000000000a1'::uuid,
   'ce000000-0000-4000-8000-00000000000a'::uuid, 'Frontier High', 'FHS'),
  ('cf000000-0000-4000-8000-0000000000b1'::uuid,
   'ce000000-0000-4000-8000-00000000000b'::uuid, 'Basin High', 'BHS')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. New cast accounts (instructor, district admin, school admin)
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
SELECT '00000000-0000-0000-0000-000000000000'::uuid,
       v.id, 'authenticated', 'authenticated', v.email,
       crypt(v.password, gen_salt('bf')),
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       ('{"callsign":"' || v.callsign || '"}')::jsonb
FROM (VALUES
  ('aa000000-0000-4000-8000-000000000007'::uuid, 'instructor@test.sticktime',     'Passw0rd!instructor',     'Edu Instructor'),
  ('aa000000-0000-4000-8000-000000000008'::uuid, 'district-admin@test.sticktime', 'Passw0rd!district-admin', 'Edu District Admin'),
  ('aa000000-0000-4000-8000-000000000009'::uuid, 'school-admin@test.sticktime',   'Passw0rd!school-admin',   'Edu School Admin')
) AS v(id, email, password, callsign)
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = v.email);

-- Token columns (GoTrue's user scan errors on NULL confirmation_token).
UPDATE auth.users
SET confirmation_token = md5(random()::text || clock_timestamp()::text),
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    email_change_token_current = ''
WHERE email IN ('instructor@test.sticktime', 'district-admin@test.sticktime',
                'school-admin@test.sticktime')
  AND confirmation_token IS NULL;

-- Email identities (the password grant 500s without them).
INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data,
                             last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
FROM auth.users u
WHERE u.email IN ('instructor@test.sticktime', 'district-admin@test.sticktime',
                  'school-admin@test.sticktime')
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  );

-- Profiles (the on_auth_user_created trigger may not exist anymore; be
-- explicit and idempotent).
INSERT INTO public.profiles (id, role, tier)
SELECT u.id, 'user', 'free'
FROM auth.users u
WHERE u.email IN ('instructor@test.sticktime', 'district-admin@test.sticktime',
                  'school-admin@test.sticktime')
ON CONFLICT (id) DO NOTHING;

-- pilot_settings rows (callsigns only — no name/email leakage).
INSERT INTO public.pilot_settings (user_id, callsign)
SELECT u.id, v.callsign
FROM (VALUES
  ('instructor@test.sticktime',    'Edu Instructor'),
  ('district-admin@test.sticktime','Edu District Admin'),
  ('school-admin@test.sticktime',  'Edu School Admin')
) AS v(email, callsign)
JOIN auth.users u ON u.email = v.email
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Memberships. district_id is omitted on purpose: the
--    edu.stamp_membership_district trigger stamps it from the school,
--    which also proves the trigger works during seeding.
-- ---------------------------------------------------------------------------
INSERT INTO edu.memberships (user_id, school_id, edu_role)
SELECT u.id, 'cf000000-0000-4000-8000-0000000000a1'::uuid, r.edu_role::edu.edu_role
FROM (VALUES
  ('member@test.sticktime',        'student'),
  ('member2@test.sticktime',       'student'),
  ('instructor@test.sticktime',    'instructor'),
  ('school-admin@test.sticktime',  'school_admin'),
  ('district-admin@test.sticktime','district_admin')
) AS r(email, edu_role)
JOIN auth.users u ON u.email = r.email
ON CONFLICT (school_id, user_id, status) DO NOTHING;

-- The cross-tenant subject: a student in District B.
INSERT INTO edu.memberships (user_id, school_id, edu_role)
SELECT u.id, 'cf000000-0000-4000-8000-0000000000b1'::uuid, 'student'
FROM auth.users u WHERE u.email = 'pilot@test.sticktime'
ON CONFLICT (school_id, user_id, status) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Assignments: the District A instructor teaches both District A
--    students. Nothing may ever pair them with the District B student.
-- ---------------------------------------------------------------------------
INSERT INTO edu.instructor_assignments
  (instructor_membership_id, student_membership_id, school_id, district_id)
SELECT mi.id, ms.id, mi.school_id, mi.district_id
FROM edu.memberships mi
JOIN edu.memberships ms
  ON ms.school_id = mi.school_id
 AND ms.edu_role = 'student'
 AND ms.user_id IN (SELECT id FROM auth.users
                     WHERE email IN ('member@test.sticktime',
                                     'member2@test.sticktime'))
WHERE mi.user_id = (SELECT id FROM auth.users
                     WHERE email = 'instructor@test.sticktime')
  AND NOT EXISTS (
    SELECT 1 FROM edu.instructor_assignments ia
     WHERE ia.instructor_membership_id = mi.id
       AND ia.student_membership_id = ms.id
       AND ia.ended_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- 5. One pending enrollment to exercise the queue → provision path.
--    (Email staging only; display_name left NULL — no real names, ever.)
-- ---------------------------------------------------------------------------
INSERT INTO edu.pending_roster (school_id, district_id, school_email, edu_role, invited_by)
SELECT 'cf000000-0000-4000-8000-0000000000a1'::uuid,
       'ce000000-0000-4000-8000-00000000000a'::uuid,
       'student3@test.sticktime', 'student', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM edu.pending_roster
   WHERE school_id = 'cf000000-0000-4000-8000-0000000000a1'::uuid
     AND school_email = 'student3@test.sticktime'
);

-- ---------------------------------------------------------------------------
-- 6. Demo flight sessions so the student record view has content.
--    Personal-plane rows, owned by the students themselves — RLS on
--    sessions keeps them private; only edu_get_student_record (audited,
--    guard-checked) exposes them to staff.
-- ---------------------------------------------------------------------------
INSERT INTO public.sessions (user_id, session_type, flown_on, duration_minutes,
                             sim_platform, packs_flown, crashes)
SELECT u.id, 'sim'::session_type, to_char(now() - interval '3 days', 'YYYY-MM-DD'),
       45, 'VelociDrone', 0, 0
FROM auth.users u WHERE u.email = 'member@test.sticktime'
  AND NOT EXISTS (SELECT 1 FROM public.sessions s
                   WHERE s.user_id = u.id AND s.sim_platform = 'VelociDrone');

INSERT INTO public.sessions (user_id, session_type, flown_on, duration_minutes,
                             packs_flown, crashes)
SELECT u.id, 'real'::session_type, to_char(now() - interval '1 day', 'YYYY-MM-DD'),
       20, 3, 1
FROM auth.users u WHERE u.email = 'member2@test.sticktime'
  AND NOT EXISTS (SELECT 1 FROM public.sessions s
                   WHERE s.user_id = u.id AND s.session_type = 'real'
                     AND s.flown_on = to_char(now() - interval '1 day', 'YYYY-MM-DD'));

-- District B subject flies too — District A staff must never see this.
INSERT INTO public.sessions (user_id, session_type, flown_on, duration_minutes,
                             sim_platform, packs_flown, crashes)
SELECT u.id, 'sim'::session_type, to_char(now() - interval '2 days', 'YYYY-MM-DD'),
       60, 'Liftoff', 0, 0
FROM auth.users u WHERE u.email = 'pilot@test.sticktime'
  AND NOT EXISTS (SELECT 1 FROM public.sessions s
                   WHERE s.user_id = u.id AND s.sim_platform = 'Liftoff');

-- ---------------------------------------------------------------------------
-- 7. Re-assert documented passwords (idempotent re-runs)
-- ---------------------------------------------------------------------------
UPDATE auth.users
SET encrypted_password = crypt('Passw0rd!' || split_part(email, '@', 1), gen_salt('bf'))
WHERE email IN ('instructor@test.sticktime', 'district-admin@test.sticktime',
                'school-admin@test.sticktime');

-- ============================================================
-- End of migration
-- ============================================================
