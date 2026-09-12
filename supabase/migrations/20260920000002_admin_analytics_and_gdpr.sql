-- ====================================================
-- Migration: Admin analytics + GDPR data controls (2026-09-20)
--
-- Three goals:
--   1. HIGH-LEVEL ADMIN DATA: one aggregate-only analytics RPC covering
--      revenue (tier mix + MRR estimate), growth, engagement and accounts.
--      It returns COUNTS and SUMS — never rows belonging to a single user —
--      so even an admin cannot browse another pilot's data through it.
--   2. GDPR: pilots can export everything the platform stores about them
--      (Art. 15/20) and anonymize their account (Art. 17) themselves.
--   3. PRIVACY-PRESERVING ADMIN: admins may open an AGGREGATE profile of a
--      pilot (tier, counts, flags) — never raw logs/gear/session rows — and
--      every analytics/overview access is written to the admin audit trail.
--
-- Schema notes (matches the live DB):
--   - profiles: id, role, tier, created_at, updated_at, ban_until
--   - pilot_settings: user_id, callsign, bio, avatar_url, role, ...
--   - Bans are represented by ban_until > now(), not an is_banned flag.
-- All functions: SECURITY DEFINER, pinned search_path, admin/owner checks
-- inside, EXECUTE revoked from anon/public.
-- ====================================================

-- ---------------------------------------------------------------------------
-- 1. Aggregate admin analytics. The ONLY numbers endpoint the admin panel
--    needs. Contains zero per-user rows by construction.
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

    -- Log this analytics access to the immutable audit trail.
    INSERT INTO public.admin_audit_logs (actor_id, action, payload)
    VALUES (auth.uid(), 'view_analytics', jsonb_build_object('at', now()));

    SELECT jsonb_build_object(
      -- Revenue: tier mix and estimated MRR.
      -- Tier prices are platform constants; adjust here if pricing changes.
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
          GROUP BY 1
        ) t
      ),
      -- Growth: signups per week for the last 8 weeks.
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
          SELECT date_trunc('week', created_at) AS wk, COUNT(*) AS n
          FROM public.profiles
          WHERE created_at >= date_trunc('week', now()) - interval '7 weeks'
          GROUP BY 1
        ) s ON s.wk = g.wk
      ),
      -- Engagement: active pilots by window and aggregate flight time.
      'engagement', (
        SELECT jsonb_build_object(
          'active_7d',  (SELECT COUNT(DISTINCT user_id) FROM public.sessions WHERE created_at > now() - interval '7 days'),
          'active_30d', (SELECT COUNT(DISTINCT user_id) FROM public.sessions WHERE created_at > now() - interval '30 days'),
          'sessions_24h',      (SELECT COUNT(*) FROM public.sessions WHERE created_at > now() - interval '24 hours'),
          'total_minutes_30d', (SELECT COALESCE(SUM(duration_minutes),0) FROM public.sessions WHERE created_at > now() - interval '30 days'),
          'total_gear', (
            (SELECT COUNT(*) FROM personal_gear.drones) +
            (SELECT COUNT(*) FROM personal_gear.batteries) +
            (SELECT COUNT(*) FROM personal_gear.transmitters) +
            (SELECT COUNT(*) FROM personal_gear.goggles) +
            (SELECT COUNT(*) FROM personal_gear.other_gear)
          )
        )
      ),
      -- Accounts: totals plus ban state (no identities).
      'accounts', (
        SELECT jsonb_build_object(
          'total', COUNT(*),
          'banned_now', COUNT(*) FILTER (WHERE ban_until IS NOT NULL AND ban_until > now()),
          'admins', COUNT(*) FILTER (WHERE role IN ('admin','dev'))
        )
        FROM public.profiles
      ),
      'generated_at', now()
    ) INTO result;

    RETURN result;
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 2a. Export ID scrubbing. Before an export leaves the database, every UUID
--     (row ids AND foreign keys) is replaced with a small sequential
--     integer from a per-export map, so cross-references between sections
--     still resolve while the platform's internal identifiers, user ids and
--     account ids never leave the server.
--     Helpers are internal: EXECUTE revoked from everyone but the owner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gdpr_map_id(p_raw uuid)
RETURNS int
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
  DECLARE
    v_seq int;
  BEGIN
    INSERT INTO _gdpr_ids (raw, seq)
    VALUES (p_raw, (SELECT COALESCE(MAX(seq), 0) + 1 FROM _gdpr_ids))
    ON CONFLICT (raw) DO NOTHING;

    SELECT seq INTO v_seq FROM _gdpr_ids WHERE raw = p_raw;
    RETURN v_seq;
  END;
