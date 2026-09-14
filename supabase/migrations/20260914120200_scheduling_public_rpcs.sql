-- ============================================================
-- Migration: Public-facing scheduling RPCs (supabase-js bridge)
--
-- supabase.rpc() only addresses functions in the `public` schema, so
-- the client contract lives here as thin SECURITY DEFINER wrappers over
-- the real logic in edu (20260914120000) — the same convention as the
-- FERPA plane's public.edu_* functions.
--
-- Naming: public.edu_scheduling_* (this module) vs public.edu_* (the
-- roster/district plane). Grants: authenticated only.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Access matrix for the gate UI — one call, five booleans + the role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edu_scheduling_access(_team_id uuid)
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
  SELECT * FROM edu.get_scheduling_access(_team_id)
$$;

-- ---------------------------------------------------------------------------
-- Calendar window fetch (assignee-limited views included server-side).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edu_schedule_events(
  _team_id              uuid,
  _from                 timestamptz,
  _to                   timestamptz,
  _assigned_user_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id                uuid,
  organization_id   uuid,
  event_title       text,
  description       text,
  assigned_user_id  uuid,
  assigned_callsign text,
  airframe_id       uuid,
  airframe_name     text,
  battery_id        uuid,
  battery_name      text,
  start_time        timestamptz,
  end_time          timestamptz,
  status            text,
  created_by        uuid,
  created_at        timestamptz,
  updated_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, edu
AS $$
  SELECT * FROM edu.get_schedule_events(_team_id, _from, _to, _assigned_user_filter)
$$;

-- ---------------------------------------------------------------------------
-- Assignable roster (callsigns only; gated on scheduling access).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edu_org_roster(_team_id uuid)
RETURNS TABLE (
  user_id  uuid,
  callsign text,
  org_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, edu
AS $$
  SELECT * FROM edu.get_org_roster(_team_id)
$$;

-- ---------------------------------------------------------------------------
-- Person-overlap lookup for the warn-but-allow confirm flow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edu_person_conflicts(
  _user_id    uuid,
  _start      timestamptz,
  _end        timestamptz,
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
  SELECT * FROM edu.find_person_conflicts(_user_id, _start, _end, _exclude_id)
$$;

-- ---------------------------------------------------------------------------
-- Grants (function EXECUTE defaults to PUBLIC — revoke first, house style).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.edu_scheduling_access(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.edu_schedule_events(uuid, timestamptz, timestamptz, uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.edu_org_roster(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.edu_person_conflicts(uuid, timestamptz, timestamptz, uuid) FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.edu_scheduling_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edu_schedule_events(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edu_org_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edu_person_conflicts(uuid, timestamptz, timestamptz, uuid) TO authenticated;

-- ============================================================
-- End of migration
-- ============================================================
