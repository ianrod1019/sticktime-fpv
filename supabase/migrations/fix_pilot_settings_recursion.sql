/*
      # Fix Infinite Recursion in Pilot Settings RLS Policies

      1. Overview
        - Eliminates self-referential table queries (`EXISTS (SELECT 1 FROM public.pilot_settings WHERE ...)`) inside RLS policies for `public.pilot_settings`.
        - Replaces admin checking with a secure definer function or direct `auth.uid() = user_id` checks to prevent PostgreSQL error `42P17` (infinite recursion).
    */

    -- 1. Ensure RLS is enabled
    ALTER TABLE public.pilot_settings ENABLE ROW LEVEL SECURITY;

    -- 2. Drop all existing policies on pilot_settings to start clean
    DROP POLICY IF EXISTS "Pilot settings select policy" ON public.pilot_settings;
    DROP POLICY IF EXISTS "Pilot settings insert policy" ON public.pilot_settings;
    DROP POLICY IF EXISTS "Pilot settings update policy" ON public.pilot_settings;
    DROP POLICY IF EXISTS "Pilot settings delete policy" ON public.pilot_settings;
    DROP POLICY IF EXISTS "Users can manage their own pilot settings" ON public.pilot_settings;

    -- 3. Create non-recursive security definer function to check admin status if needed
    CREATE OR REPLACE FUNCTION public.is_admin_or_dev()
    RETURNS boolean
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'dev')
      );
    END;
    $$ LANGUAGE plpgsql;

    -- 4. Create clean, non-recursive RLS policies for pilot_settings
    CREATE POLICY "pilot_settings_select"
      ON public.pilot_settings
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id OR public.is_admin_or_dev() OR is_private = false);

    CREATE POLICY "pilot_settings_insert"
      ON public.pilot_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "pilot_settings_update"
      ON public.pilot_settings
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id OR public.is_admin_or_dev())
      WITH CHECK (auth.uid() = user_id OR public.is_admin_or_dev());

    CREATE POLICY "pilot_settings_delete"
      ON public.pilot_settings
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id OR public.is_admin_or_dev());
