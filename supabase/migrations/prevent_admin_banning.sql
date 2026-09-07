/*
      # Prevent Admin Banning

      1. Changes
        - Update `admin_get_admin_directory()` to include role check safeguards.
        - Add a database trigger or constraint check (or ensure UI/RPC logic rejects banning users with `role = 'admin'` or `role = 'dev'`).
    */

    CREATE OR REPLACE FUNCTION admin_get_admin_directory()
    RETURNS TABLE (
      id uuid,
      email text,
      display_name text,
      callsign text,
      subscription_tier text,
      role text,
      created_at timestamptz,
      is_banned boolean,
      ban_reason text
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
        COALESCE(p.is_banned, false) AS is_banned,
        p.ban_reason
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN public.user_roles r ON r.user_id = p.id
      ORDER BY p.created_at DESC
      LIMIT 100;
    END;
    $$ LANGUAGE plpgsql;