/*
  Get total simulation and real flight time for a user without fetching all logs.
  Returns total minutes for sim and real sessions, plus session count and total packs.
 */
CREATE OR REPLACE FUNCTION public.get_user_session_totals(p_user_id uuid)
RETURNS TABLE (
  total_sim_minutes bigint,
  total_real_minutes bigint,
  total_sessions bigint,
  total_packs bigint
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  total_sim_minutes bigint;
  total_real_minutes bigint;
  total_sessions bigint;
  total_packs bigint;
BEGIN
  SELECT 
    COALESCE(SUM(CASE WHEN session_type = 'sim' THEN duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN session_type = 'real' THEN duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(1), 0),
    COALESCE(SUM(packs_flown), 0)
  INTO total_sim_minutes, total_real_minutes, total_sessions, total_packs
  FROM public.sessions
  WHERE user_id = p_user_id;
  RETURN QUERY SELECT total_sim_minutes, total_real_minutes, total_sessions, total_packs;
END;
$$;