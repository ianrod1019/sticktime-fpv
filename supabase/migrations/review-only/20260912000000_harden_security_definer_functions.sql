-- ============================================================================
-- Security hardening — SECURITY DEFINER functions (from Supabase security
-- advisor audit, 2026-09-12)
--
-- REVIEW BEFORE APPLYING. Nothing in this file has been run against the
-- database. Findings addressed:
--   0011 function_search_path_mutable               → 7 functions fixed
--   0028 anon_security_definer_function_executable  → 28 of 35 revoked
--   0029 authenticated_security_definer_executable  → 15 of 43 revoked
--
-- Deliberately NOT revoked (would break the app or is unverifiable without
-- reading policy bodies):
--   - Any RPC the client calls after sign-in (check_is_admin,
--     check_pro_access, get_user_session_totals, get_user_heatmap_data,
--     get_user_monthly_volume, get_user_sessions_with_gear,
--     join_team_with_code, leave_squadron, dissolve_squadron,
--     create_team_invite_code, log_and_force_retoken, admin_get_*).
--   - Policy-helper functions (auth_user_role, is_admin, is_admin_or_dev,
--     is_team_member, is_team_owner, share_team, log_component_failure,
--     log_security_event): these may be referenced inside RLS policies.
--     Revoking EXECUTE from roles that evaluate those policies would break
--     them. Verify policy bodies first, then tighten further if unused.
--   - Trigger helper EXECUTE (set_user_id_on_insert,
--     auto_generate_team_invite_code_trigger): trigger-invoked; left intact
--     to avoid any risk to personal_gear/team INSERT flows.
--   - handle_new_* triggers fire on signup under supabase_auth_admin, so
--     revoking anon/authenticated EXECUTE is safe.
--
-- Also recommended (dashboard setting, not possible via SQL):
--   Auth → Policies → enable leaked-password protection (HaveIBeenPwned).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — Pin search_path (finding 0011)
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.get_root_cause_categories()
  SET search_path = public;
ALTER FUNCTION public.get_failure_categories()
  SET search_path = public;
ALTER FUNCTION public.join_team_with_code(text)
  SET search_path = public;
ALTER FUNCTION public.leave_squadron(uuid)
  SET search_path = public;
ALTER FUNCTION personal_gear.set_user_id_on_insert()
  SET search_path = personal_gear, public;
ALTER FUNCTION personal_gear.update_component_failures_updated_at()
  SET search_path = personal_gear, public;
ALTER FUNCTION personal_gear.update_updated_at_column()
  SET search_path = personal_gear, public;

-- ---------------------------------------------------------------------------
-- Part 2 — Revoke EXECUTE from anon (finding 0028)
-- Functions below are never legitimately called by a signed-out visitor.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION personal_gear.set_user_id_on_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_generate_team_invite_code_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_team_invite_code(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dissolve_squadron(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_component_cost_per_hour_analysis(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_component_failure_heatmap(uuid, text, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_component_failure_summary(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_component_mortality_by_flight_style(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_component_mtbf_by_brand(uuid, text, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cost_per_flight_hour_ledger(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pro_access_details() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_usable_gear(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_active_rigs(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_heatmap_data(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_monthly_volume(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_rig_usage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_session_totals(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_sessions_with_gear(uuid, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_credential_record() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_pilot_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_credential() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_team_with_code(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.leave_squadron(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_component_failure(uuid, uuid, uuid, text, text, text, text, text, numeric, integer, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.share_team(uuid, uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- Part 3 — Revoke EXECUTE from authenticated (finding 0029)
-- Only functions the client never calls and that are neither admin-gated
-- client RPCs nor plausible RLS policy helpers.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_component_cost_per_hour_analysis(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_component_failure_heatmap(uuid, text, timestamptz, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_component_failure_summary(uuid, timestamptz, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_component_mortality_by_flight_style(uuid, timestamptz, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_component_mtbf_by_brand(uuid, text, timestamptz, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cost_per_flight_hour_ledger(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pro_access_details() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_usable_gear(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_active_rigs(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_rig_usage(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_credential_record() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_pilot_settings() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_credential() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings() FROM authenticated;
