/*
      # Add Roles and Admin Security Policies

      1. Updates
        - Ensure `public.profiles` or `public.pilot_settings` has a `role` column (`text` with default `'pilot'`, e.g., `'admin'`, `'dev'`, `'pilot'`).
        - Add RLS policies for admin access across tables.
    */

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pilot_settings' AND column_name = 'role'
      ) THEN
        ALTER TABLE pilot_settings ADD COLUMN role text DEFAULT 'pilot';
      END IF;
    END $$;

    -- Enable RLS on pilot_settings if not already enabled
    ALTER TABLE pilot_settings ENABLE ROW LEVEL SECURITY;

    -- Policy: Users can read their own settings, or admins/devs can read all settings
    DROP POLICY IF EXISTS "Pilot settings read policy" ON pilot_settings;
    CREATE POLICY "Pilot settings read policy"
      ON pilot_settings
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = user_id OR
        EXISTS (
          SELECT 1 FROM pilot_settings AS ps
          WHERE ps.user_id = auth.uid() AND ps.role IN ('admin', 'dev')
        )
      );

    -- Policy: Users can update their own settings, admins can update any
    DROP POLICY IF EXISTS "Pilot settings update policy" ON pilot_settings;
    CREATE POLICY "Pilot settings update policy"
      ON pilot_settings
      FOR UPDATE
      TO authenticated
      USING (
        auth.uid() = user_id OR
        EXISTS (
          SELECT 1 FROM pilot_settings AS ps
          WHERE ps.user_id = auth.uid() AND ps.role IN ('admin', 'dev')
        )
      );

    -- Policy: Users can insert their own settings
    DROP POLICY IF EXISTS "Pilot settings insert policy" ON pilot_settings;
    CREATE POLICY "Pilot settings insert policy"
      ON pilot_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
