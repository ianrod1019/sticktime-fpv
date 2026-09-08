/*
  Get heatmap data (daily minutes) for a user without fetching all logs.
  Returns up to 12 months of daily flight minutes.
 */
CREATE OR REPLACE FUNCTION public.get_user_heatmap_data(user_id uuid)
RETURNS TABLE (
  date text,
  minutes bigint
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.flown_on::text AS date,
    COALESCE(SUM(s.duration_minutes), 0) AS minutes
  FROM public.sessions s
  WHERE s.user_id = user_id
    AND s.flown_on >= (now() - interval '12 months')::text
  GROUP BY s.flown_on
  ORDER BY date;
END;
$$;