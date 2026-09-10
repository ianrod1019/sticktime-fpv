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
  WITH battery_data AS (
    SELECT
      b.id AS gear_id,
      b.name AS gear_name,
      'battery'::text AS gear_type,
      COALESCE(b.purchase_cost, 0) AS purchase_cost
    FROM personal_gear.batteries b
    WHERE b.user_id = p_user_id
  ),
  drone_data AS (
    SELECT
      d.id AS gear_id,
      d.name AS gear_name,
      'quad'::text AS gear_type,
      COALESCE(d.purchase_cost, 0) AS purchase_cost
    FROM personal_gear.drones d
    WHERE d.user_id = p_user_id
  ),
  transmitter_data AS (
    SELECT
      t.id AS gear_id,
      t.name AS gear_name,
      'transmitter'::text AS gear_type,
      COALESCE(t.purchase_cost, 0) AS purchase_cost
    FROM personal_gear.transmitters t
    WHERE t.user_id = p_user_id
  ),
  goggle_data AS (
    SELECT
      g.id AS gear_id,
      g.name AS gear_name,
      'goggles'::text AS gear_type,
      COALESCE(g.purchase_cost, 0) AS purchase_cost
    FROM personal_gear.goggles g
    WHERE g.user_id = p_user_id
  ),
  other_data AS (
    SELECT
      o.id AS gear_id,
      o.name AS gear_name,
      'other'::text AS gear_type,
      COALESCE(o.purchase_cost, 0) AS purchase_cost
    FROM personal_gear.other_gear o
    WHERE o.user_id = p_user_id
  ),
  all_gear AS (
    SELECT * FROM battery_data
    UNION ALL SELECT * FROM drone_data
    UNION ALL SELECT * FROM transmitter_data
    UNION ALL SELECT * FROM goggle_data
    UNION ALL SELECT * FROM other_data
  ),
  repair_costs AS (
    SELECT
      ml.gear_id,
      COALESCE(SUM(ml.cost), 0) AS repair_cost
    FROM personal_gear.maintenance_logs ml
    JOIN all_gear ag ON ag.gear_id = ml.gear_id
    WHERE ml.user_id = p_user_id
    GROUP BY ml.gear_id
  ),
  flight_data AS (
    SELECT
      s.gear_id,
      COALESCE(SUM(s.duration_minutes), 0) AS flight_minutes,
      COUNT(*) AS flight_count,
      MAX(s.flown_on)::timestamptz AS last_flight
    FROM public.sessions s
    JOIN all_gear ag ON ag.gear_id = s.gear_id
    WHERE s.user_id = p_user_id
      AND s.session_type = 'real'
      AND s.gear_id IS NOT NULL
    GROUP BY s.gear_id
  )
  SELECT
    ag.gear_id,
    ag.gear_name,
    ag.gear_type,
    ag.purchase_cost,
    COALESCE(rc.repair_cost, 0) AS repair_cost,
    (ag.purchase_cost + COALESCE(rc.repair_cost, 0)) AS total_cost,
    COALESCE(fd.flight_minutes, 0) AS flight_minutes,
    COALESCE(fd.flight_count, 0) AS flight_count,
    fd.last_flight
  FROM all_gear ag
  LEFT JOIN repair_costs rc ON rc.gear_id = ag.gear_id
  LEFT JOIN flight_data fd ON fd.gear_id = ag.gear_id
  ORDER BY ag.gear_type, ag.gear_name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_cost_per_flight_hour_ledger(uuid) TO authenticated;