SET local check_function_bodies = off;

CREATE TABLE "public"."admin_audit_logs" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "actor_id"   uuid,
  "action"     text                     NOT NULL,
  "target_id"  text,
  "payload"    jsonb                    DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."admin_audit_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."drones" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "name"       text                     NOT NULL,
  "frame"      text                     DEFAULT ''::text,
  "fc"         text                     DEFAULT ''::text,
  "esc"        text                     DEFAULT ''::text,
  "motors"     text                     DEFAULT ''::text,
  "vtx"        text                     DEFAULT ''::text,
  "receiver"   text                     DEFAULT ''::text,
  "weight"     numeric                  DEFAULT 0,
  "status"     text                     DEFAULT 'Ready'::text,
  "image_url"  text                     DEFAULT ''::text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "drones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."drones"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."flights" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          uuid                     NOT NULL,
  "drone_id"         uuid,
  "spot_name"        text                     NOT NULL,
  "duration_seconds" integer                  DEFAULT 0,
  "batteries_flown"  integer                  DEFAULT 1,
  "max_speed"        numeric                  DEFAULT 0,
  "notes"            text                     DEFAULT ''::text,
  "rating"           integer                  DEFAULT 5,
  "date"             timestamp with time zone DEFAULT now(),
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "flights_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."flights"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gear_parts" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          uuid                     NOT NULL,
  "gear_id"          uuid                     NOT NULL,
  "name"             text                     NOT NULL,
  "category"         text                     DEFAULT ''::text,
  "lifespan_minutes" integer                  DEFAULT 300,
  "minutes_used"     integer                  DEFAULT 0,
  "spare_count"      integer                  DEFAULT 0,
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "gear_parts_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."gear_parts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gear" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                  uuid                     NOT NULL,
  "name"                     text                     NOT NULL,
  "gear_type"                text                     NOT NULL DEFAULT 'quad'::text,
  "brand"                    text                     DEFAULT ''::text,
  "service_interval_minutes" integer                  DEFAULT 600,
  "minutes_since_service"    integer                  DEFAULT 0,
  "total_minutes"            integer                  DEFAULT 0,
  "pack_count"               integer                  DEFAULT 0,
  "crash_count"              integer                  DEFAULT 0,
  "is_as_needed"             boolean                  DEFAULT false,
  "created_at"               timestamp with time zone DEFAULT now(),
  "cells"                    integer                  DEFAULT 0,
  "connector_type"           text                     DEFAULT ''::text,
  CONSTRAINT "gear_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."gear"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."maintenance_logs" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"             uuid                     NOT NULL,
  "gear_id"             uuid                     NOT NULL,
  "description"         text                     NOT NULL,
  "cost"                numeric                  DEFAULT 0,
  "reset_service_clock" boolean                  DEFAULT true,
  "performed_on"        timestamp with time zone DEFAULT now(),
  CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."maintenance_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."maintenance" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "drone_id"    uuid,
  "title"       text                     NOT NULL,
  "description" text                     DEFAULT ''::text,
  "cost"        numeric                  DEFAULT 0,
  "status"      text                     DEFAULT 'Pending'::text,
  "date"        timestamp with time zone DEFAULT now(),
  "created_at"  timestamp with time zone DEFAULT now(),
  CONSTRAINT "maintenance_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."maintenance"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."notifications" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"          text                     NOT NULL,
  "message"        text                     NOT NULL,
  "target_tier"    text                     DEFAULT 'all'::text,
  "target_user_id" uuid,
  "sender_id"      uuid,
  "created_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "notifications_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pilot_settings" (
  "user_id"           uuid                     NOT NULL,
  "callsign"          text                     DEFAULT ''::text,
  "weekly_goal_hours" numeric                  DEFAULT 5,
  "is_private"        boolean                  DEFAULT false,
  "bio"               text                     DEFAULT ''::text,
  "avatar_url"        text                     DEFAULT ''::text,
  "updated_at"        timestamp with time zone DEFAULT now(),
  "role"              text                     DEFAULT 'pilot'::text,
  CONSTRAINT "pilot_settings_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."pilot_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"         uuid                     NOT NULL,
  "role"       text                     NOT NULL DEFAULT 'user'::text,
  "tier"       text                     NOT NULL DEFAULT 'free'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "ban_until"  timestamp with time zone,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."security_logs" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid,
  "path"       text                     NOT NULL,
  "action"     text                     NOT NULL DEFAULT 'unauthorized_access_attempt'::text,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "security_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."security_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sessions" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          uuid                     NOT NULL,
  "flown_on"         text                     NOT NULL,
  "duration_minutes" integer                  NOT NULL DEFAULT 15,
  "gear_id"          uuid,
  "controller_id"    uuid,
  "location_id"      uuid,
  "track_id"         uuid,
  "sim_platform"     text,
  "packs_flown"      integer                  DEFAULT 0,
  "crashes"          integer                  DEFAULT 0,
  "battery_notes"    text,
  "weather"          jsonb,
  "notes"            text,
  "created_at"       timestamp with time zone DEFAULT now(),
  "updated_at"       timestamp with time zone DEFAULT now(),
  "goggles_id"       uuid,
  CONSTRAINT "sessions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."system_settings" (
  "key"         text                     NOT NULL,
  "value"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "description" text,
  "updated_at"  timestamp with time zone DEFAULT now(),
  "updated_by"  uuid,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY (key)
);

