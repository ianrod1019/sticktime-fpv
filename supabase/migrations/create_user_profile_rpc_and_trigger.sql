/*
      # Create Supabase RPC and Trigger Function for Pilot Profiles

      1. Overview
        - Ensures `public.profiles` has `role` (default 'user') and `tier` (default 'free').
        - Creates an explicit RPC function `public.create_user_profile(user_id uuid, user_role text, user_tier text)` that can be invoked or used by the database trigger safely.
        - Updates the `public.handle_new_user()` trigger function to automatically create a profile record upon `auth.users` insert.
    */

    -- 1. Ensure table exists with core columns only
    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'user',
      tier text NOT NULL DEFAULT 'free',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    -- 2. Ensure role and tier columns exist
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'user';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tier') THEN
        ALTER TABLE public.profiles ADD COLUMN tier text NOT NULL DEFAULT 'free';
      END IF;
    END $$;

    -- 3. Enable RLS
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- 4. Create explicit RPC function to initialize or create a user profile with role and tier
    CREATE OR REPLACE FUNCTION public.create_user_profile(
      p_user_id uuid,
      p_role text DEFAULT 'user',
      p_tier text DEFAULT 'free'
    )
    RETURNS public.profiles
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_profile public.profiles;
    BEGIN
      INSERT INTO public.profiles (id, role, tier, created_at, updated_at)
      VALUES (
        p_user_id,
        COALESCE(NULLIF(p_role, ''), 'user'),
        COALESCE(NULLIF(p_tier, ''), 'free'),
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE 
      SET 
        updated_at = NOW()
      RETURNING * INTO v_profile;

      RETURN v_profile;
    END;
    $$;

    -- 5. Create robust handle_new_user trigger function leveraging the RPC logic
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      PERFORM public.create_user_profile(
        new.id,
        COALESCE(new.raw_user_meta_data->>'role', 'user'),
        COALESCE(new.raw_user_meta_data->>'tier', 'free')
      );
      RETURN NEW;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
      RETURN NEW;
    END;
    $$;

    -- 6. Bind trigger to auth.users
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
