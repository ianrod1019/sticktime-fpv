-- ============================================================
-- Migration: Drop the org_gear full-access policy bypass
--
-- SECURITY FIX. Every org_gear table carried a permissive FOR ALL
-- policy with USING (true) granted to authenticated, e.g.
-- authenticated_full_access_drones. Permissive policies OR together,
-- so these wildcard policies nullified the real RBAC policies
-- (org_member_* / "Squadron gear *"): ANY signed-in user could read,
-- modify and delete ANY squadron's gear regardless of membership.
-- Money columns were the only protected surface (via the money_lock
-- trigger, which fires regardless of policies).
--
-- Dropping the bypass restores exactly the intended policies:
--   org_member_select/insert/update/delete (is_team_member) on the
--   typed-asset tables, and the member-scoped "Squadron gear/checkouts"
--   policies on the shared-gear tables.
-- Caught by supabase/tests/org_role_access.test.sql.
-- ============================================================

DO $$
DECLARE
  r record;
  v_dropped int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'org_gear'
      AND policyname LIKE 'authenticated\_full\_access%'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    v_dropped := v_dropped + 1;
    RAISE NOTICE 'Dropped policy % on %.%', r.policyname, r.schemaname, r.tablename;
  END LOOP;

  IF v_dropped = 0 THEN
    RAISE NOTICE 'No full-access bypass policies found (already clean)';
  END IF;
END $$;
