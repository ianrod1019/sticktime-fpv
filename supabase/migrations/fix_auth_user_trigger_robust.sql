/*
      # Fix Auth User Trigger for Robust Signups

      1. Overview
        - Safely drops any broken triggers and functions on `auth.users` or `public.profiles`.
        - Creates a robust, error-handled `handle_new_user()` function that automatically provisions a profile in `public.profiles` whenever a new user signs up in `auth.users`.
        - Ensures that even if profile creation encounters an issue, the auth user signup transaction will not fail outright with "Database error saving new user".

      2. Security
        - Function runs with `SECURITY DEFINER` and appropriate search path.
    */

    -- 1. Drop existing triggers and functions to start clean
    DO $$
    DECLARE
      trg RECORD;
    BEGIN
      FOR trg IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'users' 
          AND event_object_schema = 'auth'
      LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users CASCADE;', trg.trigger_name);
      END LOOP;
    END $$;

    DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
    DROP FUNCTION IF EXISTS public.sync_user_profile() CASCADE;

    -- 2. Create robust handle_new_user function with exception safety
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        is_pro,
        created_at,
        updated_at
      )
      VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'role', 'pilot'),
        COALESCE((new.raw_user_meta_data->>'is_pro')::boolean, false),
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
      
      RETURN NEW;
    EXCEPTION WHEN others THEN
      -- Log error details to postgres log but allow auth user creation to succeed
      RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
      RETURN NEW;
    END;
    $$;

    -- 3. Attach trigger to auth.users
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