ALTER TABLE "public"."system_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."team_invite_codes" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "team_id"    uuid                     NOT NULL,
  "code"       text                     NOT NULL,
  "created_by" uuid                     NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "team_invite_codes_code_key" UNIQUE (code),
  CONSTRAINT "team_invite_codes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."team_invite_codes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."team_members" (
  "id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "team_id"   uuid                     NOT NULL,
  "user_id"   uuid                     NOT NULL,
  "team_role" text                     NOT NULL DEFAULT 'member'::text,
  "joined_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "team_members_pkey" PRIMARY KEY (id),
  CONSTRAINT "unique_team_member" UNIQUE (team_id, user_id)
);

ALTER TABLE "public"."team_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."teams" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"        text                     NOT NULL,
  "description" text,
  "owner_id"    uuid                     NOT NULL,
  "created_at"  timestamp with time zone DEFAULT now(),
  CONSTRAINT "teams_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."teams"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."session_type" AS ENUM (
  'sim',
  'real'
);

ALTER TABLE "public"."sessions"
  ADD COLUMN "session_type" public.session_type DEFAULT 'real'::public.session_type;

CREATE OR REPLACE FUNCTION public.admin_get_active_sessions_count()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      current_user_role text;
      active_count bigint;
    BEGIN
      SELECT role INTO current_user_role
      FROM public.profiles
      WHERE profiles.id = auth.uid();

      IF current_user_role IS NULL OR (LOWER(current_user_role) NOT IN ('admin', 'dev')) THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
      END IF;

      SELECT count(*) INTO active_count
      FROM public.sessions
      WHERE created_at > now() - interval '24 hours';

      RETURN active_count;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.admin_get_admin_directory()
  RETURNS TABLE (
    id                uuid,
    email             text,
    display_name      text,
    callsign          text,
    subscription_tier text,
    role              text,
    created_at        timestamp with time zone,
    is_banned         boolean,
    ban_reason        text,
    ban_until         timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    u.email::text,
    COALESCE(p.display_name, p.callsign, split_part(u.email::text, '@', 1))::text AS display_name,
    COALESCE(p.callsign, '')::text AS callsign,
    COALESCE(p.tier, p.subscription_tier, 'free')::text AS subscription_tier,
    COALESCE(r.role::text, p.role::text, 'user') AS role,
    p.created_at,
    COALESCE(p.is_banned, false) AS is_banned,
    p.ban_reason,
    p.ban_until
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_roles r ON r.user_id = p.id
  ORDER BY p.created_at DESC
  LIMIT 100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_db_health()
  RETURNS TABLE (
    table_name text,
    row_count  bigint,
    size_bytes bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      current_user_role text;
    BEGIN
      SELECT role INTO current_user_role
      FROM public.profiles
      WHERE profiles.id = auth.uid();

      IF current_user_role IS NULL OR (LOWER(current_user_role) NOT IN ('admin', 'dev')) THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
      END IF;

      RETURN QUERY
      SELECT
        c.relname::text as table_name,
        c.reltuples::bigint as row_count,
        pg_total_relation_size(c.oid) as size_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN ('profiles', 'gear', 'sessions', 'teams', 'team_members', 'security_logs', 'system_settings')
      ORDER BY pg_total_relation_size(c.oid) DESC;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.admin_get_security_logs()
  RETURNS TABLE (
    id         uuid,
    user_id    uuid,
    email      text,
    path       text,
    action     text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  -- Check if the calling user is an admin or dev
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'dev')
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    l.id,
    l.user_id,
    u.email::text,
    l.path,
    l.action,
    l.ip_address,
    l.user_agent,
    l.created_at
  FROM public.security_logs l
  LEFT JOIN auth.users u ON l.user_id = u.id
  ORDER BY l.created_at DESC
  LIMIT 100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_user_count()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      current_user_role text;
      total_count bigint;
    BEGIN
      SELECT role INTO current_user_role
      FROM public.profiles
      WHERE profiles.id = auth.uid();

      IF current_user_role IS NULL OR (LOWER(current_user_role) NOT IN ('admin', 'dev')) THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
      END IF;

      SELECT count(*) INTO total_count FROM public.profiles;
      RETURN total_count;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.admin_get_user_emails()
  RETURNS TABLE (
    id    uuid,
    email text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
    DECLARE
      current_user_role text;
    BEGIN
      SELECT role INTO current_user_role
      FROM public.profiles
      WHERE profiles.id = auth.uid();

      IF current_user_role IS NULL OR (LOWER(current_user_role) NOT IN ('admin', 'dev')) THEN
        SELECT role INTO current_user_role
        FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        LIMIT 1;
      END IF;

      IF current_user_role IS NULL OR (LOWER(current_user_role) NOT IN ('admin', 'dev')) THEN
        RAISE EXCEPTION 'Access denied. Administrator or Developer privileges are required to execute this function.';
      END IF;

      RETURN QUERY
      SELECT u.id, u.email::text
      FROM auth.users u;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  DECLARE
    user_role text;
  BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE id = auth.uid();
    RETURN COALESCE(user_role, 'user');
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.auto_generate_team_invite_code_trigger()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
    DECLARE
      _new_code text;
    BEGIN
      LOOP
        _new_code := generate_random_invite_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM team_invite_codes WHERE code = _new_code);
      END LOOP;

      INSERT INTO team_invite_codes (team_id, code, created_by, expires_at)
      VALUES (NEW.id, _new_code, NEW.owner_id, now() + interval '30 days');

      RETURN NEW;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.check_is_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    BEGIN
      RETURN public.is_admin_or_dev(auth.uid());
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.create_team_invite_code (
  _team_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
    DECLARE
      _new_code text;
      _user_role text;
      _current_user_id uuid;
    BEGIN
      _current_user_id := auth.uid();

      -- Check if user is owner or manager of the team
      SELECT team_role INTO _user_role
      FROM team_members
      WHERE team_id = _team_id AND user_id = _current_user_id;

      IF _user_role IS NULL OR _user_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Access denied: Only squadron owners and managers can generate or regenerate invite codes.';
      END IF;

      -- Generate guaranteed unique code without collisions
      LOOP
        _new_code := generate_random_invite_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM team_invite_codes WHERE code = _new_code);
      END LOOP;

      -- Insert new invite code with explicit created_by (expires in 30 days)
      INSERT INTO team_invite_codes (team_id, code, created_by, expires_at)
      VALUES (_team_id, _new_code, _current_user_id, now() + interval '30 days');

      RETURN _new_code;
    END;
    $function$;

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
      INSERT INTO public.profiles (id, role, tier, created_at, updated_at)
      VALUES (
        p_user_id,
        COALESCE(NULLIF(p_role, ''), 'user'),
        COALESCE(NULLIF(p_tier, ''), 'free'),
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE 
      SET 
        updated_at = NOW()
      RETURNING * INTO v_profile;

      RETURN v_profile;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.dissolve_squadron (
  _team_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
    DECLARE
      _owner_id uuid;
    BEGIN
      -- Check team ownership
      SELECT owner_id INTO _owner_id
      FROM teams
      WHERE id = _team_id;

      IF _owner_id IS NULL THEN
        RAISE EXCEPTION 'Squadron not found.';
      END IF;

      IF _owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Only the squadron owner can dissolve this squadron.';
      END IF;

      -- Delete the team (cascade takes care of team_members, team_gear, team_sessions, etc.)
      DELETE FROM teams WHERE id = _team_id;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.generate_random_invite_code()
  RETURNS text
  LANGUAGE plpgsql
  AS $function$
    DECLARE
      chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      result text := '';
      i integer;
    BEGIN
      FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
      END LOOP;
      RETURN result;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.handle_new_credential_record()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.handle_new_pilot_settings()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
    BEGIN
      INSERT INTO public.pilot_settings (user_id, callsign)
      VALUES (new.id, split_part(new.email, '@', 1))
      ON CONFLICT (user_id) DO NOTHING;
      RETURN new;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    BEGIN
      PERFORM public.create_user_profile(
        new.id,
        COALESCE(new.raw_user_meta_data->>'role', 'user'),
        COALESCE(new.raw_user_meta_data->>'tier', 'free')
      );
      RETURN NEW;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
      RETURN NEW;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_credential()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
    BEGIN
      INSERT INTO public.pilot_settings (id)
      VALUES (new.id)
      ON CONFLICT (id) DO NOTHING;
      RETURN new;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'dev')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_or_dev()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'dev')
      );
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.is_admin_or_dev (
  p_user_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      v_role text;
    BEGIN
      SELECT role INTO v_role
      FROM public.profiles
      WHERE id = p_user_id;

      RETURN LOWER(COALESCE(v_role, '')) IN ('admin', 'dev');
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.is_team_member (
  _team_id uuid,
  _user_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = _team_id AND user_id = _user_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_team_owner (
  _team_id uuid,
  _user_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM teams
    WHERE id = _team_id AND owner_id = _user_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_team_with_code (
  _code text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_team_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT team_id INTO v_team_id
  FROM team_invite_codes
  WHERE code = upper(trim(_code)) AND expires_at > now();

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  INSERT INTO team_members (team_id, user_id, team_role)
  VALUES (v_team_id, v_user_id, 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RETURN 'Successfully joined team';
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_squadron (
  _team_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
    DECLARE
      _owner_id uuid;
    BEGIN
      -- Check team ownership
      SELECT owner_id INTO _owner_id
      FROM teams
      WHERE id = _team_id;

      IF _owner_id IS NULL THEN
        RAISE EXCEPTION 'Squadron not found.';
      END IF;

      IF _owner_id = auth.uid() THEN
        RAISE EXCEPTION 'Squadron owners cannot leave their own squadron. Dissolve it instead.';
      END IF;

      -- Remove member association
      DELETE FROM team_members
      WHERE team_id = _team_id AND user_id = auth.uid();
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.log_and_force_retoken (
  attempted_path   text,
  attempted_action text,
  client_ip        text DEFAULT NULL::text,
  client_ua        text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
DECLARE
  caller_id uuid;
  new_log_id uuid;
  current_meta jsonb;
  updated_meta jsonb;
  result jsonb;
BEGIN
  caller_id := auth.uid();
  
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Log the security event
  INSERT INTO public.security_logs (user_id, path, action, ip_address, user_agent)
  VALUES (caller_id, attempted_path, attempted_action, client_ip, client_ua)
  RETURNING id INTO new_log_id;

  -- 2. Fetch current user metadata
  SELECT raw_user_meta_data FROM auth.users WHERE id = caller_id INTO current_meta;
  
  IF current_meta IS NULL THEN
    current_meta := '{}'::jsonb;
  END IF;

  -- 3. Inject a security retoken nonce and timestamp
  updated_meta := current_meta || jsonb_build_object(
    'retoken_nonce', gen_random_uuid(),
    'retoken_required_at', extract(epoch from now())::integer
  );

  -- 4. Update auth.users to force token invalidation/refresh requirement
  UPDATE auth.users
  SET 
    raw_user_meta_data = updated_meta,
    updated_at = now()
  WHERE id = caller_id;

  result := jsonb_build_object(
    'success', true,
    'log_id', new_log_id,
    'retoken_triggered', true
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_profile_system_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    DECLARE
      current_user_role text;
    BEGIN
      IF current_user = 'postgres' OR current_user = 'service_role' THEN
        RETURN NEW;
      END IF;

      SELECT role INTO current_user_role
      FROM public.profiles
      WHERE id = auth.uid();

      IF current_user_role IS DISTINCT FROM 'admin' AND current_user_role IS DISTINCT FROM 'dev' THEN
        NEW.role := OLD.role;
        NEW.tier := OLD.tier;
      END IF;

      NEW.updated_at := now();
      RETURN NEW;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.share_team (
  _user_a uuid,
  _user_b uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  IF _user_a = _user_b THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM team_members m1
    JOIN team_members m2 ON m1.team_id = m2.team_id
    WHERE m1.user_id = _user_a AND m2.user_id = _user_b
  );
END;
$function$;

ALTER TABLE "public"."admin_audit_logs"
  ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."drones"
  ADD CONSTRAINT "drones_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."flights"
  ADD CONSTRAINT "flights_drone_id_fkey" FOREIGN KEY (drone_id) REFERENCES public.drones(id) ON DELETE SET NULL;

ALTER TABLE "public"."flights"
  ADD CONSTRAINT "flights_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."gear"
  ADD CONSTRAINT "gear_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."gear_parts"
  ADD CONSTRAINT "gear_parts_gear_id_fkey" FOREIGN KEY (gear_id) REFERENCES public.gear(id) ON DELETE CASCADE;

ALTER TABLE "public"."gear_parts"
  ADD CONSTRAINT "gear_parts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."maintenance"
  ADD CONSTRAINT "maintenance_drone_id_fkey" FOREIGN KEY (drone_id) REFERENCES public.drones(id) ON DELETE CASCADE;

ALTER TABLE "public"."maintenance"
  ADD CONSTRAINT "maintenance_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."maintenance_logs"
  ADD CONSTRAINT "maintenance_logs_gear_id_fkey" FOREIGN KEY (gear_id) REFERENCES public.gear(id) ON DELETE CASCADE;

ALTER TABLE "public"."maintenance_logs"
  ADD CONSTRAINT "maintenance_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id);

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."pilot_settings"
  ADD CONSTRAINT "pilot_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."security_logs"
  ADD CONSTRAINT "security_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."sessions"
  ADD CONSTRAINT "sessions_goggles_id_fkey" FOREIGN KEY (goggles_id) REFERENCES public.gear(id) ON DELETE SET NULL;

ALTER TABLE "public"."sessions"
  ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."system_settings"
  ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."team_invite_codes"
  ADD CONSTRAINT "team_invite_codes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."team_members"
  ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."teams"
  ADD CONSTRAINT "teams_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."team_invite_codes"
  ADD CONSTRAINT "team_invite_codes_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE "public"."team_members"
  ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

CREATE INDEX idx_admin_audit_logs_action ON public.admin_audit_logs USING btree (action);

CREATE INDEX idx_admin_audit_logs_actor ON public.admin_audit_logs USING btree (actor_id);

CREATE INDEX idx_admin_audit_logs_created ON public.admin_audit_logs USING btree (created_at DESC);

CREATE INDEX idx_pilot_settings_user_role ON public.pilot_settings USING btree (user_id, ROLE);

CREATE INDEX idx_profiles_user_role ON public.profiles USING btree (id, ROLE);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER enforce_profile_system_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_system_fields();

CREATE TRIGGER trigger_auto_team_invite_code
  AFTER INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_team_invite_code_trigger();

CREATE POLICY "Admins can insert admin audit logs" ON "public"."admin_audit_logs"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'dev'::text]))))));

CREATE POLICY "Admins can read admin audit logs" ON "public"."admin_audit_logs"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'dev'::text]))))));

