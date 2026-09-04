/*
  # Security Retoken System and Schema Cache Fix

  1. New Tables & Functions
    - Ensure `public.security_logs` exists with correct columns.
    - Create `public.log_and_force_retoken` function to log attempts and update user metadata to force a token refresh.
    - Create/update `public.admin_get_security_logs` to fetch logs securely.
  2. Security
    - Enable RLS on `public.security_logs`.
    - Grant permissions to authenticated users and admins.
  3. Schema Cache
    - Reload PostgREST schema cache to resolve missing table errors.
*/

-- 1. Create security_logs table if not exists
CREATE TABLE IF NOT EXISTS public.security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  path text NOT NULL,
  action text NOT NULL DEFAULT 'unauthorized_access_attempt',
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can read all security logs" ON public.security_logs;
DROP POLICY IF EXISTS "Users can insert their own security logs" ON public.security_logs;

-- Create robust policies
CREATE POLICY "Admins can read all security logs"
  ON public.security_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dev')
    )
  );

CREATE POLICY "Users can insert their own security logs"
  ON public.security_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. Create function to log attempt and force a token refresh (retoken)
CREATE OR REPLACE FUNCTION public.log_and_force_retoken(
  attempted_path text,
  attempted_action text,
  client_ip text DEFAULT NULL,
  client_ua text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  caller_id uuid;
  new_log_id uuid;
  current_meta jsonb;
  updated_meta jsonb;
  result jsonb;
BEGIN
  caller_id := auth.uid();
  
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Log the security event
  INSERT INTO public.security_logs (user_id, path, action, ip_address, user_agent)
  VALUES (caller_id, attempted_path, attempted_action, client_ip, client_ua)
  RETURNING id INTO new_log_id;

  -- 2. Fetch current user metadata
  SELECT raw_user_meta_data FROM auth.users WHERE id = caller_id INTO current_meta;
  
  IF current_meta IS NULL THEN
    current_meta := '{}'::jsonb;
  END IF;

  -- 3. Inject a security retoken nonce and timestamp
  updated_meta := current_meta || jsonb_build_object(
    'retoken_nonce', gen_random_uuid(),
    'retoken_required_at', extract(epoch from now())::integer
  );

  -- 4. Update auth.users to force token invalidation/refresh requirement
  UPDATE auth.users
  SET 
    raw_user_meta_data = updated_meta,
    updated_at = now()
  WHERE id = caller_id;

  result := jsonb_build_object(
    'success', true,
    'log_id', new_log_id,
    'retoken_triggered', true
  );

  RETURN result;
END;
$$;

-- 3. Create secure function to fetch security logs with user emails for admins
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

-- 4. Force PostgREST to reload the schema cache immediately
NOTIFY pgrst, 'reload schema';
