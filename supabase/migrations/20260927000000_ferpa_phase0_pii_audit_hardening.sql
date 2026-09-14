-- ============================================================
-- Migration: FERPA Phase 0 — PII minimization + audit integrity
--
-- Three holes closed, in dependency order:
--
--   1. CALLSIGN EMAIL LEAK — handle_new_pilot_settings() defaulted the
--      public callsign to the signup email's local-part. In a school
--      roster that publishes every student's name-bearing email
--      fragment to their whole squadron. New defaults are now a
--      non-identifying stable "pilot-<hash>" label; existing rows that
--      still carry an email local-part are rewritten ONCE by a guarded
--      one-time sweep (rows a pilot renamed themselves keep their name).
--
--   2. FORGEABLE AUDIT TRAIL — security_logs carried a direct INSERT
--      policy ("Users can insert their own security logs"), so any
--      authenticated user could fabricate "unauthorized access attempt"
--      rows and poison incident investigations. Inserts now flow only
--      through server-side SECURITY DEFINER paths (log_security_event,
--      log_and_force_retoken) and server-owned writes.
--
--   3. AUDIT TABLE MUTABILITY — admin_audit_logs was append-only only
--      by accident (RLS simply had no UPDATE/DELETE policy for
--      authenticated). Now immutable BY CONSTRUCTION: UPDATE/DELETE/
--      TRUNCATE are revoked from every client-facing role and blocked
--      by triggers even when RLS is bypassed via another vehicle.
--      platform admins keep direct INSERT (the admin panel writes its
--      own actions there); they may UPDATE only the nullable
--      identity links, which is the documented pseudonymization path
--      used by account purge (GDPR/FERPA erasure vs. retention).
--
-- Safe to re-run; statements are idempotent.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Callsign default no longer derives from the email address
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_pilot_settings()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    BEGIN
      -- The callsign is public to squadrons; deriving it from the email
      -- local-part leaks personally-identifying fragments. Default to a
      -- non-identifying stable label derived from the user id instead.
      INSERT INTO public.pilot_settings (user_id, callsign)
      VALUES (
        new.id,
        'pilot-' || left(replace(new.id::text, '-', ''), 8)
      )
      ON CONFLICT (user_id) DO NOTHING;
      RETURN new;
    END;
    $function$;

-- One-time cleanup: any callsign that still equals an email local-part was
-- never chosen by its owner (pilot_settings has no way to know the email,
-- so this can only be the old trigger default). Leave every other callsign
-- — including user-chosen ones — untouched.
UPDATE public.pilot_settings ps
   SET callsign = 'pilot-' || left(replace(ps.user_id::text, '-', ''), 8),
       updated_at = now()
  FROM auth.users u
 WHERE u.id = ps.user_id
   AND ps.callsign = split_part(u.email, '@', 1);

-- ---------------------------------------------------------------------------
-- 2. security_logs: inserts only via server-side definer paths
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own security logs"
  ON public.security_logs;
DROP POLICY IF EXISTS "authenticated can insert own security_logs"
  ON public.security_logs;

-- Close the direct-table INSERT grant too (20260907231511 granted DML to
-- anon/authenticated broadly). Reads for the admin panel keep flowing
-- through admin_get_security_logs / admin-only policies.
REVOKE INSERT ON public.security_logs FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. admin_audit_logs: immutable by construction
-- ---------------------------------------------------------------------------
-- No client-facing role may rewrite or remove history.
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs
  FROM anon, authenticated;

-- Defense in depth: block UPDATE/DELETE at the engine level even if RLS is
-- disabled by another vehicle. Platform staff (admin/dev) may still NULL
-- actor/target links during account pseudonymization — the documented
-- erasure path that keeps the fact but drops the identity.
CREATE OR REPLACE FUNCTION public.enforce_audit_log_append_only()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'admin_audit_logs is append-only: % blocked', TG_OP;
  END IF;
  -- UPDATE: only the identity-severing path is legitimate (NULLing
  -- actor_id/target_id during account pseudonymization). Every content
  -- column is immutable, always.
  IF NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.action IS DISTINCT FROM OLD.action
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'admin_audit_logs rows are immutable (only actor_id/target_id may be severed)';
  END IF;
  IF NOT (
    current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'dev')
    )
  ) THEN
    RAISE EXCEPTION 'admin_audit_logs links may only be severed by platform staff';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS audit_log_no_update ON public.admin_audit_logs;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_append_only();

DROP TRIGGER IF EXISTS audit_log_no_delete ON public.admin_audit_logs;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_append_only();

-- ============================================================
-- End of migration
-- ============================================================
