-- ============================================================
-- Migration: Enterprise RLS — org_members view, policies, grants
--
-- Every table from 20260927100000 gets RLS with explicit USING +
-- WITH CHECK. The security mandate: only district_admin /
-- squadron_admin modify organizational settings, policies, and
-- meetups; pilots RSVP; nobody writes from anon.
--
-- Role labels resolve from ONE source of truth (the existing
-- team_members + teams.owner_id) via the helpers in 20260927100100.
-- (ent_effective_role, ent_can_manage, ent_policy_active) and the
-- org_members VIEW:
--
--   district_admin  = enterprises.billing_owner_id
--   squadron_admin  = team_members.team_role IN ('owner','manager')
--   pilot           = every other org team member
-- ============================================================


-- ---------------------------------------------------------------------------
-- 2. org_members — the district/squadron/pilot VIEW
--    The requested enterprise role contract, resolved from existing RBAC.
--    (Views execute with their owner's rights for RLS on base tables;
--    every referenced base table is already RLS-scoped, and consumers of
--    this view are the SECURITY DEFINER RPCs, not direct client selects.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.org_members AS
SELECT
  o.id            AS organization_id,
  o.enterprise_id,
  o.name          AS organization_name,
  o.team_id,
  o.is_school,
  tm.user_id,
  tm.team_role    AS source_role,
  CASE
    WHEN tm.team_role IN ('owner', 'manager') THEN 'squadron_admin'
    ELSE 'pilot'
  END             AS role,
  false           AS is_district_admin
FROM public.team_members tm
JOIN public.organizations o ON o.team_id = tm.team_id

UNION ALL

-- The district admin over each org (billing owner row per org).
SELECT
  o.id, o.enterprise_id, o.name, o.team_id, o.is_school,
  e.billing_owner_id,
  'billing_owner',
  'district_admin',
  true
FROM public.organizations o
JOIN public.enterprises e ON e.id = o.enterprise_id;

-- ---------------------------------------------------------------------------
-- 3. RLS policies
-- ---------------------------------------------------------------------------

-- enterprise_plans: read-only reference data (grants below).
DROP POLICY IF EXISTS "Plans readable by authenticated" ON public.enterprise_plans;
CREATE POLICY "Plans readable by authenticated"
  ON public.enterprise_plans FOR SELECT
  TO authenticated
  USING (true);

-- enterprises: district admin sees theirs; staff sees all.
DROP POLICY IF EXISTS "Enterprises visible to billing owner" ON public.enterprises;
CREATE POLICY "Enterprises visible to billing owner"
  ON public.enterprises FOR SELECT
  TO authenticated
  USING (
    public.ent_is_district_admin_of(id)
    OR public.ent_is_site_admin()
    -- Sub-squadron admins + pilots see the district shell (name/plan)
    -- so org surfaces can breadcrumb it, but nothing more.
    OR EXISTS (
      SELECT 1 FROM public.organizations o
       WHERE o.enterprise_id = enterprises.id
         AND public.ent_is_org_member(o.id)
    )
  );

DROP POLICY IF EXISTS "Enterprise managed by its billing owner" ON public.enterprises;
CREATE POLICY "Enterprise managed by its billing owner"
  ON public.enterprises FOR UPDATE
  TO authenticated
  USING (public.ent_is_district_admin_of(id))
  WITH CHECK (public.ent_is_district_admin_of(id));

DROP POLICY IF EXISTS "Enterprise deletable by billing owner" ON public.enterprises;
CREATE POLICY "Enterprise deletable by billing owner"
  ON public.enterprises FOR DELETE
  TO authenticated
  USING (public.ent_is_district_admin_of(id));

-- organizations: read = members; write = district admin (+ staff).
DROP POLICY IF EXISTS "Orgs visible to members and district admins" ON public.organizations;
CREATE POLICY "Orgs visible to members and district admins"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    public.ent_is_org_member(id)
    OR public.ent_is_district_admin(id)
    OR public.ent_is_site_admin()
  );

DROP POLICY IF EXISTS "Orgs managed by district admins" ON public.organizations;
CREATE POLICY "Orgs managed by district admins"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.ent_is_district_admin(id) OR public.ent_is_site_admin())
  WITH CHECK (public.ent_is_district_admin(id) OR public.ent_is_site_admin());

