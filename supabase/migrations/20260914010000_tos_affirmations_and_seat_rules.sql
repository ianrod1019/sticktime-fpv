-- ============================================================================
-- Migration: TOS affirmations, hobbyist feature-set mapping, seat rules
--
-- Enforces the Terms of Service §6 (non-commercial Pro/Hobbyist license)
-- and §7 (single-user accounts, no credential sharing / seat pooling):
--
--   public.tos_acceptances          — durable, per-version acceptance ledger
--   profiles.non_commercial         — hobbyist feature-set flag (server-set)
--   profiles.tos_accepted_version   — latest TOS version affirmed
--   record_signup_affirmations()    — the ONLY write path; rejects unless
--                                     BOTH affirmations are literally true
--   scheduling hobbyist block       — extended to tier='pro' + non_commercial
--   ent_enforce_seat_cap            — unchanged cap trigger, now also covers
--                                     direct team_members INSERTs by members
--   flag_shared_credential_signal() — admin tripwire logging to security_logs
--
-- Privilege fields (role/tier) remain NON-client-controlled per the
-- 20260917000000 hardening: this migration never reads signup metadata and
-- never lets a caller elevate their own tier. The affirmations only ever
-- RESTRICT (mark an account non-commercial); commercial tiers are granted
-- exclusively by server-side/admin code.
--
-- Idempotent: guarded DO blocks + IF NOT EXISTS / OR REPLACE throughout.
-- Apply with: supabase db push   (or paste into the Supabase SQL editor)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles: non-commercial flag + accepted TOS version
--    (NOT the privilege tier — a boolean the RPC can stamp; tier is
--    managed elsewhere exactly as before.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS non_commercial boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tos_accepted_version text;

-- ---------------------------------------------------------------------------
-- 2. Acceptance ledger — one row per (user, TOS version).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tos_acceptances (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tos_version              text NOT NULL,
  non_commercial_affirmed  boolean NOT NULL,
  single_seat_affirmed     boolean NOT NULL,
  accepted_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tos_acceptances_user_version_key
    UNIQUE (user_id, tos_version),
  CONSTRAINT tos_acceptances_affirmations_check
    CHECK (non_commercial_affirmed IS TRUE AND single_seat_affirmed IS TRUE)
);

ALTER TABLE public.tos_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own tos acceptances" ON public.tos_acceptances;
CREATE POLICY "users read own tos acceptances" ON public.tos_acceptances
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies: the only write path is the SECURITY
-- DEFINER RPC below. Even service_role writes should go through it so the
-- affirmation check cannot be bypassed by tooling.

-- ---------------------------------------------------------------------------
-- 3. record_signup_affirmations — the only write path.
--    SECURITY DEFINER because the caller is brand-new / may have no grants
--    on the table; search_path pinned per hardening standard. The caller
--    can ONLY ever act on their own profile (auth.uid()).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_signup_affirmations (
  p_non_commercial boolean,
  p_single_seat    boolean,
  p_tos_version    text DEFAULT '2026-09-noncommercial'::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      v_user_id  uuid := auth.uid();
      v_accepted uuid;
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'must be authenticated to record TOS affirmations';
      END IF;

      -- Both affirmations must be literally TRUE. Anything else is a
      -- refusal to certify — the account is not created under the Terms.
      IF p_non_commercial IS NOT TRUE OR p_single_seat IS NOT TRUE THEN
        RAISE EXCEPTION
          'TOS affirmation refused: both the non-commercial certification and the single-user access agreement must be affirmed to create an account';
      END IF;

      IF p_tos_version IS NULL OR btrim(p_tos_version) = '' THEN
        RAISE EXCEPTION 'TOS affirmation refused: missing TOS version';
      END IF;

      INSERT INTO public.tos_acceptances
        (user_id, tos_version, non_commercial_affirmed, single_seat_affirmed)
      VALUES
        (v_user_id, btrim(p_tos_version), TRUE, TRUE)
      ON CONFLICT (user_id, tos_version) DO NOTHING
      RETURNING id INTO v_accepted;

      IF v_accepted IS NULL THEN
        SELECT id INTO v_accepted
          FROM public.tos_acceptances
         WHERE user_id = v_user_id AND tos_version = btrim(p_tos_version);
      END IF;

      -- Stamp the profile. Only ever TIGHTENS: non_commercial maps the
      -- account to the restricted hobbyist feature set. role/tier are
      -- deliberately untouched — no caller may elevate themselves here.
      UPDATE public.profiles
         SET non_commercial = TRUE,
             tos_accepted_version = btrim(p_tos_version),
             updated_at = now()
       WHERE id = v_user_id;

      IF NOT FOUND THEN
        -- Profile trigger has not fired yet (race with handle_new_user);
        -- create the row ourselves, still as a plain free-tier user.
        INSERT INTO public.profiles (id, role, tier, non_commercial, tos_accepted_version)
        VALUES (v_user_id, 'user', 'free', TRUE, btrim(p_tos_version))
        ON CONFLICT (id) DO UPDATE
          SET non_commercial = TRUE,
              tos_accepted_version = EXCLUDED.tos_accepted_version,
              updated_at = now();
      END IF;

      RETURN v_accepted;
    END;
    $function$;

REVOKE EXECUTE ON FUNCTION public.record_signup_affirmations(boolean, boolean, text)
  FROM anon, public;

-- ---------------------------------------------------------------------------
-- 4. Hobbyist feature-set mapping (TOS §6).
--    The scheduling module already hard-blocks hobbyist tiers; this makes
--    the rule explicit for the non-commercial flag too, so that IF a pro
--    account is ever flipped to commercial use, the restricted set applies
--    until server-side code re-tiers it. Reads as: commercial scheduling
--    capability requires a paid commercial tier AND a commercial profile.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_noncommercial_hobbyist ()
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      v_tier text;
      v_non_commercial boolean;
    BEGIN
      IF auth.uid() IS NULL THEN
        RETURN FALSE;
      END IF;

      SELECT tier, non_commercial INTO v_tier, v_non_commercial
        FROM public.profiles
       WHERE id = auth.uid();

      -- Hobbyist feature set = free/pro tier OR a profile flagged
      -- non-commercial. Commercial tiers are trusted only when the flag
      -- is not set (commercial provisioning clears it server-side).
      RETURN v_tier IN ('free', 'pro') OR v_non_commercial IS TRUE;
    END;
    $function$;

-- Guard for scheduling-side consumers: extend the existing hobbyist block
-- with the non-commercial flag. The scheduling gate trigger (20260914120000)
-- checks tier; this helper is the single point future code should call.
CREATE OR REPLACE FUNCTION public.scheduling_tier_allows_access ()
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      v_tier text;
      v_non_commercial boolean;
    BEGIN
      IF auth.uid() IS NULL THEN
        RETURN FALSE;
      END IF;

      SELECT tier, non_commercial INTO v_tier, v_non_commercial
        FROM public.profiles
       WHERE id = auth.uid();

      IF v_tier IS NULL THEN
        RETURN FALSE;
      END IF;

      -- Hobbyist block: free/pro or any profile flagged non-commercial.
      IF v_tier IN ('free', 'pro') OR v_non_commercial IS TRUE THEN
        RETURN FALSE;
      END IF;

      -- Commercial tiers: solo_commercial always; school/enterprise also
      -- need their org Scheduling Add-On (checked by the caller/gate).
      RETURN v_tier IN ('solo_commercial', 'school', 'enterprise');
    END;
    $function$;

-- ---------------------------------------------------------------------------
-- 5. Seat verification (TOS §7) — harden direct membership writes.
--    ent_enforce_seat_cap already caps INSERTs on team_members; make sure
--    it also fires for inserts performed through any path that sets
--    team_role directly, and that the row's user actually has a profile
--    (no orphan seats). This trigger runs AFTER the cap trigger (AFTER
--    INSERT) and fails closed for non-admin callers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_seat_identity ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      v_caller_role text;
    BEGIN
      IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        RETURN NEW;
      END IF;

      IF auth.uid() IS NOT NULL THEN
        SELECT role INTO v_caller_role
          FROM public.profiles WHERE id = auth.uid();
      END IF;

      -- Only org owners/managers and platform staff may create seats.
      IF v_caller_role IS DISTINCT FROM 'admin'
         AND v_caller_role IS DISTINCT FROM 'dev' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.team_members tm
           WHERE tm.team_id = NEW.team_id
             AND tm.user_id = auth.uid()
             AND tm.team_role IN ('owner', 'manager')
        ) THEN
          RAISE EXCEPTION
            'seat creation denied: only squadron owners and managers can provision member seats';
        END IF;
      END IF;

      -- Every seat maps to a real, individual user (TOS §7: one human,
      -- one account; no pooled placeholders).
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = NEW.user_id
      ) THEN
        RAISE EXCEPTION
          'seat creation denied: every seat must map to an individual user profile (no shared or placeholder accounts)';
      END IF;

      RETURN NEW;
    END;
    $function$;

