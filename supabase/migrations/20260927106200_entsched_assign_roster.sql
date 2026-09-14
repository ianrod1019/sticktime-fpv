-- ============================================================
-- Migration: ent_scheduling — assignment + roster
--
-- The per-person week board needs two things this module lacked:
--   * WHO a job belongs to (assigned_to), so rows can be people and a
--     drag can move a job between them;
--   * a roster of assignable people with callsigns, resolved server-side
--     (callsigns are directory PII and must never leave via a table
--     scan). Mirrors edu.get_org_roster (20260914120000 §10c): SECURITY
--     DEFINER, gated on enterprise membership, public wrapper granted
--     to authenticated only.
--
-- assigned_to is optional (null = Unassigned lane) and nullable on
-- purpose: jobs are created before a pilot is picked. ON DELETE SET
-- NULL so deleting an auth user never orphans a job row.
-- ============================================================

ALTER TABLE ent_scheduling.client_jobs
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id)
    ON DELETE SET NULL;

-- Board query shape: org + person + chronological.
CREATE INDEX IF NOT EXISTS idx_client_jobs_org_assigned
  ON ent_scheduling.client_jobs (organization_id, assigned_to, scheduled_start);

-- ------------------------------------------------------------------
-- Roster: members of one org, callsigns only. Access gate mirrors
-- the RLS read policy (org member or site admin) so the board can
-- never be used to enumerate people of an org you can't see.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ent_scheduling.entsched_roster(_org uuid)
RETURNS TABLE (
  user_id  uuid,
  callsign text,
  org_role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $fn$
DECLARE
  v_team uuid;
BEGIN
  IF NOT (public.ent_is_site_admin() OR public.ent_is_org_member(_org)) THEN
    RAISE EXCEPTION 'Access denied: org members only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT o.team_id INTO v_team FROM public.organizations o WHERE o.id = _org;
  IF v_team IS NULL THEN
    RETURN;
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
  WHERE tm.team_id = v_team
  ORDER BY 2, 3;
END;
$fn$;

-- Public wrapper (supabase-js rpc() reaches public) — thin delegation.
CREATE OR REPLACE FUNCTION public.entsched_roster(_org uuid)
RETURNS TABLE (user_id uuid, callsign text, org_role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $$ SELECT * FROM ent_scheduling.entsched_roster(_org) $$;

REVOKE ALL ON FUNCTION ent_scheduling.entsched_roster(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entsched_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entsched_roster(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