CREATE POLICY "Drones all policy" ON "public"."drones"
  FOR ALL
  TO "authenticated"
  USING (((user_id = auth.uid()) OR (( SELECT p.role
   FROM public.profiles p
  WHERE (p.id = auth.uid())) = ANY (ARRAY['admin'::text, 'dev'::text]))))
  WITH CHECK (((user_id = auth.uid()) OR (( SELECT p.role
   FROM public.profiles p
  WHERE (p.id = auth.uid())) = ANY (ARRAY['admin'::text, 'dev'::text]))));

CREATE POLICY "Flights all policy" ON "public"."flights"
  FOR ALL
  TO "authenticated"
  USING (((user_id = auth.uid()) OR (( SELECT p.role
   FROM public.profiles p
  WHERE (p.id = auth.uid())) = ANY (ARRAY['admin'::text, 'dev'::text]))))
  WITH CHECK (((user_id = auth.uid()) OR (( SELECT p.role
   FROM public.profiles p
  WHERE (p.id = auth.uid())) = ANY (ARRAY['admin'::text, 'dev'::text]))));

CREATE POLICY "Gear viewable by teammates" ON "public"."gear"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = auth.uid()) OR public.share_team(user_id, auth.uid())));

CREATE POLICY "Users can manage their own gear" ON "public"."gear"
  FOR ALL
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can manage their own gear parts" ON "public"."gear_parts"
  FOR ALL
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Maintenance all policy" ON "public"."maintenance"
  FOR ALL
  TO "authenticated"
  USING (((user_id = auth.uid()) OR (( SELECT p.role
   FROM public.profiles p
  WHERE (p.id = auth.uid())) = ANY (ARRAY['admin'::text, 'dev'::text]))))
  WITH CHECK (((user_id = auth.uid()) OR (( SELECT p.role
   FROM public.profiles p
  WHERE (p.id = auth.uid())) = ANY (ARRAY['admin'::text, 'dev'::text]))));

