-- ============================================================
-- Migration: Enterprise schema — districts, org lockdowns, meetups
--
-- The CONSUMER enterprise plane (the school/institutional plane lives
-- in `edu` — see 20260927000100). Two tiers, one table shape:
--
--   * Standard Squadron ($960/yr floor): an `enterprises` row of plan
--     'standard_squadron' whose sole `organizations` row bridges the
--     existing squad (`teams`), plus `enterprise_policies` lockdowns.
--   * Multi-Squadron District ($2,400+/yr): the same shape with plan
--     'multi_district' and MULTIPLE organization rows — the parent/
--     child hierarchy. Centralized billing owner = enterprises.
--     billing_owner_id.
--
-- organizations is a BRIDGE, not a duplicate org tree: organization_id
-- ↔ team_id is UNIQUE 1:1, so every existing org_gear, ledger, roster,
-- and failure-analytics surface keeps working untouched. org_members
-- (built in 20260927100100+00120) is a VIEW resolving the requested
-- district_admin / squadron_admin / pilot labels from team_members —
-- no second source of role truth.
--
-- GDPR/FERPA minimization: NO emails, NO free-text PII in this plane.
-- People are referenced by auth user id only; display names resolve
-- client-side from pilot_settings callsigns. `.edu` school identity is
-- an institutional concern (edu schema) — enterprise orgs carry an
-- is_school flag purely so policy surfaces can render school copy.
--
-- Scheduling stays consumer-plane: squadron_meetups is a TEAM EVENT
-- (practice / race day / build workshop) with RSVP attendance — not a
-- hardware allocation. Hardware double-booking remains edu.schedules'
-- job (btree_gist exclusion constraints there). A meetup optionally
-- links a logged session (session_id) for post-meetup flight tracking.
--
-- RLS policies + grants: 20260927100120. Lockdown triggers:
-- 20260927100200. RPCs: 20260927100300.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Plans — the two enterprise tiers and their entitlements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enterprise_plans (
  code               text PRIMARY KEY,
  name               text NOT NULL,
  annual_price_floor numeric(10, 2) NOT NULL,
  max_orgs           integer,      -- NULL = unlimited
  max_seats_per_org  integer,      -- NULL = unlimited
  district_features  boolean NOT NULL DEFAULT false,
  description        text
);

INSERT INTO public.enterprise_plans
  (code, name, annual_price_floor, max_orgs, max_seats_per_org,
   district_features, description)
VALUES
  ('standard_squadron', 'Standard Squadron', 960.00, 1, 25, false,
   'Single org up to 25 seats, shared hangar, meetups, Pro feature inheritance'),
  ('multi_district', 'Multi-Squadron District', 2400.00, NULL, NULL, true,
   'Parent district managing multiple sub-squadrons, centralized billing, cross-squadron reporting')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.enterprise_plans ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Enterprises — the district / parent org
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enterprises (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  plan_code        text NOT NULL REFERENCES public.enterprise_plans(code),
  billing_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enterprises_billing_owner
  ON public.enterprises(billing_owner_id);

ALTER TABLE public.enterprises ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Organizations — sub-squadrons, bridged 1:1 to the existing teams
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  is_school     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organizations_enterprise
  ON public.organizations(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_organizations_team ON public.organizations(team_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Policies — account lockdowns & compliance controls
--
-- Scope: an org policy row (org_id set) overrides the enterprise default
-- (org_id NULL, inherited by every org of the enterprise). The org ∈
-- enterprise consistency rule needs a subquery, so it lives in a trigger
-- (enterprise_policy_scope_guard below), not a CHECK constraint.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enterprise_policies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id        uuid NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
  org_id               uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_key           text NOT NULL CHECK (policy_key IN (
                         'lock_profile_settings',       -- pilots cannot edit pilot_settings
                         'require_preflight_checklist', -- flight log inserts need preflight_completed
                         'enforce_firmware_version',    -- min firmware floor on team hulls
                         'lock_inventory'               -- pilots cannot write org_gear.*
                       )),
  enabled              boolean NOT NULL DEFAULT false,
  min_firmware_version text,            -- set when policy_key='enforce_firmware_version'
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT enterprise_policies_min_firmware_present
    CHECK (policy_key <> 'enforce_firmware_version'
           OR min_firmware_version IS NOT NULL),
  CONSTRAINT enterprise_policies_min_firmware_format
    CHECK (min_firmware_version IS NULL
           OR min_firmware_version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
  CONSTRAINT enterprise_policies_unique_scope
    UNIQUE (enterprise_id, org_id, policy_key)
);

ALTER TABLE public.enterprise_policies ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_enterprise_policies_lookup
  ON public.enterprise_policies(org_id, policy_key)
  WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enterprise_policies_enterprise
  ON public.enterprise_policies(enterprise_id, policy_key)
  WHERE org_id IS NULL;

-- org policy rows must belong to an org OF THE SAME enterprise.
CREATE OR REPLACE FUNCTION public.enterprise_policy_scope_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
       WHERE o.id = NEW.org_id AND o.enterprise_id = NEW.enterprise_id
    ) THEN
      RAISE EXCEPTION
        'policy org % does not belong to enterprise %', NEW.org_id, NEW.enterprise_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enterprise_policy_scope_guard ON public.enterprise_policies;
CREATE TRIGGER enterprise_policy_scope_guard
  BEFORE INSERT OR UPDATE OF enterprise_id, org_id ON public.enterprise_policies
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_policy_scope_guard();

-- ---------------------------------------------------------------------------
-- 5. Meetups — squadron events with RSVP attendance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.squadron_meetups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description    text,
  location       text,
  start_time     timestamptz NOT NULL,
  end_time       timestamptz NOT NULL,
  created_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  session_id     uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  CONSTRAINT squadron_meetups_time_order CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_squadron_meetups_org_start
  ON public.squadron_meetups(organization_id, start_time);
CREATE INDEX IF NOT EXISTS idx_squadron_meetups_session
  ON public.squadron_meetups(session_id) WHERE session_id IS NOT NULL;

ALTER TABLE public.squadron_meetups ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. RSVPs — one response per member per meetup
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meetup_rsvps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id    uuid NOT NULL REFERENCES public.squadron_meetups(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response     text NOT NULL CHECK (response IN ('attending', 'declined')),
  responded_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meetup_rsvps_one_per_user UNIQUE (meetup_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_meetup_rsvps_meetup ON public.meetup_rsvps(meetup_id);

ALTER TABLE public.meetup_rsvps ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7. updated_at touch triggers (delta-sync friendliness, house style)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enterprise_touch_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enterprises_touch ON public.enterprises;
CREATE TRIGGER enterprises_touch
  BEFORE UPDATE ON public.enterprises
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_touch_updated_at();

DROP TRIGGER IF EXISTS organizations_touch ON public.organizations;
CREATE TRIGGER organizations_touch
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_touch_updated_at();

DROP TRIGGER IF EXISTS enterprise_policies_touch ON public.enterprise_policies;
CREATE TRIGGER enterprise_policies_touch
  BEFORE UPDATE ON public.enterprise_policies
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_touch_updated_at();

DROP TRIGGER IF EXISTS squadron_meetups_touch ON public.squadron_meetups;
CREATE TRIGGER squadron_meetups_touch
  BEFORE UPDATE ON public.squadron_meetups
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_touch_updated_at();

-- ============================================================
-- End of migration (RLS + grants follow in 20260927100120)
-- ============================================================
