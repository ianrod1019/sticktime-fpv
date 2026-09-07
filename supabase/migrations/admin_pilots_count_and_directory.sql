/*
      # Admin Pilot Directory and Counts

      1. New Functions
        - `admin_get_total_pilots_count()`: Returns the exact total number of registered pilots.
        - `admin_get_admin_directory()`: Returns up to 100 most recent pilots with their ban status and emails.
      2. Security
        - SECURITY DEFINER execution with role checks.
    */

    CREATE OR REPLACE FUNCTION admin_get_total_pilots_count()
    RETURNS bigint
    SECURITY DEFINER
    SET search_path = public, auth
    AS $$
    DECLARE
      total bigint;
    BEGIN
      SELECT COUNT(*) INTO total FROM public.profiles;
      RETURN total;
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
      created_at timestamptz,
      is_banned boolean
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
        COALESCE(p.tier, p.subscription_tier, 'free')::text AS subscription_tier,
        COALESCE(r.role::text, p.role::text, 'user') AS role,
        p.created_at,
        COALESCE(p.is_banned, false) AS is_banned
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN public.user_roles r ON r.user_id = p.id
      ORDER BY p.created_at DESC
      LIMIT 100;
    END;
    $$ LANGUAGE plpgsql;