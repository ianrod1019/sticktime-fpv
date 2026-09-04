/*
    # Fix Infinite Recursion in public.profiles RLS Policies

    1. Overview
      - Fixes the infinite recursion bug caused by querying `public.profiles` inside RLS policies on `public.profiles`.
      - Introduces a secure `is_admin_or_dev()` helper function marked as `SECURITY DEFINER` to check user roles safely without triggering recursion.
      - **SELECT**: Users can view their own profile (`auth.uid() = id`) OR admins/devs can view all.
      - **UPDATE**: Only admins/devs can update profiles. Regular users cannot update.
      - **INSERT**: Allowed for own user ID during registration.
      - **DELETE**: Restricted to admins/devs.
  */

  -- 1. Create a secure helper function to check admin/dev status without RLS recursion
  CREATE OR REPLACE FUNCTION public.is_admin_or_dev(_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _user_id AND role IN ('admin', 'dev')
    );
  $$;

  -- 2. Ensure RLS is enabled
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  -- 3. Drop all existing conflicting policies
  DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles delete policy" ON public.profiles;
  DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update their own profile safe fields" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

  -- 4. SELECT Policy: Users can view their own profile or admins/devs can view all
  CREATE POLICY "Profiles select policy"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
      auth.uid() = id
      OR
      public.is_admin_or_dev(auth.uid())
    );

  -- 5. UPDATE Policy: Only admins/devs can update profiles
  CREATE POLICY "Profiles update policy"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (public.is_admin_or_dev(auth.uid()))
    WITH CHECK (public.is_admin_or_dev(auth.uid()));

  -- 6. INSERT Policy: Users can insert their own profile
  CREATE POLICY "Profiles insert policy"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

  -- 7. DELETE Policy: Only admins/devs can delete profiles
  CREATE POLICY "Profiles delete policy"
    ON public.profiles
    FOR DELETE
    TO authenticated
    USING (public.is_admin_or_dev(auth.uid()));
