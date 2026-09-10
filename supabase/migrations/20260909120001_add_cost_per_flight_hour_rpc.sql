-- Cost-per-Flight-Hour Ledger RPC function
CREATE OR REPLACE FUNCTION public.get_cost_per_flight_hour_ledger(p_user_id uuid)
RETURNS TABLE (
  gear_id uuid,
  gear_name text,
  gear_type text,
  purchase_cost numeric,
  repair_cost numeric,
  total_cost numeric,
  flight_minutes bigint,
  flight_count bigint,
  last_flight timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  RETURN QUERY
  WITH gear_data AS (
    SELECT
      g.id AS gear_id,
      g.name AS gear_name,
      g.gear_type,
      COALESCE(g.purchase_cost, 0) AS purchase_cost
    FROM public.gear g
    WHERE g.user_id = p_user_id
  ),
  repair_costs AS (
    SELECT
      ml.gear_id,
      COALESCE(SUM(ml.cost), 0) AS repair_cost
    FROM public.maintenance_logs ml
    JOIN public.gear g ON g.id = ml.gear_id
    WHERE g.user_id = p_user_id
    GROUP BY ml.gear_id
  ),
  flight_data AS (
    SELECT
      s.gear_id,
      COALESCE(SUM(s.duration_minutes), 0) AS flight_minutes,
      COUNT(*) AS flight_count,
      MAX(s.flown_on)::timestamptz AS last_flight
    FROM public.sessions s
    JOIN public.gear g ON g.id = s.gear_id
    WHERE s.user_id = p_user_id
      AND s.session_type = 'real'
      AND s.gear_id IS NOT NULL
    GROUP BY s.gear_id
  )
  SELECT
    gd.gear_id,
    gd.gear_name,
    gd.gear_type,
    gd.purchase_cost,
    COALESCE(rc.repair_cost, 0) AS repair_cost,
    (gd.purchase_cost + COALESCE(rc.repair_cost, 0)) AS total_cost,
    COALESCE(fd.flight_minutes, 0) AS flight_minutes,
    COALESCE(fd.flight_count, 0) AS flight_count,
    fd.last_flight
  FROM gear_data gd
  LEFT JOIN repair_costs rc ON rc.gear_id = gd.gear_id
  LEFT JOIN flight_data fd ON fd.gear_id = gd.gear_id
  ORDER BY gd.gear_type, gd.gear_name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_cost_per_flight_hour_ledger(uuid) TO authenticated;