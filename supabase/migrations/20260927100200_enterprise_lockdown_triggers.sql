-- ============================================================
-- Migration: Enterprise lockdown triggers — database-enforced policy
--
-- Turns enterprise_policies into real account lockdowns. Every trigger
-- here FAILS CLOSED for plain pilots and no-ops for admins:
--
--   lock_profile_settings      → pilots cannot INSERT/UPDATE/DELETE
--                                pilot_settings; squadron/district
--                                admins and platform staff keep access.
--   require_preflight_checklist → public.sessions INSERTs by pilots of a
--                                locked-down org need preflight_completed.
--   enforce_firmware_version   → public.sessions INSERTs by pilots need
--                                firmware_version >= the org floor.
--   lock_inventory             → pilots cannot write org_gear.* tables.
--   Standard tier seat cap     → org teams capped at 25 members.
--
-- The org_gear fleet money-lock trigger (20260920000000) already checks
-- TG_TABLE_NAME — skipping by table name is the established pattern.
--
-- SESSION COLUMNS (added here; the log dialog sends them):
--   sessions.firmware_version     text
--   sessions.preflight_completed  boolean
-- Both NULLable; preflight defaults to false so require_* fails closed.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Session columns the compliance gates need
-- ---------------------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS firmware_version text;
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS preflight_completed boolean DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Shared trigger guard
-- ---------------------------------------------------------------------------

-- Effective role of the caller in the org that owns this row.
-- Returns: 'district_admin' | 'squadron_admin' | 'pilot' | 'none'
-- (plus 'platform_admin' short-circuit for admin/dev).
CREATE OR REPLACE FUNCTION public.ent_effective_role(_org uuid)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_team uuid;
    v_role text;
  BEGIN
    IF _org IS NULL THEN
      RETURN 'none';
    END IF;

    SELECT o.team_id INTO v_team FROM public.organizations o WHERE o.id = _org;
    IF v_team IS NULL THEN
      RETURN 'none';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND lower(role) IN ('admin', 'dev')
    ) THEN
      RETURN 'platform_admin';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.enterprises e
       WHERE e.billing_owner_id = auth.uid()
         AND e.id = (SELECT o.enterprise_id FROM public.organizations o
                      WHERE o.id = _org)
    ) THEN
      RETURN 'district_admin';
    END IF;

    SELECT tm.team_role INTO v_role
      FROM public.team_members tm
     WHERE tm.team_id = v_team AND tm.user_id = auth.uid();

    IF v_role IN ('owner', 'manager') THEN
      RETURN 'squadron_admin';
    ELSIF v_role IS NOT NULL THEN
      RETURN 'pilot';
    END IF;
    RETURN 'none';
  END;
  $$;

-- ---------------------------------------------------------------------------
-- 3. Pilot-seats cap — Standard plan orgs hold 25 member seats.
--    Fires on org INSERT (guard clause) and team_member INSERT/UPDATE.
-- ---------------------------------------------------------------------------

-- Seat cap applies only when the org's enterprise is on the standard plan.
CREATE OR REPLACE FUNCTION public.ent_org_seat_cap(_org uuid)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT p.max_seats_per_org
      FROM public.organizations o
      JOIN public.enterprises e ON e.id = o.enterprise_id
      JOIN public.enterprise_plans p ON p.code = e.plan_code
     WHERE o.id = _org;
  $$;

CREATE OR REPLACE FUNCTION public.ent_enforce_seat_cap()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_org uuid;
    v_cap integer;
    v_count integer;
  BEGIN
    -- The join key: team_members.team_id maps 1:1 to organizations.team_id.
    v_org := (SELECT o.id FROM public.organizations o
               WHERE o.team_id = NEW.team_id);
    IF v_org IS NULL THEN
      RETURN NEW; -- plain team (not an enterprise org): no cap
    END IF;

    v_cap := public.ent_org_seat_cap(v_org);
    IF v_cap IS NULL THEN
      RETURN NEW; -- unlimited (district tier)
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.team_members tm
     WHERE tm.team_id = NEW.team_id
       AND (TG_OP <> 'UPDATE' OR tm.user_id <> OLD.user_id);

    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'org seat cap reached (% members max)', v_cap
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS ent_seat_cap_members ON public.team_members;
CREATE TRIGGER ent_seat_cap_members
  AFTER INSERT OR UPDATE OF user_id ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.ent_enforce_seat_cap();

