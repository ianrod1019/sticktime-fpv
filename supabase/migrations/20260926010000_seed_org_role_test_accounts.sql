-- ============================================================
-- Migration: Seed org_role test accounts + test squadron
--
-- A stable cast for exercising (and demoing) the typed role system.
-- Six accounts cover every branch of the access matrix:
--
--   owner@test.sticktime     owner of "RBAC Test Squadron"   (pro tier)
--   manager@test.sticktime   manager                          (pro tier)
--   member@test.sticktime    member, ledger NOT granted       (free tier)
--   member2@test.sticktime   member, ledger GRANTED           (free tier)
--   pilot@test.sticktime     NOT a member — the locked-out case (free tier)
--   admin@test.sticktime     platform admin, also a member    (enterprise tier)
--
-- (Six accounts: member comes in two flavors so the can_view_ledger
-- grant is testable without mutating the seed.)
--
-- PASSWORDS ARE DOCUMENTED DEV CREDENTIALS — DO NOT RUN ON PROD.
--   Passw0rd!owner / Passw0rd!manager / Passw0rd!member /
--   Passw0rd!member2 / Passw0rd!pilot / Passw0rd!admin
-- User ids are fixed literals so the whole cast is addressable and
-- idempotent. Re-running re-asserts passwords and memberships.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Auth users (fixed ids, confirmed emails so they can log in)
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
  ('aa000000-0000-4000-8000-000000000001'::uuid, 'owner@test.sticktime',   'Passw0rd!owner',   'RBAC Owner'),
  ('aa000000-0000-4000-8000-000000000002'::uuid, 'manager@test.sticktime', 'Passw0rd!manager', 'RBAC Manager'),
  ('aa000000-0000-4000-8000-000000000003'::uuid, 'member@test.sticktime',  'Passw0rd!member',  'RBAC Member'),
  ('aa000000-0000-4000-8000-000000000004'::uuid, 'member2@test.sticktime', 'Passw0rd!member2', 'RBAC Member2'),
  ('aa000000-0000-4000-8000-000000000005'::uuid, 'pilot@test.sticktime',   'Passw0rd!pilot',   'RBAC Pilot'),
  ('aa000000-0000-4000-8000-000000000006'::uuid, 'admin@test.sticktime',   'Passw0rd!admin',   'RBAC Admin')
) AS v(id, email, password, callsign)
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = v.email);

-- ---------------------------------------------------------------------------
-- 1a. Token columns — GoTrue's user scan errors on NULL confirmation_token
-- ("converting NULL to string is unsupported"), so populate what the admin
-- API would normally fill for a confirmed user.
-- ---------------------------------------------------------------------------
UPDATE auth.users
SET confirmation_token = md5(random()::text || clock_timestamp()::text),
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    email_change_token_current = ''
WHERE email LIKE '%@test.sticktime'
  AND confirmation_token IS NULL;

-- ---------------------------------------------------------------------------
-- 1b. Email identities — the password grant 500s without an auth.identities
-- row per user (the row the GoTrue admin API would have created). Convention
-- for email identities: provider = 'email', provider_id = user id.
-- ---------------------------------------------------------------------------
INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data,
                             last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
FROM auth.users u
WHERE u.email LIKE '%@test.sticktime'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  );

-- ---------------------------------------------------------------------------
-- 2. Profiles (platform role + tier per the matrix)
-- ---------------------------------------------------------------------------
-- The on_auth_user_created trigger creates a default profile
-- (user/free) for each new auth user, so this insert alone is not
-- enough — step 2b then asserts the matrix values.
INSERT INTO public.profiles (id, role, tier)
SELECT u.id, v.role, v.tier
FROM (VALUES
  ('owner@test.sticktime',   'user',  'pro'),
  ('manager@test.sticktime', 'user',  'pro'),
  ('member@test.sticktime',  'user',  'free'),
  ('member2@test.sticktime', 'user',  'free'),
  ('pilot@test.sticktime',   'user',  'free'),
  ('admin@test.sticktime',   'admin', 'enterprise')
) AS v(email, role, tier)
JOIN auth.users u ON u.email = v.email
ON CONFLICT (id) DO NOTHING;

-- 2b. Assert the matrix values (the trigger's defaults would otherwise win).
UPDATE public.profiles p
SET role = v.role, tier = v.tier, updated_at = now()
FROM (VALUES
  ('owner@test.sticktime',   'user',  'pro'),
  ('manager@test.sticktime', 'user',  'pro'),
  ('member@test.sticktime',  'user',  'free'),
  ('member2@test.sticktime', 'user',  'free'),
  ('pilot@test.sticktime',   'user',  'free'),
  ('admin@test.sticktime',   'admin', 'enterprise')
) AS v(email, role, tier)
JOIN auth.users u ON u.email = v.email
WHERE p.id = u.id
  AND (p.role IS DISTINCT FROM v.role OR p.tier IS DISTINCT FROM v.tier);

-- ---------------------------------------------------------------------------
-- 3. The test squadron, owned by owner@test.sticktime
-- ---------------------------------------------------------------------------
INSERT INTO public.teams (id, name, description, owner_id)
SELECT 'bb000000-0000-4000-8000-000000000001'::uuid, 'RBAC Test Squadron',
       'Seeded squadron for testing the org_role access matrix',
       u.id
FROM auth.users u WHERE u.email = 'owner@test.sticktime'
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------- 4. Memberships. NOTE: teams.owner_id is NOT implicit membership in this
--    app — the owner gets an explicit 'owner' team_members row, as the
--    squadron UI expects. member2 carries the ledger grant.
--    Re-asserted on every run: UPDATE repairs drift (e.g. a grant flipped
--    through the Squadron Management UI during RBAC testing), then any
--    still-missing rows are inserted.
--    ---------------------------------------------------------------------------
UPDATE public.team_members tm
SET team_role = r.role, can_view_ledger = r.ledger, role_id = NULL
FROM (VALUES
  ('owner@test.sticktime',   'owner',   false),
  ('manager@test.sticktime', 'manager', false),
  ('member@test.sticktime',  'member',  false),
  ('member2@test.sticktime', 'member',  true),
  ('admin@test.sticktime',   'member',  false)
) AS r(email, role, ledger)
JOIN auth.users u ON u.email = r.email
WHERE tm.team_id = 'bb000000-0000-4000-8000-000000000001'::uuid
  AND tm.user_id = u.id
  AND (tm.team_role IS DISTINCT FROM r.role OR tm.can_view_ledger IS DISTINCT FROM r.ledger);

INSERT INTO public.team_members (team_id, user_id, team_role, can_view_ledger)
SELECT 'bb000000-0000-4000-8000-000000000001'::uuid, u.id, r.role::text, r.ledger
FROM (VALUES
  ('owner@test.sticktime',   'owner',   false),
  ('manager@test.sticktime', 'manager', false),
  ('member@test.sticktime',  'member',  false),
  ('member2@test.sticktime', 'member',  true),
  ('admin@test.sticktime',   'member',  false)
) AS r(email, role, ledger)
JOIN auth.users u ON u.email = r.email
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_members tm
  WHERE tm.team_id = 'bb000000-0000-4000-8000-000000000001'::uuid
    AND tm.user_id = u.id
);

-- ---------------------------------------------------------------------------
-- 5. Re-assert the documented passwords (idempotent re-runs)
-- ---------------------------------------------------------------------------
UPDATE auth.users
SET encrypted_password = crypt('Passw0rd!' || split_part(email, '@', 1), gen_salt('bf'))
WHERE email LIKE '%@test.sticktime';
