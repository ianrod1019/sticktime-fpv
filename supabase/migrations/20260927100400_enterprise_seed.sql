-- ============================================================
-- Migration: Enterprise seed — Tulsa STEM District demo + cast
--
-- Demo content for the enterprise plane, following the house seed
-- pattern (20260926010000 / FERPA Phase 4): fixed uuids, pre-confirmed
-- emails inserted directly into auth.users, NO auth email ever sent.
--
-- Cast additions:
--   district-admin@test.sticktime   billing owner of Tulsa STEM District
--   district-admin2@test.sticktime  billing owner of Single Prop Example
--
-- District: Tulsa STEM District (multi_district plan)
--   Central High Squadron   (org over team "Central High Squadron")
--   North High Squadron     (org over team "North High Squadron")
-- Standard: Single Prop Example (standard_squadron plan)
--   One org over team "Single Prop Squad"
--
-- The owner/manager/member accounts of each team are the EXISTING cast
-- (owner@test.sticktime etc.); this seed creates the teams and wires
-- memberships idempotently, then adds district policies and meetups.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. District-admin accounts (fixed ids, confirmed, no emails sent)
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
  ('aa000000-0000-4000-8000-000000000010'::uuid,
   'district-admin@test.sticktime',  'Passw0rd!district-admin',  'Tulsa District Admin'),
  ('aa000000-0000-4000-8000-000000000011'::uuid,
   'district-admin2@test.sticktime', 'Passw0rd!district-admin2', 'Single Prop Admin')
) AS v(id, email, password, callsign)
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = v.email);

UPDATE auth.users
SET confirmation_token = md5(random()::text || clock_timestamp()::text),
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    email_change_token_current = ''
WHERE email IN ('district-admin@test.sticktime', 'district-admin2@test.sticktime')
  AND confirmation_token IS NULL;

INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data,
                             last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
FROM auth.users u
WHERE u.email IN ('district-admin@test.sticktime', 'district-admin2@test.sticktime')
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
     WHERE i.user_id = u.id AND i.provider = 'email'
  );

INSERT INTO public.profiles (id, role, tier)
SELECT u.id, 'user', 'enterprise'
FROM auth.users u
WHERE u.email IN ('district-admin@test.sticktime', 'district-admin2@test.sticktime')
ON CONFLICT (id) DO UPDATE SET tier = 'enterprise';

INSERT INTO public.pilot_settings (user_id, callsign)
SELECT u.id, v.callsign
FROM (VALUES
  ('district-admin@test.sticktime',  'Tulsa District Admin'),
  ('district-admin2@test.sticktime', 'Single Prop Admin')
) AS v(email, callsign)
JOIN auth.users u ON u.email = v.email
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Enterprises + orgs (fixed ids)
-- ---------------------------------------------------------------------------
INSERT INTO public.enterprises (id, name, plan_code, billing_owner_id)
SELECT v.id, v.name, v.plan_code, u.id
FROM (VALUES
  ('ee000000-0000-4000-8000-00000000000a'::uuid,
   'Tulsa STEM District', 'multi_district', 'district-admin@test.sticktime'),
  ('ee000000-0000-4000-8000-00000000000b'::uuid,
   'Single Prop Example', 'standard_squadron', 'district-admin2@test.sticktime')
) AS v(id, name, plan_code, owner_email)
JOIN auth.users u ON u.email = v.owner_email
ON CONFLICT (id) DO NOTHING;

