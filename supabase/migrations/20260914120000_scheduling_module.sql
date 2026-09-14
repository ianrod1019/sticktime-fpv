-- ============================================================
-- Migration: Scheduling & dispatch module (edu schema)
--
-- Institutional/FERPA-style scheduling plane, separate from the
-- consumer logbook (the two-plane model from the compliance review):
--
--   edu.organization_addons — per-org feature purchases. The Scheduling
--     Add-On is the first flag; future paid org add-ons follow the same
--     shape (billing flips it via set_scheduling_addon / webhook).
--   edu.schedules — per-person allocations of org airframes + batteries
--     to time slots. Double-booking of HARDWARE is rejected at the
--     storage layer by partial exclusion constraints (btree_gist +
--     tsrange), which are race-proof: two simultaneous saves cannot
--     both succeed. Person overlaps are allowed (an instructor may
--     supervise parallel stations); the client warns via
--     find_person_conflicts before saving.
--
-- Tier gating (the access contract):
--   * solo_commercial, enterprise → allowed by tier alone.
--   * school → allowed only when the org purchased the Scheduling
--     Add-On (edu.organization_addons.scheduling_enabled).
--   * free / pro (hobbyist) → NEVER allowed, even if their org has
--     the add-on — the member's own tier disqualifies.
--   * site admins/devs bypass for support.
--
-- Authorization to manage (create/edit/delete bookings):
--   * org owner/manager, OR
--   * a member granted the can_schedule capability switch (or a custom
--     team_roles template that grants it) — "authorized instructors".
--
-- House style mirrors org_gear: SECURITY DEFINER helpers with pinned
-- search_path, RLS via helper functions, REVOKE from anon/public,
-- grants to authenticated only, moddatetime touch triggers, idempotent
-- realtime publication registration.
--
-- Depends on: teams, team_members, team_roles, profiles, org_gear.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS edu;

-- ---------------------------------------------------------------------------
-- 0. btree_gist — required for scalar equality inside EXCLUDE constraints
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Profiles tier vocabulary: solo_commercial + school tiers join the
--    existing free/pro/enterprise ladder. (The scheduling gate below is
--    the consumer of these values; existing rows are untouched.)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_tier_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_tier_check
      CHECK (tier IN ('free', 'pro', 'solo_commercial', 'school', 'enterprise'))
      NOT VALID;
    -- Mirror 20260926000000: add NOT VALID (instant), then validate so a
    -- legacy out-of-vocabulary tier fails loudly, not the migration.
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_tier_check;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Per-org feature purchases. One row per team (the org). A MISSING row
--    means "nothing purchased" — cheaper and safer than default-true.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.organization_addons (
  team_id            uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  scheduling_enabled boolean NOT NULL DEFAULT false,
  enabled_at         timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. The "authorized instructor" capability: same mechanism as
--    can_view_ledger / can_edit_gear. NULL = not granted; owners grant
--    it per member or via a custom role template.
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS can_schedule boolean;

ALTER TABLE public.team_roles
  ADD COLUMN IF NOT EXISTS can_schedule boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4. edu.schedules — the booking ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.schedules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event_title      text NOT NULL CHECK (char_length(btrim(event_title)) BETWEEN 1 AND 120),
  description      text,
  assigned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  airframe_id      uuid REFERENCES org_gear.drones(id) ON DELETE SET NULL,
  battery_id       uuid REFERENCES org_gear.batteries(id) ON DELETE SET NULL,
  start_time       timestamptz NOT NULL,
  end_time         timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'checked_in', 'completed', 'cancelled', 'no_show')),
  created_by       uuid NOT NULL DEFAULT auth.uid()
                   REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CHECK (end_time > start_time)
  -- NOTE: "battery requires airframe" and "gear belongs to the booking's
  -- org" are enforced by the validate_schedule_gear trigger below, not a
  -- CHECK constraint — a CHECK would fire on ON DELETE SET NULL cascades
  -- (deleting a drone would strand battery-only rows and block the delete).
);

