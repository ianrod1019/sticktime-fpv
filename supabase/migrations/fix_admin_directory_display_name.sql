CREATE OR REPLACE FUNCTION admin_get_admin_directory()
    RETURNS TABLE (
      id uuid,
      email text,
      display_name text,
      callsign text,
      subscription_tier text,
      role text,
      created_at timestamptz
    )
    SECURITY DEFINER
    SET search_path = public, auth
    AS $$
    DECLARE
      current_user_role text;
    BEGIN
      SELECT role INTO current_user_role
      FROM public.profiles
      WHERE profiles.id = auth.uid();

      IF current_user_role IS NULL OR (LOWER(current_user_role) NOT IN ('admin', 'dev')) THEN
        SELECT role INTO current_user_role
        FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        LIMIT 1;
      END IF;

      IF current_user_role IS NULL OR (LOWER(current_user_role) NOT IN ('admin', 'dev')) THEN
        RAISE EXCEPTION 'Access denied. Administrator or Developer privileges are required to execute this function.';
      END IF;

      RETURN QUERY
      SELECT 
        p.id,
        u.email::text,
        COALESCE(
          NULLIF(p.callsign, ''), 
          NULLIF(u.raw_user_meta_data->>'full_name', ''), 
          NULLIF(u.raw_user_meta_data->>'name', ''), 
          split_part(u.email::text, '@', 1)
        )::text AS display_name,
        COALESCE(p.callsign, '')::text AS callsign,
        COALESCE(p.subscription_tier, 'free')::text AS subscription_tier,
        COALESCE(r.role::text, p.role::text, 'free_user') AS role,
        COALESCE(p.created_at, u.created_at) AS created_at
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN public.user_roles r ON r.user_id = p.id;
    END;
    $$ LANGUAGE plpgsql;