CREATE POLICY "Users can manage their own maintenance logs" ON "public"."maintenance_logs"
  FOR ALL
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Admins can insert notifications" ON "public"."notifications"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.role = 'dev'::text))))));

CREATE POLICY "Users can read relevant notifications" ON "public"."notifications"
  FOR SELECT
  TO "authenticated"
  USING (((target_tier = 'all'::text) OR (target_user_id = auth.uid()) OR (target_tier = ( SELECT profiles.tier
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.role = 'dev'::text)))))));

CREATE POLICY "pilot_settings_owner_insert" ON "public"."pilot_settings"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "pilot_settings_owner_select" ON "public"."pilot_settings"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "pilot_settings_owner_update" ON "public"."pilot_settings"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Enable insert for users and triggers" ON "public"."profiles"
  FOR INSERT
  TO "authenticated", "service_role"
  WITH CHECK (true);

CREATE POLICY "Enable read access for self and admins" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (((auth.uid() = id) OR public.is_admin_or_dev(auth.uid())));

CREATE POLICY "Enable update for self and admins" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING (((auth.uid() = id) OR public.is_admin_or_dev(auth.uid())))
  WITH CHECK (((auth.uid() = id) OR public.is_admin_or_dev(auth.uid())));

CREATE POLICY "Profiles delete policy" ON "public"."profiles"
  FOR DELETE
  TO "authenticated"
  USING (public.is_admin_or_dev(auth.uid()));

