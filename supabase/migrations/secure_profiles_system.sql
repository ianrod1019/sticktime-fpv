/*
      # Secure Profiles System, Triggers, and RLS

      1. Table Structure & Separation
         - Ensures `public.profiles` has system-locked fields (`id`, `role`, `tier`) and user-editable fields (`username`, `bio`, `avatar_url`, `callsign`, `weekly_goal_hours`, `is_private`).
      
      2. Auto-Creation Trigger
         - Creates a function `public.handle_new_user()` triggered on insert into `auth.users` to automatically insert a row into `public.profiles` with `role = 'user'` (or `'admin'` for the first user if desired, defaulting to `'user'`) and `tier = 'free'`.
      
      3. Role Protection Trigger
         - Creates a function `public.protect_profile_system_fields()` as `SECURITY DEFINER` before update on `public.profiles`.
         - Prevents non-admin users from modifying `role` or `tier`.
      
      4. RLS Policies
         - Enables RLS on `public.profiles`.
         - Allows users to read any profile (or their own based on privacy).
         - Allows users to update ONLY their safe/editable profile fields.
    */

    -- 1. Ensure table columns exist properly
    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'user',
      tier text NOT NULL DEFAULT 'free',
      username text,
      bio text,
      avatar_url text,
      callsign text,
      weekly_goal_hours numeric DEFAULT 5,
      is_private boolean DEFAULT false,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- 2. Auto-Creation Trigger Function for auth.users
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      is_first_user boolean;
    -- Checks if any users exist in profiles to optionally bootstrap first user as admin
    BEGIN
      SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;
      
      INSERT INTO public.profiles (id, role, tier, username, callsign, created_at, updated_at)
      VALUES (
        new.id,
        CASE WHEN is_first_user THEN 'admin' ELSE 'user' END,
        'free',
        split_part(new.email, '@', 1),
        split_part(new.email, '@', 1),
        now(),
        now()
      )
      ON CONFLICT (id) DO NOTHING;
      
      RETURN new;
    END;
    $$ LANGUAGE plpgsql;

    -- Drop trigger if exists and recreate
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

    -- 3. Role & Tier Protection Trigger Function
    CREATE OR REPLACE FUNCTION public.protect_profile_system_fields()
    RETURNS trigger
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      current_user_role text;
    BEGIN
      -- If called by Postgres service role or superuser, bypass check
      IF current_user = 'postgres' OR current_user = 'service_role' THEN
        RETURN NEW;
      END IF;

      -- Check if current authenticated user has admin or dev role in profiles
      SELECT role INTO current_user_role
      FROM public.profiles
      WHERE id = auth.uid();

      -- If the user updating is NOT an admin/dev, force system fields to remain unchanged
      IF current_user_role IS DISTINCT FROM 'admin' AND current_user_role IS DISTINCT FROM 'dev' THEN
        NEW.role := OLD.role;
        NEW.tier := OLD.tier;
      END IF;

      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS enforce_profile_system_fields ON public.profiles;
    CREATE TRIGGER enforce_profile_system_fields
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.protect_profile_system_fields();

    -- 4. RLS Policies for public.profiles
    DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
    CREATE POLICY "Profiles are viewable by everyone"
      ON public.profiles
      FOR SELECT
      TO authenticated, anon
      USING (true);

    DROP POLICY IF EXISTS "Users can update their own profile safe fields" ON public.profiles;
    CREATE POLICY "Users can update their own profile safe fields"
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);

    DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
    CREATE POLICY "Admins can update any profile"
      ON public.profiles
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles AS p
          WHERE p.id = auth.uid() AND p.role IN ('admin', 'dev')
        )
      );
