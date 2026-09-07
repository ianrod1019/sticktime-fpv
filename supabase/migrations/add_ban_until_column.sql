/*
  # Add ban_until column to profiles and update RPC

  1. Changes
    - Add `ban_until` timestamptz column to `profiles` table to support temporary bans.
    - Drop existing `admin_get_admin_directory` function to allow return type changes.
    - Recreate `admin_get_admin_directory` RPC to return `ban_until`.
  2. Security
    - Maintain RLS and SECURITY DEFINER execution.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'ban_until'
  ) THEN
    ALTER TABLE profiles ADD COLUMN ban_until timestamptz;
  END IF;
END $$;

DROP FUNCTION IF EXISTS admin_get_admin_directory();

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
  ban_reason text,
  ban_until timestamptz
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
    p.ban_reason,
    p.ban_until
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_roles r ON r.user_id = p.id
  ORDER BY p.created_at DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;