CREATE POLICY "Admins can read all security logs" ON "public"."security_logs"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'dev'::text]))))));

CREATE POLICY "Users can insert their own security logs" ON "public"."security_logs"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Sessions viewable by teammates" ON "public"."sessions"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = auth.uid()) OR public.share_team(user_id, auth.uid())));

CREATE POLICY "Users can manage their own sessions" ON "public"."sessions"
  FOR ALL
  TO "authenticated"
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Admins can manage system settings" ON "public"."system_settings"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'dev'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'dev'::text]))))));

CREATE POLICY "Users can read maintenance broadcast" ON "public"."system_settings"
  FOR SELECT
  TO "authenticated"
  USING ((key = 'maintenance_broadcast'::text));

CREATE POLICY "Team invite codes insertable by members" ON "public"."team_invite_codes"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_team_member(team_id, auth.uid()));

CREATE POLICY "Team invite codes viewable by members" ON "public"."team_invite_codes"
  FOR SELECT
  TO "authenticated"
  USING (public.is_team_member(team_id, auth.uid()));

CREATE POLICY "Team members insertable by owner/admin" ON "public"."team_members"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.teams
  WHERE ((teams.id = team_members.team_id) AND (teams.owner_id = auth.uid()))))));

CREATE POLICY "Team members viewable by squad" ON "public"."team_members"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = auth.uid()) OR public.is_team_member(team_id, auth.uid())));

