/*
  # Enable Realtime and Helpers for Security Logs

  1. Changes
    - Enable Supabase Realtime for the `public.security_logs` table.
    - Create a secure view or function to fetch security logs with user emails for admins.
  2. Security
    - Ensure only admins/devs can access the security logs view/function.
*/

-- Enable Realtime for security_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_logs;

-- Create a secure function to fetch security logs with user emails
CREATE OR REPLACE FUNCTION public.admin_get_security_logs()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  path text,
  action text,
  ip_address text,
  user_agent text,
  created_at timestamptz
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the calling user is an admin or dev
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'dev')
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    l.id,
    l.user_id,
    u.email::text,
    l.path,
    l.action,
    l.ip_address,
    l.user_agent,
    l.created_at
  FROM public.security_logs l
  LEFT JOIN auth.users u ON l.user_id = u.id
  ORDER BY l.created_at DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;
