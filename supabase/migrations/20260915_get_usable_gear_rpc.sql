-- Get available gear from personal_gear schema
-- Returns controllers (transmitters), drones, and goggles for the given user
CREATE OR REPLACE FUNCTION public.get_usable_gear(
  p_user_id uuid
)
RETURNS TABLE (
  gear_type text,
  gear_id uuid,
  gear_name text,
  gear_brand text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, personal_gear
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    'controller'::text AS gear_type,
    t.id AS gear_id,
    t.name AS gear_name,
    t.brand AS gear_brand
  FROM personal_gear.transmitters t
  WHERE t.user_id = p_user_id

  UNION ALL

  SELECT
    'drone'::text AS gear_type,
    d.id AS gear_id,
    d.name AS gear_name,
    d.brand AS gear_brand
  FROM personal_gear.drones d
  WHERE d.user_id = p_user_id

  UNION ALL

  SELECT
    'goggles'::text AS gear_type,
    g.id AS gear_id,
    g.name AS gear_name,
    g.brand AS gear_brand
  FROM personal_gear.goggles g
  WHERE g.user_id = p_user_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_usable_gear(uuid) TO authenticated;