-- Org rows are created/removed via RPC (link_org_team / unlink) — no
-- INSERT/DELETE policy for authenticated: direct client inserts fail.
-- (COMMENT documents the intentional absence.)

-- enterprise_policies: read = org members (so UIs can show what locks
-- them); write = district admin / squadron admin (+ staff).
DROP POLICY IF EXISTS "Policies visible to org members" ON public.enterprise_policies;
CREATE POLICY "Policies visible to org members"
  ON public.enterprise_policies FOR SELECT
  TO authenticated
  USING (
    org_id IS NULL
      AND public.ent_is_district_admin_of(enterprise_id)
    OR org_id IS NOT NULL
       AND (
         public.ent_is_org_member(org_id)
         OR public.ent_is_district_admin(org_id)
         OR public.ent_is_site_admin()
       )
  );

DROP POLICY IF EXISTS "Policies managed by org admins" ON public.enterprise_policies;
CREATE POLICY "Policies managed by org admins"
  ON public.enterprise_policies FOR ALL
  TO authenticated
  USING (
    org_id IS NOT NULL
      AND (
        public.ent_is_district_admin(org_id)
        OR public.ent_is_squadron_admin(org_id)
        OR public.ent_is_site_admin()
      )
  )
  WITH CHECK (
    org_id IS NOT NULL
      AND (
        public.ent_is_district_admin(org_id)
        OR public.ent_is_squadron_admin(org_id)
        OR public.ent_is_site_admin()
      )
  );

-- squadron_meetups: read = org members; write = admins only.
DROP POLICY IF EXISTS "Meetups visible to org members" ON public.squadron_meetups;
CREATE POLICY "Meetups visible to org members"
  ON public.squadron_meetups FOR SELECT
  TO authenticated
  USING (
    public.ent_is_org_member(organization_id)
    OR public.ent_is_district_admin(organization_id)
    OR public.ent_is_site_admin()
  );

DROP POLICY IF EXISTS "Meetups managed by org admins" ON public.squadron_meetups;
CREATE POLICY "Meetups managed by org admins"
  ON public.squadron_meetups FOR ALL
  TO authenticated
  USING (
    public.ent_is_district_admin(organization_id)
    OR public.ent_is_squadron_admin(organization_id)
    OR public.ent_is_site_admin()
  )
  WITH CHECK (
    public.ent_is_district_admin(organization_id)
    OR public.ent_is_squadron_admin(organization_id)
    OR public.ent_is_site_admin()
  );

-- meetup_rsvps: members manage their OWN rsvp only.
DROP POLICY IF EXISTS "RSVPs visible to org members" ON public.meetup_rsvps;
CREATE POLICY "RSVPs visible to org members"
  ON public.meetup_rsvps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.squadron_meetups m
       WHERE m.id = meetup_rsvps.meetup_id
         AND public.ent_is_org_member(m.organization_id)
    )
  );

DROP POLICY IF EXISTS "RSVPs are own-only" ON public.meetup_rsvps;
CREATE POLICY "RSVPs are own-only"
  ON public.meetup_rsvps FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- The rsvp must be for a meetup in an org the caller belongs to.
    AND EXISTS (
      SELECT 1 FROM public.squadron_meetups m
       WHERE m.id = meetup_rsvps.meetup_id
         AND public.ent_is_org_member(m.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. DML grants — RLS is the boundary, grants keep the surface narrow
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.enterprises, public.organizations,
             public.enterprise_policies, public.squadron_meetups,
             public.meetup_rsvps
  FROM anon, public;

GRANT SELECT ON public.enterprises, public.organizations,
                public.enterprise_policies, public.squadron_meetups,
                public.meetup_rsvps
  TO authenticated;

GRANT UPDATE, DELETE ON public.enterprises TO authenticated;
GRANT UPDATE ON public.organizations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.enterprise_policies TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.squadron_meetups TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.meetup_rsvps TO authenticated;

-- org_members view: exposed for RPC-internal use; revoke direct client
-- access (RPCs already own the read paths).
REVOKE ALL ON public.org_members FROM anon, public, authenticated;

-- ============================================================
-- End of migration
-- ============================================================
