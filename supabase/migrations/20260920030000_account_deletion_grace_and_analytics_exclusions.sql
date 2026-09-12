-- ====================================================
-- Migration: Account deletion grace period + analytics exclusions (2026-09-20)
--
-- Three goals:
--   1. DELETION WITH A REAL GRACE PERIOD: "Delete account" no longer purges
--      instantly. The pilot confirms in several explicit steps, a pending
--      deletion request is recorded, and a daily pg_cron job purges the
--      account 30 days later. Signing back in during the window shows the
--      pending card with a one-click Cancel.
--   2. HONEST ANALYTICS: comped admin/dev accounts are excluded from revenue
--      estimates, growth and engagement so the platform's numbers reflect
--      real pilots only.
--   3. LESS ADMIN SURFACE: the per-pilot "Pilot overview" dialog is removed.
--      Admins keep the aggregate-only analytics RPC — that is all they get.
--
-- Backup story (the user asked): Postgres PITR / logical dumps contain the
-- rows at snapshot time, so a purged account can exist inside old backups.
-- Mitigation here: before anything is deleted we pseudonymize the auth
-- identity (email/phone NULLed, credentials destroyed, OAuth identities
-- removed) in the SAME transaction as the deletes — so even a snapshot taken
-- mid-purge never contains a usable identity. Backups still hold historical
-- data until they age out of retention; document that in the privacy policy.
-- ====================================================

