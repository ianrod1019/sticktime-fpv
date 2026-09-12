-- ============================================================================
-- SECURITY HARDENING — 2026-09-11
--
-- Apply with: supabase db push   (or paste into the Supabase SQL editor)
--
-- Fixes found by the security audit:
--   1. CRITICAL  create_user_profile() accepted a caller-supplied role, and
--                handle_new_user() passed raw_user_meta_data->>'role' into it.
--                Supabase's public signup API accepts arbitrary user metadata,
--                so ANYONE could self-assign role='admin' / tier='pro' at
--                signup. (Confirmed by Supabase Security Advisor.)
--   2. CRITICAL  protect_profile_system_fields() is SECURITY DEFINER, so its
--                `current_user = 'postgres'` check was ALWAYS true — the
--                trigger never stripped role/tier from user updates.
--   3. HIGH      generate_random_invite_code() used non-crypto random() —
--                invite codes were guessable.
--   4. HIGH      Ten SECURITY DEFINER functions had no `SET search_path`,
--                leaving search-path hijack vectors (payload runs as definer).
--   5. MEDIUM    Admin-only RPCs and helper functions were granted to PUBLIC
--                / anon — unnecessary attack surface.
--   6. MEDIUM    profiles INSERT policy had WITH CHECK (true).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. create_user_profile: role/tier are never caller-controlled anymore.
--    Signature is unchanged so existing server-side callers keep working.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_user_profile (
  p_user_id uuid,
  p_role    text DEFAULT 'user'::text,
  p_tier    text DEFAULT 'free'::text
)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      v_profile public.profiles;
    BEGIN
      -- p_role / p_tier are intentionally IGNORED. Privilege fields must never
      -- come from user-controlled signup metadata; new profiles are always
      -- created as free-tier users and promoted only via server-side code.
      INSERT INTO public.profiles (id, role, tier, created_at, updated_at)
      VALUES (p_user_id, 'user', 'free', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
        SET updated_at = NOW()
      RETURNING * INTO v_profile;

      RETURN v_profile;
    END;
    $function$;

-- The signup trigger must not trust metadata either.
CREATE OR REPLACE FUNCTION public.handle_new_user ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    BEGIN
      -- Never read raw_user_meta_data->>'role' / ->>'tier': those are
      -- client-controlled on Supabase signup. Always create a plain user.
      PERFORM public.create_user_profile(new.id);
      RETURN NEW;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
      RETURN NEW;
    END;
    $function$;

-- Only server-side roles may call the profile factory directly.
REVOKE EXECUTE ON FUNCTION public.create_user_profile(uuid, text, text)
  FROM anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 2. protect_profile_system_fields: must be SECURITY INVOKER, otherwise
--    current_user is always the function owner ('postgres') and the guard
--    never fires. As invoker, current_user reflects the real caller role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_system_fields ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      caller_role text;
    BEGIN
      -- Privileged DB roles (server admin code, SQL editor) bypass the guard.
      IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        NEW.updated_at := now();
        RETURN NEW;
      END IF;

      -- Admin/dev users may manage system fields on any profile.
      IF auth.uid() IS NOT NULL THEN
        SELECT role INTO caller_role
        FROM public.profiles
        WHERE id = auth.uid();
      END IF;

      IF caller_role IS DISTINCT FROM 'admin'
         AND caller_role IS DISTINCT FROM 'dev' THEN
        NEW.role := OLD.role;
        NEW.tier := OLD.tier;
      END IF;

      NEW.updated_at := now();
      RETURN NEW;
    END;
    $function$;

-- ---------------------------------------------------------------------------
-- 3. Invite codes: cryptographically random, unambiguous charset (32 chars,
--    no I/O/0/1). 256 % 32 = 0, so byte % 32 is bias-free.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_random_invite_code ()
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions'
  AS $function$
    DECLARE
      chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      result text := '';
      raw bytea;
      i integer;
    BEGIN
      WHILE length(result) < 8 LOOP
        raw := gen_random_bytes(8);
        FOR i IN 1..8 LOOP
          EXIT WHEN length(result) >= 8;
          result := result || substr(chars, (get_byte(raw, i - 1) % 32) + 1, 1);
        END LOOP;
      END LOOP;
      RETURN result;
    END;
    $function$;

-- Only triggers and RPCs should generate codes, never clients directly.
REVOKE EXECUTE ON FUNCTION public.generate_random_invite_code()
  FROM anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 4. Pin search_path on every SECURITY DEFINER function that lacked it
--    (bodies unchanged — this only removes the search-path hijack vector).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin ()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'dev')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_team_invite_code (_team_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      _new_code text;
      _user_role text;
      _current_user_id uuid;
    BEGIN
      _current_user_id := auth.uid();

      SELECT team_role INTO _user_role
      FROM public.team_members
      WHERE team_id = _team_id AND user_id = _current_user_id;

      IF _user_role IS NULL OR _user_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Access denied: Only squadron owners and managers can generate or regenerate invite codes.';
      END IF;

      LOOP
        _new_code := public.generate_random_invite_code();
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.team_invite_codes WHERE code = _new_code
        );
      END LOOP;

      INSERT INTO public.team_invite_codes (team_id, code, created_by, expires_at)
      VALUES (_team_id, _new_code, _current_user_id, now() + interval '30 days');

      RETURN _new_code;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.auto_generate_team_invite_code_trigger ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      _new_code text;
    BEGIN
      LOOP
        _new_code := public.generate_random_invite_code();
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.team_invite_codes WHERE code = _new_code
        );
      END LOOP;

      INSERT INTO public.team_invite_codes (team_id, code, created_by, expires_at)
      VALUES (NEW.id, _new_code, NEW.owner_id, now() + interval '30 days');

      RETURN NEW;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.dissolve_squadron (_team_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      _owner_id uuid;
    BEGIN
      SELECT owner_id INTO _owner_id
      FROM public.teams
      WHERE id = _team_id;

      IF _owner_id IS NULL THEN
        RAISE EXCEPTION 'Squadron not found.';
      END IF;

      IF _owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Only the squadron owner can dissolve this squadron.';
      END IF;

      DELETE FROM public.teams WHERE id = _team_id;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.is_team_member (_team_id uuid, _user_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_team_owner (_team_id uuid, _user_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = _team_id AND owner_id = _user_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.share_team (_user_a uuid, _user_b uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF _user_a = _user_b THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.team_members m1
    JOIN public.team_members m2 ON m1.team_id = m2.team_id
    WHERE m1.user_id = _user_a AND m2.user_id = _user_b
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_pilot_settings ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    BEGIN
      INSERT INTO public.pilot_settings (user_id, callsign)
      VALUES (new.id, split_part(new.email, '@', 1))
      ON CONFLICT (user_id) DO NOTHING;
      RETURN new;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_settings ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    BEGIN
      INSERT INTO public.pilot_settings (id)
      VALUES (new.id)
      ON CONFLICT (id) DO NOTHING;
      RETURN new;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_credential ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  INSERT INTO public.credentials (id, email, last_login_at, is_active)
  VALUES (new.id, new.email, now(), true)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      last_login_at = now(),
      updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_credential_record ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    BEGIN
      INSERT INTO public.credentials (id, email, password_hash)
      VALUES (
        new.id,
        new.email,
        COALESCE(new.encrypted_password, 'managed_by_supabase_auth')
      )
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          last_login_at = now(),
          updated_at = now();
      RETURN new;
    END;
    $function$;

-- ---------------------------------------------------------------------------
-- 5. Reduce RPC surface: admin helpers and the retoken logger should not be
--    callable by anon/public. (They still verify the caller's role inside,
--    so authenticated grants are unchanged.)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_get_active_sessions_count() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_admin_directory()      FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_db_health()            FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_security_logs()        FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_count()           FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_emails()          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_and_force_retoken(text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                FROM anon, public;

-- ---------------------------------------------------------------------------
-- 6. Tighten the profiles INSERT policy: a user may only create their OWN
--    profile, and only as a plain free-tier user. (Triggers and service_role
--    bypass RLS, so this does not affect the signup trigger.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable insert for users and triggers" ON public.profiles;
CREATE POLICY "Enable insert for users and triggers" ON public.profiles
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (id = auth.uid() AND role = 'user' AND tier = 'free');