$function$;

CREATE OR REPLACE FUNCTION public._gdpr_scrub(node jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF node IS NULL THEN
    RETURN NULL;
  END IF;

  CASE jsonb_typeof(node)
    WHEN 'object' THEN
      RETURN (
        SELECT jsonb_object_agg(
          key,
          CASE
            WHEN jsonb_typeof(value) = 'string'
                 AND value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN to_jsonb(public._gdpr_map_id((value #>> '{}')::uuid))
            ELSE public._gdpr_scrub(value)
          END
        )
        FROM jsonb_each(node)
      );
    WHEN 'array' THEN
      RETURN (
        SELECT jsonb_agg(public._gdpr_scrub(elem))
        FROM jsonb_array_elements(node) elem
      );
    ELSE
      RETURN node;
  END CASE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._gdpr_map_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._gdpr_scrub(jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2b. GDPR — pilot self-service export (Art. 15/20). Returns EVERYTHING the
--    platform stores about the CALLER only. Cannot be run for another user.
--    All UUIDs are renumbered to sequential integers before returning.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'personal_gear', 'pg_temp'
AS $function$
  DECLARE
    uid uuid := auth.uid();
    result jsonb;
  BEGIN
    IF uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated.';
    END IF;

    SELECT jsonb_build_object(
      'exported_at', now(),
      'profile',        (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = uid),
      'pilot_settings', (SELECT to_jsonb(ps) FROM public.pilot_settings ps WHERE ps.user_id = uid),
      'sessions',       (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.sessions s WHERE s.user_id = uid),
      'notifications',  (SELECT COALESCE(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM public.notifications n WHERE n.target_user_id = uid),
      'security_logs',  (SELECT COALESCE(jsonb_agg(to_jsonb(sl)), '[]'::jsonb) FROM public.security_logs sl WHERE sl.user_id = uid),
      'team_memberships', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'team_id', tm.team_id, 'team_role', tm.team_role, 'joined_at', tm.joined_at, 'team_name', t.name
        )), '[]'::jsonb)
        FROM public.team_members tm
        LEFT JOIN public.teams t ON t.id = tm.team_id
        WHERE tm.user_id = uid
      ),
      'drones',         (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM personal_gear.drones d WHERE d.user_id = uid),
      'batteries',      (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM personal_gear.batteries b WHERE b.user_id = uid),
      'transmitters',   (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM personal_gear.transmitters t WHERE t.user_id = uid),
      'goggles',        (SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM personal_gear.goggles g WHERE g.user_id = uid),
      'other_gear',     (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM personal_gear.other_gear o WHERE o.user_id = uid),
      'drone_parts',    (SELECT COALESCE(jsonb_agg(to_jsonb(dp)), '[]'::jsonb) FROM personal_gear.drone_parts dp WHERE dp.user_id = uid),
      'part_installs',  (SELECT COALESCE(jsonb_agg(to_jsonb(pi)), '[]'::jsonb) FROM personal_gear.drone_part_installs pi WHERE pi.user_id = uid),
      'transmitter_parts', (SELECT COALESCE(jsonb_agg(to_jsonb(tp)), '[]'::jsonb) FROM personal_gear.transmitter_parts tp WHERE tp.user_id = uid),
      'goggles_parts',  (SELECT COALESCE(jsonb_agg(to_jsonb(gp)), '[]'::jsonb) FROM personal_gear.goggles_parts gp WHERE gp.user_id = uid),
      'other_parts',    (SELECT COALESCE(jsonb_agg(to_jsonb(op)), '[]'::jsonb) FROM personal_gear.other_parts op WHERE op.user_id = uid),
      'maintenance_logs', (SELECT COALESCE(jsonb_agg(to_jsonb(ml)), '[]'::jsonb) FROM personal_gear.maintenance_logs ml WHERE ml.user_id = uid),
      'battery_packs',    (SELECT COALESCE(jsonb_agg(to_jsonb(bp)), '[]'::jsonb) FROM personal_gear.battery_packs bp WHERE bp.user_id = uid),
      'battery_ir',       (SELECT COALESCE(jsonb_agg(to_jsonb(ir)), '[]'::jsonb) FROM personal_gear.battery_ir_readings ir WHERE ir.user_id = uid),
      'component_failures', (SELECT COALESCE(jsonb_agg(to_jsonb(cf)), '[]'::jsonb) FROM personal_gear.component_failures cf WHERE cf.user_id = uid),
      'my_admin_actions', (SELECT COALESCE(jsonb_agg(to_jsonb(al)), '[]'::jsonb) FROM public.admin_audit_logs al WHERE al.actor_id = uid)
    ) INTO result;

    -- Renumber every UUID to a sequential integer (shared map keeps
    -- cross-section references consistent) before anything leaves the DB.
    CREATE TEMP TABLE _gdpr_ids (
      raw uuid PRIMARY KEY,
      seq int NOT NULL
    ) ON COMMIT DROP;

    result := public._gdpr_scrub(result);

    RETURN result;
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. GDPR — pilot self-service anonymization (Art. 17 "right to erasure").
--    Hard-deletes all content data, then irreversibly pseudonymizes both the
--    public identity (profiles/pilot_settings) and the auth identity
--    (email, phone, password, OAuth identities). A demoted role prevents a
--    deleted admin from leaving privileged credentials behind.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anonymize_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'personal_gear', 'auth'
AS $function$
  DECLARE
    uid uuid := auth.uid();
    sessions_deleted bigint;
    logs_deleted bigint;
  BEGIN
    IF uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Content data: hard delete everything the pilot created.
    DELETE FROM personal_gear.component_failures       WHERE user_id = uid;
    DELETE FROM personal_gear.battery_ir_readings      WHERE user_id = uid;
    DELETE FROM personal_gear.battery_packs            WHERE user_id = uid;
    DELETE FROM personal_gear.drone_part_installs      WHERE user_id = uid;
    DELETE FROM personal_gear.drone_parts              WHERE user_id = uid;
    DELETE FROM personal_gear.battery_parts            WHERE user_id = uid;
    DELETE FROM personal_gear.transmitter_parts        WHERE user_id = uid;
    DELETE FROM personal_gear.goggles_parts            WHERE user_id = uid;
    DELETE FROM personal_gear.other_parts              WHERE user_id = uid;
    DELETE FROM personal_gear.maintenance_logs         WHERE user_id = uid;
    GET DIAGNOSTICS logs_deleted = ROW_COUNT;
    DELETE FROM personal_gear.drones                   WHERE user_id = uid;
    DELETE FROM personal_gear.batteries                WHERE user_id = uid;
    DELETE FROM personal_gear.transmitters             WHERE user_id = uid;
    DELETE FROM personal_gear.goggles                  WHERE user_id = uid;
    DELETE FROM personal_gear.other_gear               WHERE user_id = uid;
    DELETE FROM public.notifications                   WHERE target_user_id = uid;
    DELETE FROM public.sessions                        WHERE user_id = uid;
    GET DIAGNOSTICS sessions_deleted = ROW_COUNT;

    -- Public identity: irreversible pseudonymization (row kept for FK
    -- integrity). Role is demoted so a deleted admin leaves no privileged
    -- account behind.
    UPDATE public.profiles SET
      role      = 'user',
      ban_until = NULL,
      tier      = 'free',
      updated_at = now()
    WHERE id = uid;

    UPDATE public.pilot_settings SET
      callsign   = 'deleted-pilot',
      bio        = '',
      avatar_url = NULL,
      updated_at = now()
    WHERE user_id = uid;

    -- Auth identity: erase email/phone/password and remove OAuth identities
    -- so the account can never be reclaimed by signing in again.
    UPDATE auth.users SET
      email              = NULL,
      phone              = NULL,
      encrypted_password = md5(random()::text),
      raw_user_meta_data = '{"full_name": "deleted-pilot"}'::jsonb,
      updated_at         = now()
    WHERE id = uid;

    DELETE FROM auth.identities WHERE user_id = uid;

    -- Audit the erasure without recording any personal data beyond the actor id.
    INSERT INTO public.admin_audit_logs (actor_id, action, payload)
    VALUES (uid, 'gdpr_self_anonymize', jsonb_build_object(
      'sessions_deleted', sessions_deleted,
      'maintenance_logs_deleted', logs_deleted));

    RETURN jsonb_build_object('anonymized', true,
      'sessions_deleted', sessions_deleted,
      'maintenance_logs_deleted', logs_deleted);
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Admin per-pilot AGGREGATE overview: counts and flags for support
--    workflows, but never the underlying rows. Access is audited.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_pilot_overview(p_user_id uuid)
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

    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'p_user_id is required.';
    END IF;

    -- Audit WHO looked at WHICH pilot's overview and WHEN.
    INSERT INTO public.admin_audit_logs (actor_id, action, target_id, payload)
    VALUES (auth.uid(), 'view_pilot_overview', p_user_id::text,
            jsonb_build_object('at', now()));

    SELECT jsonb_build_object(
      'account', (
        SELECT jsonb_build_object(
          'id',         p.id,
          'callsign',   COALESCE(ps.callsign, 'Pilot'),
          'tier',       COALESCE(p.tier, 'free'),
          'role',       COALESCE(p.role, 'user'),
          'created_at', p.created_at,
          'banned_now', (p.ban_until IS NOT NULL AND p.ban_until > now())
        )
        FROM public.profiles p
        LEFT JOIN public.pilot_settings ps ON ps.user_id = p.id
        WHERE p.id = p_user_id
      ),
      'usage', (
        SELECT jsonb_build_object(
          'session_count',  (SELECT COUNT(*) FROM public.sessions s WHERE s.user_id = p_user_id),
          'total_minutes',  (SELECT COALESCE(SUM(s.duration_minutes),0) FROM public.sessions s WHERE s.user_id = p_user_id),
          'last_activity',  (SELECT MAX(s.created_at) FROM public.sessions s WHERE s.user_id = p_user_id),
          'gear_count', (
            (SELECT COUNT(*) FROM personal_gear.drones WHERE user_id = p_user_id) +
            (SELECT COUNT(*) FROM personal_gear.batteries WHERE user_id = p_user_id) +
            (SELECT COUNT(*) FROM personal_gear.transmitters WHERE user_id = p_user_id) +
            (SELECT COUNT(*) FROM personal_gear.goggles WHERE user_id = p_user_id) +
            (SELECT COUNT(*) FROM personal_gear.other_gear WHERE user_id = p_user_id)
          ),
          'maintenance_logs', (SELECT COUNT(*) FROM personal_gear.maintenance_logs WHERE user_id = p_user_id)
        )
      )
    ) INTO result;

    RETURN result;
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Lock down the public RPC surface.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_get_analytics()          FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_get_analytics()          TO authenticated;
REVOKE EXECUTE ON FUNCTION public.export_my_data()               FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.export_my_data()               TO authenticated;
REVOKE EXECUTE ON FUNCTION public.anonymize_my_data()            FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.anonymize_my_data()            TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_pilot_overview(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_get_pilot_overview(uuid) TO authenticated;

-- ====================================================
-- End of migration
-- ====================================================
