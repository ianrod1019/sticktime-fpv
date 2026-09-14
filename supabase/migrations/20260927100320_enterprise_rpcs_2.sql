-- ============================================================
-- Migration: Enterprise RPCs 2 — policies, meetups, RSVPs
--
-- Second half of the client's server contract for the enterprise
-- plane: resolved policy read/write (admin-guarded via
-- ent_assert_admin from 20260927100300), the meetup scheduler, and
-- RSVPs. House style: SECURITY DEFINER, pinned search_path, REVOKE
-- from anon/public, GRANT to authenticated, every mutation audited
-- into admin_audit_logs.
-- ============================================================


-- ---------------------------------------------------------------------------
-- 2. Policies — read resolved, write guarded
-- ---------------------------------------------------------------------------

-- Resolved policy set for an org (org rows + inherited enterprise
-- defaults). Readable by any org member so UIs can show what locks them.
CREATE OR REPLACE FUNCTION public.get_org_policies(_org uuid)
  RETURNS TABLE(
    policy_key           text,
    enabled              boolean,
    min_firmware_version text,
    scope                text,
    updated_at           timestamptz,
    updated_by           uuid
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    -- Resolved set: the org-scope row when present, otherwise the
    -- enterprise default. Exactly one row per policy key — the raw
    -- union handed the client both scopes and it picked the default.
    SELECT p.policy_key, p.enabled, p.min_firmware_version, 'org'::text,
           p.updated_at, p.updated_by
      FROM public.enterprise_policies p
     WHERE p.org_id = _org

     UNION ALL

    SELECT p.policy_key, p.enabled, p.min_firmware_version, 'enterprise'::text,
           p.updated_at, p.updated_by
      FROM public.enterprise_policies p
      JOIN public.organizations o ON o.id = _org
                                 AND o.enterprise_id = p.enterprise_id
     WHERE p.org_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.enterprise_policies po
          WHERE po.org_id = _org AND po.policy_key = p.policy_key
       )
  $$;

