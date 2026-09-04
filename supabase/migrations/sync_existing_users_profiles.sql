/*
      # Sync Existing Users and Secure Profiles System (Clean)

      1. Overview
        - Safely adds missing core columns (`tier`, `callsign`, `bio`, etc.) to `public.profiles` if the table already existed with a different schema.
        - Backfills missing profiles for ALL existing users in `auth.users` so no user is left without a profile record.
        - Sets up automated trigger on `auth.users` insert to auto-create profiles for future signups.
        - Implements security definer trigger to protect `role` and `tier` changes from unauthorized updates.
        - Enables RLS with comprehensive security policies.

      2. Changes
        - Create/verify `public.profiles` table with standard schema.
        - Add columns via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` if table pre-existed.
        - Backfill missing rows from `auth.users` into `public.profiles`.
        - Create auto-creation and role-protection trigger functions.
        - Enforce Row Level Security (RLS) and policies.
    */

    -- 1. Ensure public.profiles table exists with proper schema
    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'user',
      tier text NOT NULL DEFAULT 'free',
      username text,
      display_name text,
      bio text,
      avatar_url text,
      callsign text,
      weekly_goal_hours numeric DEFAULT 5,
      is_private boolean DEFAULT false,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    -- Ensure all expected columns exist even if the table was created previously without them
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tier') THEN
        ALTER TABLE public.profiles ADD COLUMN tier text NOT NULL DEFAULT 'free';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'user';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'callsign') THEN
        ALTER TABLE public.profiles ADD COLUMN callsign text;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'bio') THEN
        ALTER TABLE public.profiles ADD COLUMN bio text;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url') THEN
        ALTER TABLE public.profiles ADD COLUMN avatar_url text;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'weekly_goal_hours') THEN
        ALTER TABLE public.profiles ADD COLUMN weekly_goal_hours numeric DEFAULT 5;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_private') THEN
        ALTER TABLE public.profiles ADD COLUMN is_private boolean DEFAULT false;
      END IF;
    END $$;

    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- 2. Backfill missing profiles for any existing users in auth.users
    INSERT INTO public.profiles (id, role, tier, username, callsign, created_at, updated_at)
    SELECT 
      u.id,
      CASE 
        WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE role IN ('admin', 'dev')) AND u.id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1) THEN 'admin'
        ELSE 'user'
      END,
      'free',
      split_part(u.email, '@', 1),
      split_part(u.email, '@', 1),
      COALESCE(u.created_at, now()),
      now()
    FROM auth.users u
    ON CONFLICT (id) DO NOTHING;

    -- 3. Auto-Creation Trigger Function for new auth.users
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      is_first_user boolean;
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

    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

    -- 4. Role & Tier Protection Trigger Function
    CREATE OR REPLACE FUNCTION public.protect_profile_system_fields()
    RETURNS trigger
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      current_user_role text;
    BEGIN
      -- Bypass check for postgres superuser or service_role
      IF current_user = 'postgres' OR current_user = 'service_role' THEN
        RETURN NEW;
      END IF;

      -- Get current user's role from profiles
      SELECT role INTO current_user_role
      FROM public.profiles
      WHERE id = auth.uid();

      -- If updater is not admin or dev, lock down role and tier modifications
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

    -- 5. RLS Policies
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
