/*
      # Update Default User Role and Tier
      
      1. Overview
        - Updates the `handle_new_user()` database trigger function so that newly created users ALWAYS default to:
          - `role` = `'user'` (instead of `'pilot'`)
          - `tier` = `'free'` (and `is_pro` = `false`)
        - Ensures safe fallback handling without blocking signups.
    */

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
        tier,
        is_pro,
        created_at,
        updated_at
      )
      VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'role', 'user'),
        COALESCE(new.raw_user_meta_data->>'tier', 'free'),
        COALESCE((new.raw_user_meta_data->>'is_pro')::boolean, false),
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE 
      SET 
        email = EXCLUDED.email,
        updated_at = NOW();
      
      RETURN NEW;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
      RETURN NEW;
    END;
    $$;