-- ---------------------------------------------------------------------------
-- 5. Double-booking prevention — the storage-layer guarantee.
--
-- Partial EXCLUDE constraints: for ACTIVE bookings (scheduled or
-- checked_in), the same airframe (resp. battery) may not have two rows
-- with overlapping [start, end) ranges. Completed/cancelled rows are
-- excluded from the constraint (WHERE clause) so history never blocks a
-- new booking. errcode 23P01 (exclusion_violation) is the signal the
-- client maps to "that airframe/battery is already booked".
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedules_no_airframe_overlap'
  ) THEN
    -- tstzrange matches the timestamptz columns exactly (no implicit
    -- downcast to timestamp, which would depend on the session timezone).
    ALTER TABLE edu.schedules ADD CONSTRAINT schedules_no_airframe_overlap
      EXCLUDE USING gist (
        airframe_id WITH =,
        tstzrange(start_time, end_time) WITH &&
      )
      WHERE (airframe_id IS NOT NULL AND status IN ('scheduled', 'checked_in'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedules_no_battery_overlap'
  ) THEN
    ALTER TABLE edu.schedules ADD CONSTRAINT schedules_no_battery_overlap
      EXCLUDE USING gist (
        battery_id WITH =,
        tstzrange(start_time, end_time) WITH &&
      )
      WHERE (battery_id IS NOT NULL AND status IN ('scheduled', 'checked_in'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Helpers — SECURITY DEFINER, pinned search_path, never callable
--    directly (mirrors org_gear.is_site_admin / org_gear.team_role).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION edu.is_site_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(role) IN ('admin', 'dev')
  );
$$;

CREATE OR REPLACE FUNCTION edu.team_role(_team_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.team_role
  FROM public.team_members tm
  WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION edu.is_org_member(_team_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, edu
AS $$
  SELECT edu.team_role(_team_id) IS NOT NULL OR edu.is_site_admin();
$$;

-- The caller's own tier — the Hobbyist block lives here.
CREATE OR REPLACE FUNCTION edu.my_tier()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tier FROM public.profiles WHERE id = auth.uid()
$$;

-- Has the org purchased the Scheduling Add-On?
CREATE OR REPLACE FUNCTION edu.scheduling_addon_enabled(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = edu
AS $$
  SELECT COALESCE(
    (SELECT scheduling_enabled FROM edu.organization_addons WHERE team_id = _team_id),
    false
  )
$$;

-- THE GATE. One predicate every policy and RPC renders from:
-- member of the org AND tier clears the Hobbyist bar AND (tier carries
-- scheduling OR the org purchased the add-on) — or a site admin.
CREATE OR REPLACE FUNCTION edu.has_scheduling_access(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, edu
AS $$
  SELECT edu.is_site_admin() OR (
    edu.team_role(_team_id) IS NOT NULL
    AND COALESCE(edu.my_tier(), 'free') IN ('solo_commercial', 'school', 'enterprise')
    AND (
      COALESCE(edu.my_tier(), 'free') IN ('solo_commercial', 'enterprise')
      OR edu.scheduling_addon_enabled(_team_id)
    )
  )
$$;

-- Manage rights: owner/manager, an explicitly granted instructor
-- (per-member switch or role template), or a site admin — always
-- ON TOP OF has_scheduling_access (a hobbyist manager is still blocked).
CREATE OR REPLACE FUNCTION edu.can_manage_schedule(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, edu
AS $$
  SELECT edu.has_scheduling_access(_team_id) AND (
    edu.is_site_admin()
    OR edu.team_role(_team_id) IN ('owner', 'manager')
    OR COALESCE(
      (SELECT COALESCE(tm.can_schedule, false) OR COALESCE(r.can_schedule, false)
       FROM public.team_members tm
       LEFT JOIN public.team_roles r ON r.id = tm.role_id
       WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()),
      false
    )
  )
$$;

-- Is the given user a member of the org? Used by the INSERT policy to
-- make cross-tenant assignment impossible.
CREATE OR REPLACE FUNCTION edu.is_org_member_user(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id
  )
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS. Every operation has an explicit USING / WITH CHECK.
-- ---------------------------------------------------------------------------

ALTER TABLE edu.organization_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_addons_member_select ON edu.organization_addons;
CREATE POLICY org_addons_member_select
  ON edu.organization_addons FOR SELECT
  USING (edu.is_org_member(team_id));

-- Purchases flip only via set_scheduling_addon (site admin/dev) or a
-- future billing webhook (service_role). No direct authenticated writes.

ALTER TABLE edu.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedules_member_select ON edu.schedules;
CREATE POLICY schedules_member_select
  ON edu.schedules FOR SELECT
  USING (edu.has_scheduling_access(organization_id));

DROP POLICY IF EXISTS schedules_manager_insert ON edu.schedules;
CREATE POLICY schedules_manager_insert
  ON edu.schedules FOR INSERT
  WITH CHECK (
    edu.can_manage_schedule(organization_id)
    -- The assigned person must belong to THIS org: no cross-tenant
    -- assignment, no booking strangers onto the calendar.
    AND edu.is_org_member_user(organization_id, assigned_user_id)
  );

DROP POLICY IF EXISTS schedules_manager_update ON edu.schedules;
CREATE POLICY schedules_manager_update
  ON edu.schedules FOR UPDATE
  USING (edu.can_manage_schedule(organization_id))
  WITH CHECK (
    edu.can_manage_schedule(organization_id)
    AND edu.is_org_member_user(organization_id, assigned_user_id)
  );

DROP POLICY IF EXISTS schedules_manager_delete ON edu.schedules;
CREATE POLICY schedules_manager_delete
  ON edu.schedules FOR DELETE
  USING (edu.can_manage_schedule(organization_id));

-- Assigned users keep read access to their own bookings regardless of
-- tier or add-on state — a booked pilot/student can always see their own
-- duty roster. Writing is limited to status flips (column-guard trigger
-- below), and the gate trigger still requires org membership.
DROP POLICY IF EXISTS schedules_assignee_select ON edu.schedules;
CREATE POLICY schedules_assignee_select
  ON edu.schedules FOR SELECT
  USING (
    assigned_user_id = auth.uid()
    AND edu.is_org_member(organization_id)
  );

DROP POLICY IF EXISTS schedules_assignee_status_update ON edu.schedules;
CREATE POLICY schedules_assignee_status_update
  ON edu.schedules FOR UPDATE
  USING (assigned_user_id = auth.uid())
  WITH CHECK (assigned_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. Write-path triggers: tier/add-on gate on writes (belt+braces over
--    RLS), and the assignee status-only column guard.
-- ---------------------------------------------------------------------------

-- 8a. The gate trigger. RLS policies call can_manage_schedule already;
--     this trigger is the second lock so a future policy regression
--     cannot silently reopen writes. Hobbyist/pro members get a clear
--     "tier" error; school members of add-on-less orgs get an "add-on"
--     error — the exact distinction the upgrade modal needs.
--     Exemption: the ASSIGNEE status-only path (a booked person flipping
--     their own booking's status) needs only org membership — duty-roster
--     access is not the gated scheduling module.
CREATE OR REPLACE FUNCTION edu.enforce_scheduling_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, edu
AS $$
DECLARE
  v_team  uuid;
  v_tier  text;
BEGIN
  v_team := CASE WHEN TG_OP = 'DELETE'
                 THEN (to_jsonb(OLD) ->> 'organization_id')::uuid
                 ELSE (to_jsonb(NEW) ->> 'organization_id')::uuid
            END;

  -- No-JWT context (migrations, pg_cron, direct SQL as postgres): such
  -- callers bypass RLS by role anyway; the gate exists for PostgREST
  -- callers, whose requests always carry a JWT.
  IF auth.uid() IS NULL OR edu.is_site_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF edu.team_role(v_team) IS NULL THEN
    RAISE EXCEPTION 'Scheduling: you are not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Assignee status-only path: same person, only status/updated_at move.
  IF TG_OP = 'UPDATE'
     AND OLD.assigned_user_id = auth.uid()
     AND NEW.assigned_user_id = OLD.assigned_user_id
     AND (to_jsonb(NEW) - ARRAY['status', 'updated_at']) IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['status', 'updated_at'])
     AND NOT edu.can_manage_schedule(v_team) THEN
    RETURN NEW;
  END IF;

  v_tier := COALESCE(edu.my_tier(), 'free');

  IF v_tier NOT IN ('solo_commercial', 'school', 'enterprise') THEN
    RAISE EXCEPTION
      'Scheduling requires a Solo Commercial, School, or Enterprise tier (your tier: %)', v_tier
      USING ERRCODE = 'insufficient_privilege', HINT = 'upgrade_tier';
  END IF;

  IF v_tier = 'school' AND NOT edu.scheduling_addon_enabled(v_team) THEN
    RAISE EXCEPTION
      'Scheduling Add-On not purchased by this organization'
      USING ERRCODE = 'insufficient_privilege', HINT = 'purchase_addon';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS scheduling_gate ON edu.schedules;
CREATE TRIGGER scheduling_gate
BEFORE INSERT OR UPDATE OR DELETE ON edu.schedules
FOR EACH ROW EXECUTE FUNCTION edu.enforce_scheduling_gate();

-- 8b. Assignees may flip ONLY status. Any other column change by a
--     non-manager assignee is rejected (FERPA: students do not edit
--     the record, they act on it).
CREATE OR REPLACE FUNCTION edu.enforce_assignee_status_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, edu
AS $$
BEGIN
  -- Managers (and admins) pass straight through; no-JWT contexts
  -- (migrations/maintenance SQL) are trusted by role.
  IF auth.uid() IS NULL OR edu.can_manage_schedule(NEW.organization_id) THEN
    RETURN NEW;
  END IF;

  -- Assignee without manage rights: only status may change.
  IF (to_jsonb(NEW) - ARRAY['status', 'updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'updated_at']) THEN
    RAISE EXCEPTION
      'Assigned users may update only the status of their bookings'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignee_status_only ON edu.schedules;
CREATE TRIGGER assignee_status_only
BEFORE UPDATE ON edu.schedules
FOR EACH ROW EXECUTE FUNCTION edu.enforce_assignee_status_only();

-- 8c. Gear integrity: hardware on a booking must belong to the booking's
--     own org (no cross-tenant reference to another squadron's fleet), and
--     a battery allocation requires an airframe allocation. Trigger, not
--     CHECK, so ON DELETE SET NULL cascades never trip it.
CREATE OR REPLACE FUNCTION edu.validate_schedule_gear()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear, edu
AS $$
BEGIN
  IF NEW.airframe_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM org_gear.drones
      WHERE id = NEW.airframe_id AND team_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION
        'Airframe does not belong to this organization'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.battery_id IS NOT NULL THEN
    IF NEW.airframe_id IS NULL THEN
      RAISE EXCEPTION
        'A battery allocation requires an airframe allocation'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM org_gear.batteries
      WHERE id = NEW.battery_id AND team_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION
        'Battery does not belong to this organization'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_schedule_gear ON edu.schedules;
CREATE TRIGGER validate_schedule_gear
BEFORE INSERT OR UPDATE ON edu.schedules
FOR EACH ROW
WHEN (NEW.airframe_id IS NOT NULL OR NEW.battery_id IS NOT NULL)
EXECUTE FUNCTION edu.validate_schedule_gear();

-- 8d. Keep updated_at truthful.
DROP TRIGGER IF EXISTS touch_updated_at ON edu.schedules;
CREATE TRIGGER touch_updated_at
BEFORE UPDATE ON edu.schedules
FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 9. Indexes — calendar window scans, person filter, conflict lookups.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_schedules_org_start
  ON edu.schedules (organization_id, start_time);
CREATE INDEX IF NOT EXISTS idx_schedules_assignee_start
  ON edu.schedules (assigned_user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_schedules_airframe
  ON edu.schedules (airframe_id) WHERE airframe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_battery
  ON edu.schedules (battery_id) WHERE battery_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_status
  ON edu.schedules (organization_id, status);

-- ---------------------------------------------------------------------------
-- 10. Client RPCs. SECURITY DEFINER + pinned search_path; granted to
--     authenticated only (house style per 20260921120000).
-- ---------------------------------------------------------------------------

-- 10a. The single call the gate UI renders from.
CREATE OR REPLACE FUNCTION edu.get_scheduling_access(_team_id uuid)
RETURNS TABLE (
  enabled         boolean,
  tier_ok         boolean,
  addon_purchased boolean,
  can_manage      boolean,
  org_role        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, edu
AS $$
  SELECT
    edu.has_scheduling_access(_team_id),
    COALESCE(edu.my_tier(), 'free') IN ('solo_commercial', 'school', 'enterprise'),
    edu.scheduling_addon_enabled(_team_id),
    edu.can_manage_schedule(_team_id),
    edu.team_role(_team_id)
$$;

-- 10b. Calendar window fetch. Callsigns only (raw_user_meta_data) —
--      never emails, per the data-minimization posture. Users with full
--      access see the org window; other org members see only the
--      bookings that name them.
CREATE OR REPLACE FUNCTION edu.get_schedule_events(
  _team_id              uuid,
  _from                 timestamptz,
  _to                   timestamptz,
  _assigned_user_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  organization_id  uuid,
  event_title      text,
  description      text,
  assigned_user_id uuid,
  assigned_callsign text,
  airframe_id      uuid,
  airframe_name    text,
  battery_id       uuid,
  battery_name     text,
  start_time       timestamptz,
  end_time         timestamptz,
  status           text,
  created_by       uuid,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, edu
AS $$
BEGIN
  -- The fetcher must be a member of the org: full access shows the whole
  -- calendar; any other member gets the assignee-limited view below
  -- (matching the schedules_assignee_select policy).
  IF edu.team_role(_team_id) IS NULL THEN
    RAISE EXCEPTION 'Scheduling access denied for this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.organization_id,
         s.event_title,
         s.description,
         s.assigned_user_id,
         COALESCE(
           NULLIF(btrim(COALESCE(u.raw_user_meta_data ->> 'callsign', '')), ''),
           'Member'
         ) AS assigned_callsign,
         s.airframe_id,
         d.name AS airframe_name,
         s.battery_id,
         b.name AS battery_name,
         s.start_time,
         s.end_time,
         s.status,
         s.created_by,
         s.created_at,
         s.updated_at
  FROM edu.schedules s
  LEFT JOIN auth.users u ON u.id = s.assigned_user_id
  LEFT JOIN org_gear.drones d ON d.id = s.airframe_id
  LEFT JOIN org_gear.batteries b ON b.id = s.battery_id
  WHERE s.organization_id = _team_id
    AND s.start_time < _to
    AND s.end_time > _from
    AND (
      edu.has_scheduling_access(_team_id)
      OR s.assigned_user_id = auth.uid() -- assignee-limited view
    )
    AND (_assigned_user_filter IS NULL OR s.assigned_user_id = _assigned_user_filter)
  ORDER BY s.start_time;
END;
$$;

-- 10c. Assignable roster: members of the org, callsigns only. Callsigns
--      are directory PII, so this is gated on scheduling access — the
--      roster serves the assign picker and the person filter, both of
--      which only exist for users who can see the calendar.
CREATE OR REPLACE FUNCTION edu.get_org_roster(_team_id uuid)
RETURNS TABLE (
  user_id  uuid,
  callsign text,
  org_role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, edu
AS $$
BEGIN
  IF NOT edu.has_scheduling_access(_team_id) THEN
    RAISE EXCEPTION 'Scheduling access denied for this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT tm.user_id,
         COALESCE(
           NULLIF(btrim(COALESCE(u.raw_user_meta_data ->> 'callsign', '')), ''),
           'Member'
         ) AS callsign,
         tm.team_role::text AS org_role
  FROM public.team_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.team_id = _team_id
  ORDER BY 2, 3;
END;
$$;

-- 10d. Person-conflict lookup for the warn-but-allow UX. Returns the
--      caller's view of overlapping ACTIVE bookings for one person.
CREATE OR REPLACE FUNCTION edu.find_person_conflicts(
  _user_id   uuid,
  _start     timestamptz,
  _end       timestamptz,
  _exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  event_title text,
  start_time  timestamptz,
  end_time    timestamptz,
  status      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, edu
AS $$
  SELECT s.id, s.event_title, s.start_time, s.end_time, s.status
  FROM edu.schedules s
  WHERE s.assigned_user_id = _user_id
    AND s.status IN ('scheduled', 'checked_in')
    AND s.start_time < _end
    AND s.end_time > _start
    AND (_exclude_id IS NULL OR s.id <> _exclude_id)
    -- Tenancy: conflicts are only ever surfaced within orgs the
    -- caller can already see.
    AND (edu.has_scheduling_access(s.organization_id) OR s.assigned_user_id = auth.uid())
  ORDER BY s.start_time;
$$;

-- 10e. Add-on purchase switch — site admin/dev only for now; the
--      Stripe webhook (when billing goes live) will call this with
--      elevated privileges.
CREATE OR REPLACE FUNCTION edu.set_scheduling_addon(_team_id uuid, _enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, edu
AS $$
BEGIN
  IF NOT edu.is_site_admin() THEN
    RAISE EXCEPTION 'Only platform admins can change organization add-ons'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO edu.organization_addons (team_id, scheduling_enabled, enabled_at)
  VALUES (_team_id, _enabled, CASE WHEN _enabled THEN now() END)
  ON CONFLICT (team_id) DO UPDATE
    SET scheduling_enabled = EXCLUDED.scheduling_enabled,
        enabled_at = CASE WHEN EXCLUDED.scheduling_enabled
                          THEN COALESCE(edu.organization_addons.enabled_at, now())
                          ELSE NULL END,
        updated_at = now();
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Grants — authenticated only, anon/public get nothing.
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA edu FROM anon, public;
GRANT USAGE ON SCHEMA edu TO authenticated;

REVOKE ALL ON edu.schedules FROM anon, public, authenticated;
REVOKE ALL ON edu.organization_addons FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON edu.schedules TO authenticated;
GRANT SELECT ON edu.organization_addons TO authenticated;

REVOKE ALL ON FUNCTION edu.is_site_admin() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.team_role(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.is_org_member(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.my_tier() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.scheduling_addon_enabled(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.has_scheduling_access(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.can_manage_schedule(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.is_org_member_user(uuid, uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.enforce_scheduling_gate() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.enforce_assignee_status_only() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.validate_schedule_gear() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION edu.set_scheduling_addon(uuid, boolean) FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION edu.get_scheduling_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION edu.get_schedule_events(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION edu.get_org_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION edu.find_person_conflicts(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION edu.set_scheduling_addon(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 12. Realtime — live calendar updates across managers (idempotent).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'edu'
      AND tablename = 'schedules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE edu.schedules;
  END IF;
END $$;

-- ============================================================
-- End of migration
-- ============================================================