-- Upsert the org's policy set in one call. Admins only. Writes one row
-- per key in the payload (missing keys keep their current value).
CREATE OR REPLACE FUNCTION public.set_org_policies(_org uuid, _policies jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_uid uuid := auth.uid();
    v_enterprise uuid;
    v_key text;
    v_enabled boolean;
    v_floor text;
  BEGIN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    PERFORM public.ent_assert_admin(_org);

    SELECT o.enterprise_id INTO v_enterprise
      FROM public.organizations o WHERE o.id = _org;
    IF v_enterprise IS NULL THEN
      RAISE EXCEPTION 'Organization not found';
    END IF;

    FOR v_key, v_enabled, v_floor IN
      SELECT
        elem->>'key',
        COALESCE((elem->>'enabled')::boolean, false),
        NULLIF(btrim(elem->>'min_firmware_version'), '')
      FROM jsonb_array_elements(_policies) AS elem
    LOOP
      IF v_key NOT IN ('lock_profile_settings', 'require_preflight_checklist',
                       'enforce_firmware_version', 'lock_inventory') THEN
        RAISE EXCEPTION 'Unknown policy key: %', v_key;
      END IF;
      IF v_key = 'enforce_firmware_version'
         AND (v_floor IS NULL
              OR v_floor !~ '^[0-9]+(\.[0-9]+){0,3}$') THEN
        RAISE EXCEPTION
          'enforce_firmware_version requires min_firmware_version like 4.5.1';
      END IF;

      INSERT INTO public.enterprise_policies
        (enterprise_id, org_id, policy_key, enabled,
         min_firmware_version, updated_by)
      VALUES
        (v_enterprise, _org, v_key, v_enabled, v_floor, v_uid)
      ON CONFLICT (enterprise_id, org_id, policy_key)
      DO UPDATE SET enabled = EXCLUDED.enabled,
                    min_firmware_version = EXCLUDED.min_firmware_version,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = now();
    END LOOP;

    INSERT INTO public.admin_audit_logs (actor_id, action, target_id, payload)
    VALUES (v_uid, 'enterprise_policies_updated', _org::text,
            jsonb_build_object('policies', _policies, 'at', now()));
  END;
  $$;

-- ---------------------------------------------------------------------------
-- 3. Meetups + RSVPs
-- ---------------------------------------------------------------------------

-- Upcoming + recent meetups for an org, with the caller's rsvp and
-- attendance counts (AGGREGATE only).
CREATE OR REPLACE FUNCTION public.get_org_meetups(_org uuid)
  RETURNS TABLE(
    id          uuid,
    title       text,
    description text,
    location    text,
    start_time  timestamptz,
    end_time    timestamptz,
    created_by  uuid,
    session_id  uuid,
    attending_count bigint,
    declined_count  bigint,
    my_response     text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT m.id, m.title, m.description, m.location,
           m.start_time, m.end_time, m.created_by, m.session_id,
           (SELECT COUNT(*) FROM public.meetup_rsvps r
             WHERE r.meetup_id = m.id AND r.response = 'attending'),
           (SELECT COUNT(*) FROM public.meetup_rsvps r
             WHERE r.meetup_id = m.id AND r.response = 'declined'),
           (SELECT r.response::text FROM public.meetup_rsvps r
             WHERE r.meetup_id = m.id AND r.user_id = auth.uid())
      FROM public.squadron_meetups m
     WHERE m.organization_id = _org
     ORDER BY m.start_time;
  $$;

CREATE OR REPLACE FUNCTION public.create_meetup(
  _org uuid,
  _title text,
  _start_time timestamptz,
  _end_time timestamptz,
  _description text DEFAULT NULL,
  _location text DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_uid uuid := auth.uid();
    v_id uuid;
  BEGIN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    PERFORM public.ent_assert_admin(_org);

    IF _end_time <= _start_time THEN
      RAISE EXCEPTION 'end_time must be after start_time';
    END IF;

    INSERT INTO public.squadron_meetups
      (organization_id, title, description, location, start_time,
       end_time, created_by)
    VALUES
      (_org, btrim(_title),
       NULLIF(btrim(COALESCE(_description, '')), ''),
       NULLIF(btrim(COALESCE(_location, '')), ''),
       _start_time, _end_time, v_uid)
    RETURNING id INTO v_id;

    INSERT INTO public.admin_audit_logs (actor_id, action, target_id, payload)
    VALUES (v_uid, 'meetup_created', v_id::text,
            jsonb_build_object('org_id', _org, 'at', now()));

    RETURN v_id;
  END;
  $$;

CREATE OR REPLACE FUNCTION public.delete_meetup(_meetup uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_uid uuid := auth.uid();
    v_org uuid;
  BEGIN
    SELECT organization_id INTO v_org FROM public.squadron_meetups
     WHERE id = _meetup;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Meetup not found';
    END IF;
    PERFORM public.ent_assert_admin(v_org);

    DELETE FROM public.squadron_meetups WHERE id = _meetup;

    INSERT INTO public.admin_audit_logs (actor_id, action, target_id, payload)
    VALUES (v_uid, 'meetup_deleted', _meetup::text,
            jsonb_build_object('org_id', v_org, 'at', now()));
  END;
  $$;

-- Respond to a meetup. Members respond for THEMSELVES only; the UNIQUE
-- (meetup_id, user_id) constraint makes re-responding an update.
CREATE OR REPLACE FUNCTION public.respond_to_meetup(
  _meetup uuid,
  _response text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_uid uuid := auth.uid();
    v_org uuid;
  BEGIN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF _response NOT IN ('attending', 'declined') THEN
      RAISE EXCEPTION 'response must be attending or declined';
    END IF;

    SELECT organization_id INTO v_org FROM public.squadron_meetups
     WHERE id = _meetup;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Meetup not found';
    END IF;

    IF NOT public.ent_is_org_member(v_org) THEN
      RAISE EXCEPTION 'Access denied: org members only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.meetup_rsvps (meetup_id, user_id, response)
    VALUES (_meetup, v_uid, _response)
    ON CONFLICT (meetup_id, user_id)
    DO UPDATE SET response = EXCLUDED.response,
                  responded_at = now();
  END;
  $$;

-- Link a logged session to a meetup (post-meetup flight tracking).
-- The session must belong to the caller; the meetup to their org.
CREATE OR REPLACE FUNCTION public.link_meetup_session(
  _meetup uuid,
  _session uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_uid uuid := auth.uid();
    v_org uuid;
    v_owner uuid;
  BEGIN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT organization_id INTO v_org FROM public.squadron_meetups
     WHERE id = _meetup;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Meetup not found';
    END IF;

    SELECT user_id INTO v_owner FROM public.sessions WHERE id = _session;
    IF v_owner IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'You can only link your own sessions';
    END IF;

    IF NOT public.ent_is_org_member(v_org) THEN
      RAISE EXCEPTION 'Access denied: org members only';
    END IF;

    UPDATE public.squadron_meetups
       SET session_id = _session, updated_at = now()
     WHERE id = _meetup
       AND (session_id IS NULL OR created_by = v_uid
            OR public.ent_effective_role(v_org) IN
               ('district_admin', 'squadron_admin', 'platform_admin'));

    INSERT INTO public.admin_audit_logs (actor_id, action, target_id, payload)
    VALUES (v_uid, 'meetup_session_linked', _meetup::text,
            jsonb_build_object('session_id', _session, 'at', now()));
  END;
  $$;

-- ---------------------------------------------------------------------------
-- 4. Execute grants (one signature per statement)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_org_policies(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_org_policies(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_org_meetups(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_meetup(uuid, text, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_meetup(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_to_meetup(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_meetup_session(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_org_policies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_org_policies(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_meetups(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_meetup(uuid, text, timestamptz, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_meetup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_meetup(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_meetup_session(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
