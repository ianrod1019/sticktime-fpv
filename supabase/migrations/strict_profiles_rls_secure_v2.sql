/*
    # Strict Secure RLS Policies for public.profiles (v2)

    1. Overview
      - Enables Row Level Security (RLS) on `public.profiles`.
      - **SELECT**: Users can view only their own profile (`auth.uid() = id`). Admins and devs can view all profile rows.
      - **UPDATE**: Regular users are **completely blocked** from updating profiles (`USING (false)`). Only admins and devs can perform updates on any profile.
      - **INSERT**: Allowed only during registration (`auth.uid() = id`).
      - **DELETE**: Restricted entirely to admins and devs.
  */

  -- 1. Ensure RLS is enabled
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  -- 2. Drop existing policies to prevent conflicts
  DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles delete policy" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update their own profile safe fields" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

  -- 3. SELECT Policy: Regular users view only their own profile; admins/devs can view all
  CREATE POLICY "Profiles select policy"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
      auth.uid() = id
      OR
      EXISTS (
        SELECT 1 FROM public.profiles AS p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'dev')
      )
    );

  -- 4. UPDATE Policy: Regular users cannot update at all; only admin/dev roles can update any profile
  CREATE POLICY "Profiles update policy"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles AS p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'dev')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles AS p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'dev')
      )
    );

  -- 5. INSERT Policy: Allow insertion only for the matching authenticated user ID (handled by auth trigger)
  CREATE POLICY "Profiles insert policy"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

  -- 6. DELETE Policy: Allow deletion only by admin/dev roles
  CREATE POLICY "Profiles delete policy"
    ON public.profiles
    FOR DELETE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles AS p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'dev')
      )
    );
