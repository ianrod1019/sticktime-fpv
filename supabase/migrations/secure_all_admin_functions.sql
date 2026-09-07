CREATE OR REPLACE FUNCTION admin_get_user_emails()
    RETURNS TABLE (
      id uuid,
      email text
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
      SELECT u.id, u.email::text
      FROM auth.users u;
    END;
    $$ LANGUAGE plpgsql;

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
        COALESCE(p.display_name, p.callsign, split_part(u.email::text, '@', 1))::text AS display_name,
        COALESCE(p.callsign, '')::text AS callsign,
        p.subscription_tier::text,
        COALESCE(r.role::text, p.role::text, 'free_user') AS role,
        p.created_at
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN public.user_roles r ON r.user_id = p.id;
    END;
    $$ LANGUAGE plpgsql;