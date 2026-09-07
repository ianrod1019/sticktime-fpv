/*
  # Create admin_audit_logs table and security functions

  1. New Tables
    - `admin_audit_logs`
      - `id` (uuid, primary key)
      - `actor_id` (uuid, references auth.users)
      - `action` (text, e.g. 'update_user_role', 'suspend_user', 'broadcast_notification')
      - `target_id` (text, optional target user or resource ID)
      - `payload` (jsonb, old and new values or details)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `admin_audit_logs`
    - Add policy for admins/devs to read audit logs
    - Add policy for admins/devs to insert audit logs
*/

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_id text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON public.admin_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs(action);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read admin audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dev')
    )
  );

CREATE POLICY "Admins can insert admin audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dev')
    )
  );
