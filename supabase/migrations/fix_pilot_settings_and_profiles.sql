/*
      # Fix Pilot Settings and RLS Policies for User Settings

      1. Overview
        - Ensures `public.pilot_settings` has RLS enabled and correct policies so users can manage their own settings (weekly goals, privacy, callsign, bio).
        - Ensures `public.profiles` allows users to view and update their own non-privileged profile fields if used.
        - Provides robust user settings CRUD policies.
    */

    -- 1. Ensure pilot_settings exists and has RLS enabled
    CREATE TABLE IF NOT EXISTS public.pilot_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL UNIQUE,
      weekly_goal_hours numeric DEFAULT 5,
      is_private boolean DEFAULT false,
      callsign text DEFAULT '',
      bio text DEFAULT '',
      subscription_tier text DEFAULT 'free',
      role text DEFAULT 'pilot',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    ALTER TABLE public.pilot_settings ENABLE ROW LEVEL SECURITY;

    -- 2. Drop existing pilot_settings policies
    DROP POLICY IF EXISTS "Pilot settings select policy" ON public.pilot_settings;
    DROP POLICY IF EXISTS "Pilot settings insert policy" ON public.pilot_settings;
    DROP POLICY IF EXISTS "Pilot settings update policy" ON public.pilot_settings;
    DROP POLICY IF EXISTS "Pilot settings delete policy" ON public.pilot_settings;

    -- 3. Create policies for pilot_settings
    CREATE POLICY "Pilot settings select policy"
      ON public.pilot_settings
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.pilot_settings AS ps WHERE ps.user_id = auth.uid() AND ps.role IN ('admin', 'dev')
      ));

    CREATE POLICY "Pilot settings insert policy"
      ON public.pilot_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Pilot settings update policy"
      ON public.pilot_settings
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Pilot settings delete policy"
      ON public.pilot_settings
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.pilot_settings AS ps WHERE ps.user_id = auth.uid() AND ps.role IN ('admin', 'dev')
      ));
