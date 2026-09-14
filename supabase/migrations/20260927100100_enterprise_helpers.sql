-- ============================================================
-- Migration: Enterprise helpers — role resolution + policy functions
--
-- Every table from 20260927100000 gets RLS with explicit USING +
-- WITH CHECK. The security mandate: only district_admin /
-- squadron_admin modify organizational settings, policies, and
-- meetups; pilots RSVP; nobody writes from anon.
--
-- Role labels resolve from ONE source of truth (the existing
-- team_members + teams.owner_id), via the org_members view:
--
--   district_admin  = enterprises.billing_owner_id
--                     (+ platform admin/dev staff override)
--   squadron_admin  = team_members.team_role IN ('owner','manager')
--   pilot           = every other org team member
--
-- All helper functions are SECURITY DEFINER with pinned search_path
-- (the RLS-inlining house pattern: STABLE sql functions so the planner
-- can inline them into policies).
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Role resolution — SECURITY DEFINER helpers (pinned search_path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ent_is_site_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND lower(role) IN ('admin', 'dev')
    );
  $$;

-- Is the caller the district admin (billing owner) of the enterprise
-- that owns this org?
CREATE OR REPLACE FUNCTION public.ent_is_district_admin(_org uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT EXISTS (
      SELECT 1
        FROM public.organizations o
        JOIN public.enterprises e ON e.id = o.enterprise_id
       WHERE o.id = _org
         AND e.billing_owner_id = auth.uid()
    );
  $$;

CREATE OR REPLACE FUNCTION public.ent_is_district_admin_of(_enterprise uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.enterprises e
       WHERE e.id = _enterprise
         AND e.billing_owner_id = auth.uid()
    );
  $$;

-- squadron_admin = team owner or manager (existing RBAC labels).
CREATE OR REPLACE FUNCTION public.ent_is_squadron_admin(_org uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.team_members tm
       WHERE tm.team_id = (SELECT o.team_id FROM public.organizations o
                            WHERE o.id = _org)
         AND tm.user_id = auth.uid()
         AND tm.team_role IN ('owner', 'manager')
    );
  $$;

CREATE OR REPLACE FUNCTION public.ent_is_org_member(_org uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.team_members tm
       WHERE tm.team_id = (SELECT o.team_id FROM public.organizations o
                            WHERE o.id = _org)
         AND tm.user_id = auth.uid()
    );
  $$;

-- Management gate — the RLS shorthand used everywhere below.
CREATE OR REPLACE FUNCTION public.ent_can_manage(_org uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT public.ent_is_district_admin(_org)
        OR public.ent_is_squadron_admin(_org)
        OR public.ent_is_site_admin();
  $$;

-- Is the caller an org member whose effective lockdown set includes
-- this policy? Policy resolution: org row overrides enterprise default.
CREATE OR REPLACE FUNCTION public.ent_policy_active(_org uuid, _key text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT COALESCE(
      (SELECT p.enabled FROM public.enterprise_policies p
        WHERE p.org_id = _org AND p.policy_key = _key),
      (SELECT p.enabled
         FROM public.enterprise_policies p
         JOIN public.organizations o ON o.enterprise_id = p.enterprise_id
        WHERE o.id = _org AND p.org_id IS NULL AND p.policy_key = _key),
      false);
  $$;

-- Firmwares compare as numeric dotted versions; equal-or-higher passes.
CREATE OR REPLACE FUNCTION public.ent_firmware_ok(_org uuid, _firmware text)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_floor text;
  BEGIN
    IF _firmware IS NULL THEN
      RETURN false; -- policy requires a version; none given fails closed
    END IF;

    SELECT p.min_firmware_version INTO v_floor
      FROM public.enterprise_policies p
      JOIN public.organizations o ON o.enterprise_id = p.enterprise_id
     WHERE o.id = _org AND p.policy_key = 'enforce_firmware_version'
       AND p.enabled
       AND (p.org_id = _org OR p.org_id IS NULL)
     ORDER BY p.org_id NULLS LAST   -- org override wins
     LIMIT 1;

    IF v_floor IS NULL THEN
      RETURN true; -- no active floor
    END IF;

    RETURN string_to_array(_firmware, '.')::numeric[]
        >= string_to_array(v_floor, '.')::numeric[];
  END;
  $$;

-- ============================================================
-- End of migration (view + RLS policies continue in 20260927100120)
-- ============================================================