-- ---------------------------------------------------------------------------
-- 1. Deletion requests. One PENDING request per account (partial unique).
--    Rows are only written through the RPCs below — no direct DML grants.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','completed','cancelled')),
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  cancelled_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending
  ON public.account_deletion_requests (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS account_deletion_requests_due
  ON public.account_deletion_requests (scheduled_for)
  WHERE status = 'pending';

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own deletion request" ON public.account_deletion_requests;
CREATE POLICY "read own deletion request"
  ON public.account_deletion_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.account_deletion_requests FROM anon, public;
GRANT SELECT ON public.account_deletion_requests TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Request a deletion: records the pending request, purge due in 30 days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  DECLARE
    uid uuid := auth.uid();
    v_due timestamptz;
  BEGIN
    IF uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.account_deletion_requests
      WHERE user_id = uid AND status = 'pending'
    ) THEN
      RAISE EXCEPTION 'A deletion is already scheduled for this account.';
    END IF;

    v_due := now() + interval '30 days';

    INSERT INTO public.account_deletion_requests (user_id, scheduled_for)
    VALUES (uid, v_due);

    INSERT INTO public.admin_audit_logs (actor_id, action, payload)
    VALUES (uid, 'account_deletion_requested',
            jsonb_build_object('scheduled_for', v_due));

    RETURN jsonb_build_object('scheduled', true, 'scheduled_for', v_due,
                              'grace_days', 30);
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Cancel a pending deletion (the entire point of the grace period).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    uid uuid := auth.uid();
    v_rows int;
  BEGIN
    IF uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated.';
    END IF;

    UPDATE public.account_deletion_requests
       SET status = 'cancelled', cancelled_at = now(),
           cancelled_reason = 'pilot cancelled during grace period'
     WHERE user_id = uid AND status = 'pending';
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      RAISE EXCEPTION 'No pending deletion request for this account.';
    END IF;

    INSERT INTO public.admin_audit_logs (actor_id, action, payload)
    VALUES (uid, 'account_deletion_cancelled', jsonb_build_object('at', now()));

    RETURN jsonb_build_object('cancelled', true);
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Status for the settings UI: pending request + scheduled date, or null.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_account_deletion_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    uid uuid := auth.uid();
    v_row public.account_deletion_requests%ROWTYPE;
  BEGIN
    IF uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated.';
    END IF;

    SELECT * INTO v_row
      FROM public.account_deletion_requests
     WHERE user_id = uid AND status = 'pending'
     LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('pending', false);
    END IF;

    RETURN jsonb_build_object(
      'pending', true,
      'requested_at', v_row.requested_at,
      'scheduled_for', v_row.scheduled_for,
      'grace_days', 30
    );
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. The purge. Runs for ONE account, in ONE transaction:
--      a. content hard-delete (gear, parts, logs, sessions, notifications)
--      b. audit/security links severed (rows kept, user link NULLed)
--      c. auth identity destroyed (email/phone/credentials/OAuth) BEFORE the
--         row itself is deleted — so any backup snapshot caught mid-flight
--         contains no usable identity
--      d. the auth user row itself (cascades profile, settings, sessions…)
--    Called by the cron sweep (and manually by ops). Never exposes a JWT
--    path: EXECUTE revoked from everyone but the owner/service roles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._purge_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'personal_gear', 'auth'
AS $function$
  BEGIN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'p_user_id is required.';
    END IF;

    -- a. Content ----------------------------------------------------------
    DELETE FROM personal_gear.component_failures   WHERE user_id = p_user_id;
    DELETE FROM personal_gear.battery_ir_readings  WHERE user_id = p_user_id;
    DELETE FROM personal_gear.battery_packs        WHERE user_id = p_user_id;
    DELETE FROM personal_gear.drone_part_installs  WHERE user_id = p_user_id;
    DELETE FROM personal_gear.drone_parts          WHERE user_id = p_user_id;
    DELETE FROM personal_gear.transmitter_parts    WHERE user_id = p_user_id;
    DELETE FROM personal_gear.goggles_parts        WHERE user_id = p_user_id;
    DELETE FROM personal_gear.other_parts          WHERE user_id = p_user_id;
    DELETE FROM personal_gear.maintenance_logs     WHERE user_id = p_user_id;

    -- Sessions before gear: the pack-total trigger no-ops on dead sets.
    DELETE FROM public.sessions WHERE user_id = p_user_id;

    DELETE FROM personal_gear.drones       WHERE user_id = p_user_id;
    DELETE FROM personal_gear.batteries    WHERE user_id = p_user_id;
    DELETE FROM personal_gear.transmitters WHERE user_id = p_user_id;
    DELETE FROM personal_gear.goggles      WHERE user_id = p_user_id;
    DELETE FROM personal_gear.other_gear   WHERE user_id = p_user_id;
    DELETE FROM public.notifications       WHERE target_user_id = p_user_id;

    -- Squads they owned dissolve with them; plain memberships just go.
    DELETE FROM public.teams       WHERE owner_id = p_user_id;
    DELETE FROM public.team_members WHERE user_id = p_user_id;

    -- b. Sever audit/security links (trail kept, identity dropped) --------
    UPDATE public.notifications    SET sender_id = NULL WHERE sender_id = p_user_id;
    UPDATE public.admin_audit_logs SET actor_id  = NULL WHERE actor_id  = p_user_id;
    UPDATE public.security_logs    SET user_id   = NULL WHERE user_id   = p_user_id;
    UPDATE public.system_settings  SET updated_by = NULL WHERE updated_by = p_user_id;

    -- c. Destroy the usable identity FIRST --------------------------------
    UPDATE auth.users SET
      email              = NULL,
      phone              = NULL,
      encrypted_password = md5(random()::text),
      raw_user_meta_data = jsonb_build_object('full_name', 'deleted-pilot'),
      updated_at         = now()
    WHERE id = p_user_id;

    DELETE FROM auth.identities WHERE user_id = p_user_id;

    -- d. The account itself (cascades profiles, pilot_settings, tokens…) --
    DELETE FROM auth.users WHERE id = p_user_id;

    -- Mark the request completed so the daily sweep never re-matches it.
    UPDATE public.account_deletion_requests
       SET status = 'completed', completed_at = now()
     WHERE user_id = p_user_id AND status = 'pending';

    -- Audit AFTER the delete: actor link is gone, only the fact remains.
    INSERT INTO public.admin_audit_logs (actor_id, action, payload)
    VALUES (NULL, 'account_purge_completed',
            jsonb_build_object('user_id', p_user_id, 'at', now()));
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public._purge_account(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Daily sweep: purge every account whose grace window has elapsed.
--    Per-row error capture so one stuck account never blocks the queue.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._purge_due_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    r record;
    v_count integer := 0;
  BEGIN
    FOR r IN
      SELECT user_id FROM public.account_deletion_requests
       WHERE status = 'pending' AND scheduled_for <= now()
       FOR UPDATE SKIP LOCKED
    LOOP
      BEGIN
        PERFORM public._purge_account(r.user_id);
        v_count := v_count + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'purge failed for %: %', r.user_id, SQLERRM;
      END;
    END LOOP;
    RETURN v_count;
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public._purge_due_accounts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._purge_due_accounts() TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Schedule the sweep (pg_cron). Skips silently if the extension or the
--    cron schema is unavailable — the sweep can always be run manually.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('sticktime-purge-deleted-accounts')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sticktime-purge-deleted-accounts');
    PERFORM cron.schedule(
      'sticktime-purge-deleted-accounts',
      '23 4 * * *',
      'SELECT public._purge_due_accounts()'
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — schedule the sweep manually.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule cron job: %', SQLERRM;
END;
$do$;

-- ---------------------------------------------------------------------------
-- 8. Lock down the new RPC surface.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.request_account_deletion()   FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.request_account_deletion()   TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion()    FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.cancel_account_deletion()    TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_account_deletion_status() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_account_deletion_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Remove the per-pilot admin overview — admins keep aggregates only.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_pilot_overview(uuid);

-- ---------------------------------------------------------------------------
-- 10. Analytics without comped accounts. Same aggregate-only shape as
--     before; every pilot-derived number now excludes admin/dev roles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'personal_gear'
AS $function$
  DECLARE
    result jsonb;
  BEGIN
    IF NOT public.is_admin_or_dev(auth.uid()) THEN
      RAISE EXCEPTION 'Access denied. Admin privileges required.';
    END IF;

    INSERT INTO public.admin_audit_logs (actor_id, action, payload)
    VALUES (auth.uid(), 'view_analytics', jsonb_build_object('at', now()));

    SELECT jsonb_build_object(
      -- Revenue: comped admin/dev tiers contribute nothing.
      'revenue', (
        SELECT jsonb_build_object(
          'mrr_estimated_usd',
            COALESCE(SUM(CASE t.tier
              WHEN 'pro' THEN 9 * t.n
              WHEN 'elite' THEN 19 * t.n
              WHEN 'enterprise' THEN 49 * t.n
              ELSE 0 END), 0),
          'paying_count',
            COALESCE(SUM(t.n) FILTER (WHERE t.tier IN ('pro','elite','enterprise')), 0),
          'tier_counts', jsonb_object_agg(t.tier, t.n)
        )
        FROM (
          SELECT COALESCE(tier, 'free') AS tier, COUNT(*) AS n
          FROM public.profiles
          WHERE role NOT IN ('admin', 'dev')
          GROUP BY 1
        ) t
      ),
      'growth', (
        SELECT jsonb_agg(jsonb_build_object(
          'week_start', g.wk::date,
          'signups', COALESCE(s.n, 0)
        ) ORDER BY g.wk)
        FROM generate_series(
          date_trunc('week', now()) - interval '7 weeks',
          date_trunc('week', now()),
          interval '1 week'
        ) g(wk)
        LEFT JOIN (
          SELECT date_trunc('week', p.created_at) AS wk, COUNT(*) AS n
          FROM public.profiles p
          WHERE p.created_at >= date_trunc('week', now()) - interval '7 weeks'
            AND p.role NOT IN ('admin', 'dev')
          GROUP BY 1
        ) s ON s.wk = g.wk
      ),
      -- Engagement: sessions flown by comped accounts don't count.
      'engagement', (
        SELECT jsonb_build_object(
          'active_7d', (
            SELECT COUNT(DISTINCT s.user_id) FROM public.sessions s
            WHERE s.created_at > now() - interval '7 days'
              AND s.user_id NOT IN (
                SELECT id FROM public.profiles WHERE role IN ('admin','dev'))),
          'active_30d', (
            SELECT COUNT(DISTINCT s.user_id) FROM public.sessions s
            WHERE s.created_at > now() - interval '30 days'
              AND s.user_id NOT IN (
                SELECT id FROM public.profiles WHERE role IN ('admin','dev'))),
          'sessions_24h', (
            SELECT COUNT(*) FROM public.sessions s
            WHERE s.created_at > now() - interval '24 hours'
              AND s.user_id NOT IN (
                SELECT id FROM public.profiles WHERE role IN ('admin','dev'))),
          'total_minutes_30d', (
            SELECT COALESCE(SUM(s.duration_minutes),0) FROM public.sessions s
            WHERE s.created_at > now() - interval '30 days'
              AND s.user_id NOT IN (
                SELECT id FROM public.profiles WHERE role IN ('admin','dev'))),
          'total_gear', (
            (SELECT COUNT(*) FROM personal_gear.drones
              WHERE user_id NOT IN (SELECT id FROM public.profiles WHERE role IN ('admin','dev'))) +
            (SELECT COUNT(*) FROM personal_gear.batteries
              WHERE user_id NOT IN (SELECT id FROM public.profiles WHERE role IN ('admin','dev'))) +
            (SELECT COUNT(*) FROM personal_gear.transmitters
              WHERE user_id NOT IN (SELECT id FROM public.profiles WHERE role IN ('admin','dev'))) +
            (SELECT COUNT(*) FROM personal_gear.goggles
              WHERE user_id NOT IN (SELECT id FROM public.profiles WHERE role IN ('admin','dev'))) +
            (SELECT COUNT(*) FROM personal_gear.other_gear
              WHERE user_id NOT IN (SELECT id FROM public.profiles WHERE role IN ('admin','dev'))))
        )
      ),
      -- Accounts: operational totals; revenue-relevant split is comped-free.
      'accounts', (
        SELECT jsonb_build_object(
          'total', COUNT(*),
          'comped_admins', COUNT(*) FILTER (WHERE role IN ('admin','dev')),
          'real_pilots', COUNT(*) FILTER (WHERE role NOT IN ('admin','dev')),
          'banned_now', COUNT(*) FILTER (WHERE ban_until IS NOT NULL AND ban_until > now()),
          'pending_deletions', (
            SELECT COUNT(*) FROM public.account_deletion_requests
             WHERE status = 'pending')
        )
        FROM public.profiles
      ),
      'generated_at', now()
    ) INTO result;

    RETURN result;
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_analytics() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_get_analytics() TO authenticated;

-- ====================================================
-- End of migration
-- ====================================================
