/*
  Get monthly volume (sim and real minutes) for a user without fetching all logs.
  Returns monthly breakdown of sim and real minutes in "MM-YYYY" format.
 */
CREATE OR REPLACE FUNCTION public.get_user_monthly_volume(p_user_id uuid)
RETURNS TABLE (
  month text,
  total_sim_minutes bigint,
  total_real_minutes bigint
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    to_char(date_trunc('month', created_at), 'MM-YYYY') AS month,
    COALESCE(SUM(CASE WHEN session_type = 'sim' THEN duration_minutes ELSE 0 END), 0) AS total_sim_minutes,
    COALESCE(SUM(CASE WHEN session_type = 'real' THEN duration_minutes ELSE 0 END), 0) AS total_real_minutes
  FROM public.sessions
  WHERE user_id = p_user_id
    AND created_at >= (now() - interval '12 months')::timestamp
  GROUP BY date_trunc('month', created_at)
  ORDER BY date_trunc('month', created_at);
END;
$$;