-- Teams first (orgs bridge to them). owner_id = the district admin so
-- the existing teams.owner_id RLS stays coherent.
INSERT INTO public.teams (id, name, description, owner_id)
SELECT v.id, v.name, v.description, u.id
FROM (VALUES
  ('bb000000-0000-4000-8000-0000000000c1'::uuid,
   'Central High Squadron', 'Tulsa STEM District — Central High', 'district-admin@test.sticktime'),
  ('bb000000-0000-4000-8000-0000000000c2'::uuid,
   'North High Squadron', 'Tulsa STEM District — North High', 'district-admin@test.sticktime'),
  ('bb000000-0000-4000-8000-0000000000c3'::uuid,
   'Single Prop Squad', 'Standard squadron example', 'district-admin2@test.sticktime')
) AS v(id, name, description, owner_email)
JOIN auth.users u ON u.email = v.owner_email
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, enterprise_id, team_id, name, is_school)
VALUES
  ('ee000000-0000-4000-8000-0000000000c1'::uuid,
   'ee000000-0000-4000-8000-00000000000a'::uuid,
   'bb000000-0000-4000-8000-0000000000c1'::uuid,
   'Central High Squadron', true),
  ('ee000000-0000-4000-8000-0000000000c2'::uuid,
   'ee000000-0000-4000-8000-00000000000a'::uuid,
   'bb000000-0000-4000-8000-0000000000c2'::uuid,
   'North High Squadron', true),
  ('ee000000-0000-4000-8000-0000000000c3'::uuid,
   'ee000000-0000-4000-8000-00000000000b'::uuid,
   'bb000000-0000-4000-8000-0000000000c3'::uuid,
   'Single Prop Squad', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Team memberships
--    District admins join their sub-squadron teams as members (they are
--    not squadron admins of them — the district role is separate).
--    manager@test.sticktime manages Central High (squadron_admin).
--    owner@test.sticktime owns North High (squadron_admin).
--    member@test.sticktime is a Central High pilot.
-- ---------------------------------------------------------------------------
INSERT INTO public.team_members (team_id, user_id, team_role)
SELECT v.team_id, u.id, v.team_role
FROM (VALUES
  ('bb000000-0000-4000-8000-0000000000c1'::uuid, 'district-admin@test.sticktime',  'member'),
  ('bb000000-0000-4000-8000-0000000000c1'::uuid, 'manager@test.sticktime',         'manager'),
  ('bb000000-0000-4000-8000-0000000000c1'::uuid, 'member@test.sticktime',          'member'),
  ('bb000000-0000-4000-8000-0000000000c2'::uuid, 'owner@test.sticktime',           'owner'),
  ('bb000000-0000-4000-8000-0000000000c2'::uuid, 'district-admin@test.sticktime',  'member'),
  ('bb000000-0000-4000-8000-0000000000c3'::uuid, 'district-admin2@test.sticktime', 'owner')
) AS v(team_id, email, team_role)
JOIN auth.users u ON u.email = v.email
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_members tm
   WHERE tm.team_id = v.team_id AND tm.user_id = u.id
);

-- ---------------------------------------------------------------------------
-- 4. Policies — a mix so every enforcement path is demoable
-- ---------------------------------------------------------------------------
INSERT INTO public.enterprise_policies
  (enterprise_id, org_id, policy_key, enabled, min_firmware_version)
VALUES
  -- District defaults: off, visible as the baseline.
  ('ee000000-0000-4000-8000-00000000000a'::uuid, NULL,
   'lock_profile_settings', false, NULL),
  ('ee000000-0000-4000-8000-00000000000a'::uuid, NULL,
   'require_preflight_checklist', false, NULL),
  ('ee000000-0000-4000-8000-00000000000a'::uuid, NULL,
   'enforce_firmware_version', false, '4.5.0'),
  ('ee000000-0000-4000-8000-00000000000a'::uuid, NULL,
   'lock_inventory', false, NULL),
  -- Central High overrides: preflight + firmware enforced, profiles open.
  ('ee000000-0000-4000-8000-00000000000a'::uuid,
   'ee000000-0000-4000-8000-0000000000c1'::uuid,
   'require_preflight_checklist', true, NULL),
  ('ee000000-0000-4000-8000-00000000000a'::uuid,
   'ee000000-0000-4000-8000-0000000000c1'::uuid,
   'enforce_firmware_version', true, '4.5.1'),
  -- North High: profile lock on (the "account lockdown" demo).
  ('ee000000-0000-4000-8000-00000000000a'::uuid,
   'ee000000-0000-4000-8000-0000000000c2'::uuid,
   'lock_profile_settings', true, NULL),
  -- Single Prop (standard tier): inventory lock demo.
  ('ee000000-0000-4000-8000-00000000000b'::uuid,
   'ee000000-0000-4000-8000-0000000000c3'::uuid,
   'lock_inventory', true, NULL)
