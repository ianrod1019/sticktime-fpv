/*
      # Fix public.profiles RLS Policies for Admin Visibility

      1. Overview
        - Fixes Row Level Security (RLS) policies on `public.profiles` to ensure all profiles are visible to users with admin/dev roles, and users can view their own profile.
        - Uses a secure `SECURITY DEFINER` function `is_admin_or_dev()` to prevent infinite recursion during RLS evaluation.

      2. Security
        - Enables RLS on `public.profiles`.
        - SELECT: Users can view their own profile OR any profile if they are admin/dev.
        - UPDATE: Only admins/devs can update profiles.
        - INSERT: Users can insert their own profile during sign up.
        - DELETE: Only admins/devs can delete profiles.
    */

    -- 1. Create secure helper function to check admin/dev status without recursion
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

    -- 4. SELECT Policy: Users can view their own profile, or admins/devs can view all profiles
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