CREATE POLICY "Teams insertable by authenticated users" ON "public"."teams"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY "Teams viewable by members or owners" ON "public"."teams"
  FOR SELECT
  TO "authenticated"
  USING (((owner_id = auth.uid()) OR public.is_team_member(id, auth.uid())));

GRANT EXECUTE ON FUNCTION "public"."admin_get_active_sessions_count"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_get_admin_directory"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_get_db_health"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_get_security_logs"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_get_user_count"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_get_user_emails"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."auth_user_role"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."auto_generate_team_invite_code_trigger"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."check_is_admin"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."create_team_invite_code"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."create_user_profile"(uuid, text, text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."dissolve_squadron"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."generate_random_invite_code"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_credential_record"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_pilot_settings"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user_credential"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user_settings"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_admin_or_dev"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_admin_or_dev"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_team_member"(uuid, uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_team_owner"(uuid, uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."join_team_with_code"(text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."leave_squadron"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."log_and_force_retoken"(text, text, text, text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."protect_profile_system_fields"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."share_team"(uuid, uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_audit_logs" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."drones" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."flights" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gear" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gear_parts" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."maintenance" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."maintenance_logs" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pilot_settings" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."security_logs" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."system_settings" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_invite_codes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_members" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."teams" TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON TYPE "public"."session_type" TO "postgres";