ON CONFLICT (enterprise_id, org_id, policy_key) DO NOTHING;

-- NULLs never collide in unique constraints, so re-runs would pile up
-- district-default rows: dedupe explicitly (keep the earliest).
DELETE FROM public.enterprise_policies p
 USING public.enterprise_policies q
 WHERE p.org_id IS NULL AND q.org_id IS NULL
   AND p.enterprise_id = q.enterprise_id
   AND p.policy_key = q.policy_key
   AND p.updated_at > q.updated_at;

-- ---------------------------------------------------------------------------
-- 5. Meetups + RSVPs
-- ---------------------------------------------------------------------------
INSERT INTO public.squadron_meetups
  (id, organization_id, title, description, location, start_time, end_time, created_by)
SELECT v.id, v.org_id, v.title, v.description, v.location,
       now() + v.start_offset, now() + v.end_offset, u.id
FROM (VALUES
  ('ff000000-0000-4000-8000-0000000000a1'::uuid,
   'ee000000-0000-4000-8000-0000000000c1'::uuid,
   'Practice: Gate Racing',
   'Laps on the central field. Bring charged packs.',
   'Central High field',
   interval '2 days', interval '2 days 2 hours',
   'manager@test.sticktime'),
  ('ff000000-0000-4000-8000-0000000000a2'::uuid,
   'ee000000-0000-4000-8000-0000000000c2'::uuid,
   'Build Workshop: First Person View Basics',
   'Soldering stations open. Flux provided.',
   'North High shop room',
   interval '5 days', interval '5 days 3 hours',
   'owner@test.sticktime'),
  ('ff000000-0000-4000-8000-0000000000a3'::uuid,
   'ee000000-0000-4000-8000-0000000000c1'::uuid,
   'Race Day vs. North High',
   'Inter-squadron scrimmage. District admins judging.',
   'Tulsa STEM park course',
   interval '9 days', interval '9 days 4 hours',
   'manager@test.sticktime')
) AS v(id, org_id, title, description, location, start_offset, end_offset, email)
JOIN auth.users u ON u.email = v.email
ON CONFLICT (id) DO NOTHING;

-- Keep old meetups from piling up across repeated migrations: drop the
-- past demo rows whose windows have long elapsed (idempotent re-runs).
DELETE FROM public.squadron_meetups
WHERE id IN ('ff000000-0000-4000-8000-0000000000a1'::uuid,
             'ff000000-0000-4000-8000-0000000000a2'::uuid,
             'ff000000-0000-4000-8000-0000000000a3'::uuid)
  AND end_time < now() - interval '7 days';

INSERT INTO public.meetup_rsvps (meetup_id, user_id, response)
SELECT v.meetup_id, u.id, v.response
FROM (VALUES
  ('ff000000-0000-4000-8000-0000000000a1'::uuid, 'member@test.sticktime', 'attending'),
  ('ff000000-0000-4000-8000-0000000000a1'::uuid, 'district-admin@test.sticktime', 'attending'),
  ('ff000000-0000-4000-8000-0000000000a3'::uuid, 'member@test.sticktime', 'attending'),
  ('ff000000-0000-4000-8000-0000000000a3'::uuid, 'owner@test.sticktime', 'declined')
) AS v(meetup_id, email, response)
JOIN auth.users u ON u.email = v.email
ON CONFLICT (meetup_id, user_id) DO NOTHING;

-- ============================================================
-- End of migration
-- ============================================================
