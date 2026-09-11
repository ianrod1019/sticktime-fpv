-- Get user's active rigs (drones flown in last month, excluding retired)
CREATE OR REPLACE FUNCTION public.get_user_active_rigs(p_user_id uuid)
RETURNS TABLE (
  active_rig_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  RETURN QUERY
  WITH recent_flights AS (
    -- Get unique drone_id from sessions in the last month
    SELECT DISTINCT s.drone_id
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.drone_id IS NOT NULL
      AND s.flown_on >= (CURRENT_DATE - INTERVAL '1 month')::text
  ),
  personal_drones AS (
    -- Get drones from personal_gear that are not retired
    SELECT d.id
    FROM personal_gear.drones d
    WHERE d.user_id = p_user_id
      AND (d.retired IS NULL OR d.retired = false)
  )
  SELECT COUNT(*)::bigint AS active_rig_count
  FROM recent_flights rf
  JOIN personal_drones pd ON rf.drone_id = pd.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_user_active_rigs(uuid) TO authenticated;
