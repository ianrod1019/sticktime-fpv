/*
  # Create notifications table for broadcast push notifications

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `title` (text, not null)
      - `message` (text, not null)
      - `target_tier` (text, default 'all') - e.g., 'all', 'free', 'pro', 'enterprise'
      - `target_user_id` (uuid, nullable) - specific user if targeted individually
      - `sender_id` (uuid, references auth.users)
      - `created_at` (timestamptz, default now())
  2. Security
    - Enable RLS on `notifications` table
    - Add policy for admins/devs to insert notifications
    - Add policy for authenticated users to read notifications targeted to them or their tier
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  target_tier text DEFAULT 'all',
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can insert notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin' OR profiles.role = 'dev')
    )
  );

CREATE POLICY "Users can read relevant notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (
    target_tier = 'all'
    OR target_user_id = auth.uid()
    OR target_tier = (SELECT tier FROM profiles WHERE profiles.id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin' OR profiles.role = 'dev')
    )
  );
