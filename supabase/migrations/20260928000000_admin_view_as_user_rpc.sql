/*
  # Admin "View As" — audited, read-only account inspection for QA

  Lets an admin/dev look up another pilot's account state (profile, gear
  counts, flight totals) for support/testing purposes, without writing to
  their data, picking up their session, or bypassing RLS for anything but
  this one read. The audit row is written from inside the function itself
  (not by the client), so the trail can't be skipped or spoofed.

  This intentionally does NOT let the caller act as the target user — no
  writes, no auth token, no session swap. It is a snapshot, not a login.
*/

CREATE OR REPLACE FUNCTION public.admin_view_as_user(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, personal_gear
AS $$
DECLARE
  current_user_role text;
  result jsonb;
BEGIN
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE profiles.id = auth.uid();

  IF current_user_role IS NULL OR (LOWER(current_user_role) NOT IN ('admin', 'dev')) THEN
    RAISE EXCEPTION 'Access denied. Administrator or Developer privileges are required to view another account.';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_id, payload)
  VALUES (
    auth.uid(),
    'view_as_user',
    p_target_id::text,
    jsonb_build_object('viewed_at', now())
  );

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'id', p.id,
        'email', u.email,
        'display_name', COALESCE(p.display_name, p.callsign, split_part(u.email::text, '@', 1)),
        'role', p.role,
        'tier', p.tier,
        'created_at', p.created_at,
        'is_banned', COALESCE(p.is_banned, false)
      )
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.id = p_target_id
    ),
    'gear_counts', jsonb_build_object(
      'drones', (SELECT count(*) FROM personal_gear.drones WHERE user_id = p_target_id),
      'batteries', (SELECT count(*) FROM personal_gear.batteries WHERE user_id = p_target_id),
      'transmitters', (SELECT count(*) FROM personal_gear.transmitters WHERE user_id = p_target_id),
      'goggles', (SELECT count(*) FROM personal_gear.goggles WHERE user_id = p_target_id),
      'other_gear', (SELECT count(*) FROM personal_gear.other_gear WHERE user_id = p_target_id)
    ),
    'flight_stats', jsonb_build_object(
      'total_sessions', (SELECT count(*) FROM public.sessions WHERE user_id = p_target_id),
      'total_minutes', (SELECT COALESCE(sum(duration_minutes), 0) FROM public.sessions WHERE user_id = p_target_id),
      'last_flown_on', (SELECT max(flown_on) FROM public.sessions WHERE user_id = p_target_id)
    )
  ) INTO result;

  IF result IS NULL OR result->'profile' = 'null'::jsonb THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  RETURN result;
END;
$$;

-- New functions get EXECUTE granted to PUBLIC by default, which includes
-- the anon role — revoke that before granting narrowly to authenticated.
-- (The role check inside the function already blocks anon since auth.uid()
-- is null for unauthenticated callers, but this closes the door at the
-- grant level too, matching the rest of this codebase's admin RPCs.)
REVOKE EXECUTE ON FUNCTION public.admin_view_as_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_view_as_user(uuid) TO authenticated;
