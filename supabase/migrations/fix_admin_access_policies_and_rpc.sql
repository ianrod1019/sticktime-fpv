/*
      # Fix Admin Access Policies and Helper RPC

      1. Overview
        - Drops existing functions first to avoid parameter signature conflicts (`42P13`).
        - Fixes RLS recursion on `public.profiles` by utilizing a robust SECURITY DEFINER helper function `public.is_admin_or_dev(p_user_id uuid)` to evaluate admin status cleanly.
        - Ensures admins and devs can read and update all rows in `public.profiles`.
        - Adds an explicit RPC function `public.check_is_admin()` so the client can reliably verify admin privileges without hitting RLS blocks.
    */

    -- 0. Drop existing functions to allow clean parameter re-definition
    DROP FUNCTION IF EXISTS public.check_is_admin();
    DROP FUNCTION IF EXISTS public.is_admin_or_dev(uuid);

    -- 1. Create secure helper function to check if a user is admin or dev without triggering RLS recursion
    CREATE OR REPLACE FUNCTION public.is_admin_or_dev(p_user_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_role text;
    BEGIN
      SELECT role INTO v_role
      FROM public.profiles
      WHERE id = p_user_id;

      RETURN LOWER(COALESCE(v_role, '')) IN ('admin', 'dev');
    END;
    $$;

    -- 2. Create convenient RPC check for current authenticated user
    CREATE OR REPLACE FUNCTION public.check_is_admin()
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN public.is_admin_or_dev(auth.uid());
    END;
    $$;

    -- 3. Drop existing RLS policies on profiles to prevent conflicts or recursion
    DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
    DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Enable read access for self and admins" ON public.profiles;
    DROP POLICY IF EXISTS "Enable insert for users and triggers" ON public.profiles;
    DROP POLICY IF EXISTS "Enable update for self and admins" ON public.profiles;

    -- 4. Re-create clean, non-recursive RLS policies
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Enable read access for self and admins"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = id OR public.is_admin_or_dev(auth.uid())
      );

    CREATE POLICY "Enable insert for users and triggers"
      ON public.profiles
      FOR INSERT
      TO authenticated, service_role
      WITH CHECK (true);

    CREATE POLICY "Enable update for self and admins"
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (
        auth.uid() = id OR public.is_admin_or_dev(auth.uid())
      )
      WITH CHECK (
        auth.uid() = id OR public.is_admin_or_dev(auth.uid())
      );
