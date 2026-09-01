/*
      # Update pilot_settings table schema
      
      1. Changes
        - Create or ensure `pilot_settings` table exists without accent_color column
        - Columns: id, user_id, weekly_goal_hours, is_private, callsign, bio, subscription_tier, created_at, updated_at
        - Enable RLS and policies for user management
    */

    CREATE TABLE IF NOT EXISTS pilot_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
      weekly_goal_hours numeric DEFAULT 5,
      is_private boolean DEFAULT false,
      callsign text DEFAULT '',
      bio text DEFAULT '',
      subscription_tier text DEFAULT 'free',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    ALTER TABLE pilot_settings ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pilot_settings' AND policyName = 'Users can manage their own pilot settings'
      ) THEN
        CREATE POLICY "Users can manage their own pilot settings"
          ON pilot_settings
          FOR ALL
          TO authenticated
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);
      END IF;
    END $$;
