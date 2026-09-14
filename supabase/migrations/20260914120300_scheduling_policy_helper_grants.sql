-- ============================================================
-- Migration: Restore EXECUTE on policy-facing edu helpers.
--
-- Also: edu.schedules.created_by gains `DEFAULT auth.uid()` — the
-- column is NOT NULL with no default, and the client never sends it,
-- so every new booking failed with a not-null violation. Let the
-- database stamp the creator (more trustworthy than a client-sent
-- value, and one less thing the API layer must remember).
--
-- 20260914120000 blanket-revoked every edu helper from
-- authenticated to keep them "internal". But RLS policy
-- expressions on edu.schedules / edu.organization_addons call
-- these helpers AS the calling user, and Postgres requires the
-- caller to hold EXECUTE — so every direct INSERT/UPDATE/DELETE
-- failed with:
--   permission denied for function can_manage_schedule
-- (Reads survived only because they flow through the SECURITY
-- DEFINER RPCs.)
--
-- These four appear verbatim in policy expressions, so
-- authenticated needs EXECUTE on them. Each is a boolean probe
-- of the caller's own relationship to an org (or, for
-- is_org_member_user, one (org, user) pair) — low-sensitivity,
-- and required for the policies to run at all. Trigger-only
-- helpers (enforce_*, validate_schedule_gear, set_scheduling_addon)
-- stay revoked: trigger invocation does not need caller EXECUTE,
-- and set_scheduling_addon is reachable through its own
-- authenticated-granted wrapper.
--
-- Idempotent; safe on fresh db reset and on the live project.
-- ============================================================

ALTER TABLE edu.schedules
  ALTER COLUMN created_by SET DEFAULT auth.uid();

REVOKE ALL ON FUNCTION edu.is_org_member(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION edu.is_org_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION edu.has_scheduling_access(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION edu.has_scheduling_access(uuid) TO authenticated;

REVOKE ALL ON FUNCTION edu.can_manage_schedule(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION edu.can_manage_schedule(uuid) TO authenticated;

REVOKE ALL ON FUNCTION edu.is_org_member_user(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION edu.is_org_member_user(uuid, uuid) TO authenticated;

-- ============================================================
-- End of migration
-- ============================================================
