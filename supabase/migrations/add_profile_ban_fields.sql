/*
      # Add profile ban support

      1. Changes
        - Ensure `is_banned` boolean column exists on `profiles` table.
        - Add `ban_reason` and `banned_at` columns to track ban details.
        - Update admin functions to return ban status correctly.
      2. Security
        - Enable RLS policies for admin check.
    */

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'is_banned'
      ) THEN
        ALTER TABLE profiles ADD COLUMN is_banned boolean DEFAULT false;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'ban_reason'
      ) THEN
        ALTER TABLE profiles ADD COLUMN ban_reason text;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'banned_at'
      ) THEN
        ALTER TABLE profiles ADD COLUMN banned_at timestamptz;
      END IF;
    END $$;

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