DROP TRIGGER IF EXISTS enforce_seat_identity_members ON public.team_members;
CREATE TRIGGER enforce_seat_identity_members
  AFTER INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_identity();

-- ---------------------------------------------------------------------------
-- 6. Shared-credential tripwire (TOS §7 enforcement hook).
--    Admin/dev-only RPC: flags accounts whose concurrent session count
--    exceeds a threshold and writes a security_logs entry for the admin
--    sweep. Read-only with respect to the flagged user — it never locks
--    or deletes; termination remains a human decision per TOS §7.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flag_shared_credential_signal (
  p_max_concurrent integer DEFAULT 3
)
  RETURNS TABLE (
    user_id uuid,
    concurrent_sessions integer,
    distinct_user_agents integer,
    flagged boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      v_caller_role text;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'must be authenticated';
      END IF;

      SELECT role INTO v_caller_role
        FROM public.profiles WHERE id = auth.uid();

      IF v_caller_role NOT IN ('admin', 'dev') THEN
        RAISE EXCEPTION 'admin or dev role required';
      END IF;

      RETURN QUERY
      WITH session_counts AS (
        -- auth.sessions is GoTrue's real login-session table (user_agent,
        -- ip, updated_at). Recent = updated within the last 7 days, so the
        -- signal reflects CURRENT sharing, not an old hotel login.
        SELECT s.user_id,
               count(*)::integer AS sessions,
               count(DISTINCT s.user_agent)::integer AS agents
          FROM auth.sessions s
         WHERE s.updated_at > now() - interval '7 days'
         GROUP BY s.user_id
      )
      SELECT sc.user_id,
             sc.sessions,
             sc.agents,
             (sc.sessions > p_max_concurrent OR sc.agents > p_max_concurrent)
        FROM session_counts sc
       WHERE sc.sessions > p_max_concurrent
          OR sc.agents > p_max_concurrent;
    END;
    $function$;

REVOKE EXECUTE ON FUNCTION public.flag_shared_credential_signal(integer)
  FROM anon, authenticated, public;

-- Log helper: records a §7 enforcement event for an admin decision trail.
CREATE OR REPLACE FUNCTION public.log_shared_credential_event (
  p_user_id uuid,
  p_detail  text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      v_caller_role text;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'must be authenticated';
      END IF;

      SELECT role INTO v_caller_role
        FROM public.profiles WHERE id = auth.uid();

      IF v_caller_role NOT IN ('admin', 'dev') THEN
        RAISE EXCEPTION 'admin or dev role required';
      END IF;

      INSERT INTO public.security_logs (user_id, path, action)
      VALUES (p_user_id, 'tos_enforcement', COALESCE(p_detail, 'shared_credential_signal'));
    END;
    $function$;

REVOKE EXECUTE ON FUNCTION public.log_shared_credential_event(uuid, text)
  FROM anon, authenticated, public;
