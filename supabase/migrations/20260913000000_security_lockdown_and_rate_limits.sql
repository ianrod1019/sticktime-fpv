-- ============================================================================
-- SECURITY LOCKDOWN + RATE LIMITS — 2026-09-13
--
-- Companion to 20260917000000_security_hardening.sql. Covers the checklist
-- items that live in the database:
--   1. RESTRICT DATABASE PERMISSIONS — the 2026-09-07 remote-schema dump
--      granted full DML on every public table to `anon`. RLS masks it today,
--      but the grants themselves are attack surface: any future table created
--      without RLS (or a policy mistake) would be world-writable. Revoke
--      everything from anon and re-grant only what the Data API needs.
--   2. RATE LIMITING — a reusable fixed-window bucket + consume RPC for edge
--      functions to call (per-user limits, protects the API bill).
--   3. LOG SECURITY EVENTS — a safe client-facing logger for auth events
--      (password change, recovery requested, ...). Clients may only ever
--      stamp their own user_id; action is from a fixed allowlist.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lock down `anon` on the exposed schemas.
--    anon = unauthenticated Data API callers. Legit reads are covered by
--    per-table SELECT grants below where actually needed; everything else
--    (write surface) is gone. `authenticated` grants are untouched: RLS is
--    the boundary for signed-in users.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('public', 'personal_gear', 'org_gear')
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON %I.%I FROM anon',
      t.table_schema, t.table_name
    );
  END LOOP;
END $$;

-- The app is SPA + authenticated-only; anon never needs table SELECT either
-- (Supabase Auth endpoints are not Data API tables). If a future public
-- landing query ever needs anon SELECT, grant it explicitly on that table.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('public', 'personal_gear', 'org_gear')
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'REVOKE SELECT ON %I.%I FROM anon',
      t.table_schema, t.table_name
    );
  END LOOP;
END $$;

-- Belt and braces: anon shouldn't execute user-space RPCs either. Functions
-- that legitimately serve anon calls (none today) would need a re-grant.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'personal_gear', 'org_gear')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f.fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Fixed-window rate limiting, shared by edge functions.
--    One upsert per check; key format is "<scope>:<identifier>" e.g.
--    "update-profile:<user-uuid>". Window is fixed (not sliding) — cheap,
--    good enough for bill protection and abuse damping.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer NOT NULL DEFAULT 0
);

-- The table is only ever touched through the SECURITY DEFINER RPC.
REVOKE ALL ON public.rate_limit_buckets FROM anon, authenticated;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limit_buckets service only" ON public.rate_limit_buckets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Returns true when the call is ALLOWED (and consumes one token).
-- Note the double IN-out: window_start is both read and written.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key            text,
  p_max_events     integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now       timestamptz := now();
  v_start     timestamptz;
  v_count     integer;
BEGIN
  IF p_key IS NULL OR p_key = '' THEN
    RAISE EXCEPTION 'rate limit key required';
  END IF;
  IF p_max_events IS NULL OR p_max_events < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'rate limit parameters must be positive';
  END IF;

  SELECT window_start, count
    INTO v_start, v_count
  FROM public.rate_limit_buckets
  WHERE key = p_key
  FOR UPDATE;

  IF v_start IS NULL OR v_start <= v_now - make_interval(secs => p_window_seconds) THEN
    -- New window (or first ever call): start fresh at 1 consumed.
    INSERT INTO public.rate_limit_buckets (key, window_start, count)
    VALUES (p_key, v_now, 1)
    ON CONFLICT (key) DO UPDATE
      SET window_start = EXCLUDED.window_start,
          count        = 1;
    RETURN true;
  END IF;

  IF v_count >= p_max_events THEN
    RETURN false; -- window exhausted
  END IF;

  UPDATE public.rate_limit_buckets
     SET count = count + 1
   WHERE key = p_key;
  RETURN true;
END;
$function$;

-- Edge functions call this with their anon key + caller JWT, i.e. as
-- `authenticated`; `anon` gets it too so pre-auth endpoints (future) can
-- rate limit by IP string.
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer)
  TO anon, authenticated;

-- Housekeeping: drop buckets idle for a day. Run via pg_cron if installed,
-- otherwise call manually; worst case the table just grows slowly.
CREATE OR REPLACE FUNCTION public.prune_rate_limit_buckets()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DELETE FROM public.rate_limit_buckets
   WHERE window_start < now() - interval '1 day';
$function$;
REVOKE EXECUTE ON FUNCTION public.prune_rate_limit_buckets()
  FROM anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 3. log_security_event — client-callable, self-scoped, allowlisted actions.
--    security_logs columns: user_id, path, action, ip_address, user_agent,
--    created_at. Clients can't spoof other users (auth.uid() is authoritative)
--    and can't write arbitrary event types.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_action text,
  p_detail text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'log_security_event requires an authenticated caller';
  END IF;
  IF p_action NOT IN (
    'password_changed',
    'password_change_failed',
    'recovery_requested',
    'recovery_completed',
    'password_reset_other_sessions'
  ) THEN
    RAISE EXCEPTION 'unknown security event: %', p_action;
  END IF;

  INSERT INTO public.security_logs (user_id, path, action, ip_address, user_agent)
  VALUES (
    v_uid,
    left(coalesce(p_detail, 'client'), 512),
    p_action,
    NULL,          -- ip is not client-trustable; server helpers can add it
    NULL
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_security_event(text, text)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, text)
  FROM anon, public;