-- ---------------------------------------------------------------------------
-- 4. lock_profile_settings — pilots lose pilot_settings write access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ent_enforce_profile_lock()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_org uuid;
  BEGIN
    -- The user's FIRST org membership drives the check (a pilot belongs
    -- to one enterprise org; multi-org pilots keep their own settings).
    SELECT o.id INTO v_org
      FROM public.organizations o
      JOIN public.team_members tm ON tm.team_id = o.team_id
     WHERE tm.user_id = auth.uid()
     ORDER BY o.created_at
     LIMIT 1;

    IF v_org IS NULL THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    IF public.ent_effective_role(v_org) = 'pilot'
       AND public.ent_policy_active(v_org, 'lock_profile_settings') THEN
      RAISE EXCEPTION
        'profile settings are locked by your squadron policy'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN COALESCE(NEW, OLD);
  END;
  $$;

DROP TRIGGER IF EXISTS ent_profile_lock ON public.pilot_settings;
CREATE TRIGGER ent_profile_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.pilot_settings
  FOR EACH ROW EXECUTE FUNCTION public.ent_enforce_profile_lock();

-- ---------------------------------------------------------------------------
-- 5. Flight-log gates — preflight checklist + firmware floor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ent_enforce_flight_gates()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_org uuid;
  BEGIN
    SELECT o.id INTO v_org
      FROM public.organizations o
      JOIN public.team_members tm ON tm.team_id = o.team_id
     WHERE tm.user_id = NEW.user_id
     ORDER BY o.created_at
     LIMIT 1;

    IF v_org IS NULL THEN
      RETURN NEW; -- not an enterprise org member: no gate
    END IF;

    IF public.ent_effective_role(v_org) = 'pilot' THEN
      IF public.ent_policy_active(v_org, 'require_preflight_checklist')
         AND COALESCE(NEW.preflight_completed, false) IS NOT TRUE THEN
        RAISE EXCEPTION
          'pre-flight checklist must be completed before logging'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF public.ent_policy_active(v_org, 'enforce_firmware_version')
         AND NOT public.ent_firmware_ok(v_org, NEW.firmware_version) THEN
        RAISE EXCEPTION
          'firmware % is below the squadron minimum', COALESCE(NEW.firmware_version, '(none)')
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS ent_flight_gates ON public.sessions;
CREATE TRIGGER ent_flight_gates
  BEFORE INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.ent_enforce_flight_gates();

-- ---------------------------------------------------------------------------
-- 6. lock_inventory — pilots cannot write the org fleet
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ent_enforce_inventory_lock()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_org uuid;
  BEGIN
    v_org := (SELECT o.id FROM public.organizations o
               WHERE o.team_id =
                 COALESCE(NEW.team_id, OLD.team_id));

    IF v_org IS NULL THEN
      RETURN COALESCE(NEW, OLD); -- plain squadron gear, not enterprise
    END IF;

    IF public.ent_effective_role(v_org) = 'pilot'
       AND public.ent_policy_active(v_org, 'lock_inventory') THEN
      RAISE EXCEPTION
        'team inventory is locked by squadron policy'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN COALESCE(NEW, OLD);
  END;
  $$;

-- Apply to every org_gear table that carries team_id and takes pilot
-- writes (the money-lock trigger already guards cost columns; this adds
-- the whole-surface lock). Generated in a DO loop for brevity.
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'drones', 'batteries', 'transmitters', 'goggles', 'other_gear',
    'drone_parts', 'drone_part_installs', 'maintenance_logs'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'org_gear' AND table_name = t
         AND column_name = 'team_id'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS ent_inventory_lock ON org_gear.%I', t);
      EXECUTE format(
        'CREATE TRIGGER ent_inventory_lock BEFORE INSERT OR UPDATE OR DELETE
           ON org_gear.%I FOR EACH ROW
           EXECUTE FUNCTION public.ent_enforce_inventory_lock()', t);
    END IF;
  END LOOP;
END $do$;

-- ============================================================
-- End of migration
-- ============================================================
