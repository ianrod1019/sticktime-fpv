/*
  # Create security_logs table for audit logging

  1. New Tables
    - `security_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `path` (text, the attempted path)
      - `action` (text, description of action)
      - `ip_address` (text, client IP if available)
      - `user_agent` (text, client user agent)
      - `created_at` (timestamp with timezone)

  2. Security
    - Enable RLS on `security_logs` table
    - Add policy for admins to read all logs
    - Add policy for system to insert logs (via service role or authenticated users for their own attempts)
*/

CREATE TABLE IF NOT EXISTS public.security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  path text NOT NULL,
  action text NOT NULL DEFAULT 'unauthorized_access_attempt',
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_logs_user_id ON public.security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON public.security_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_path ON public.security_logs(path);

ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all security logs
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

-- System can insert logs (using service role or authenticated users for their own attempts)
-- We allow authenticated users to insert their own failed attempts for audit trail
CREATE POLICY "Users can insert their own security logs"
  ON public.security_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
