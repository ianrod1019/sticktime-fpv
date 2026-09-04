/*
      # Comprehensive RLS Policies for public.profiles

      1. Overview
        - Enables Row Level Security (RLS) explicitly on `public.profiles`.
        - **SELECT Policy**: Authenticated users can view their own profile, or any profile if they have an 'admin' or 'dev' role.
        - **UPDATE Policy**: Completely blocks standard users from updating profiles from the client side (restricting updates strictly to 'admin' or 'dev' roles).
        - **INSERT Policy**: Allows profile insertion only for the authenticated user (`auth.uid() = id`) or system triggers.
        - **DELETE Policy**: Restricts deletions entirely for standard authenticated users, allowing only admins or cascade actions from `auth.users`.
    */

    -- 1. Ensure RLS is enabled
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- 2. Drop existing policies to ensure clean state
    DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
    DROP POLICY IF EXISTS "Users cannot update system profile directly" ON public.profiles;
    DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Users can update their own profile safe fields" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles delete policy" ON public.profiles;

    -- 3. SELECT Policy: View own profile OR if requesting user is admin/dev
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

    -- 4. UPDATE Policy: Block standard users entirely; allow updates only by admin/dev roles
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

    -- 5. INSERT Policy: Allow insertion only for the matching user id (used by trigger / sign up)
    CREATE POLICY "Profiles insert policy"
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);

    -- 6. DELETE Policy: Restrict deletions entirely for regular users; allow only admin/dev roles
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
