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
    BEGIN
      RETURN QUERY
      SELECT 
        p.id,
        u.email::text,
        COALESCE(p.display_name, p.callsign, split_part(u.email::text, '@', 1))::text AS display_name,
        COALESCE(p.callsign, '')::text AS callsign,
        p.subscription_tier::text,
        COALESCE(r.role::text, 'free_user') AS role,
        p.created_at
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN public.user_roles r ON r.user_id = p.id;
    END;
    $$ LANGUAGE plpgsql;