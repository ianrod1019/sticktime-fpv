/*
      # Simplify Public Profiles Table to ID, Role, and Tier Only

      1. Overview
        - Re-creates or alters `public.profiles` so it strictly contains ONLY:
          - `id` (uuid, primary key linked to `auth.users`)
          - `role` (text, default `'user'`)
          - `tier` (text, default `'free'`)
          - `created_at` / `updated_at` timestamps
        - Drops all extra columns (`email`, `full_name`, `avatar_url`, `callsign`, `bio`, `is_pro`, `subscription`, etc.).
        - Updates the `handle_new_user()` trigger function to automatically insert a new row into `public.profiles` with `role = 'user'` and `tier = 'free'` whenever a new user signs up.
    */

    -- 1. Ensure table exists with core columns only
    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'user',
      tier text NOT NULL DEFAULT 'free',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    -- 2. Clean up extraneous columns if they exist from past migrations
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email') THEN
        ALTER TABLE public.profiles DROP COLUMN email;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'full_name') THEN
        ALTER TABLE public.profiles DROP COLUMN full_name;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'avatar_url') THEN
        ALTER TABLE public.profiles DROP COLUMN avatar_url;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'callsign') THEN
        ALTER TABLE public.profiles DROP COLUMN callsign;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'bio') THEN
        ALTER TABLE public.profiles DROP COLUMN bio;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_pro') THEN
        ALTER TABLE public.profiles DROP COLUMN is_pro;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tier') THEN
          ALTER TABLE public.profiles RENAME COLUMN subscription TO tier;
        ELSE
          ALTER TABLE public.profiles DROP COLUMN subscription;
        END IF;
      END IF;
    END $$;

    -- 3. Ensure role and tier columns exist
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'user';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tier') THEN
        ALTER TABLE public.profiles ADD COLUMN tier text NOT NULL DEFAULT 'free';
      END IF;
    END $$;

    -- 4. Enable RLS
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- 5. Reset RLS policies for profiles
    DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles delete policy" ON public.profiles;

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

    CREATE POLICY "Profiles insert policy"
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);

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

    -- 6. Create robust handle_new_user trigger function with role='user' and tier='free'
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      INSERT INTO public.profiles (
        id,
        role,
        tier,
        created_at,
        updated_at
      )
      VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'role', 'user'),
        COALESCE(new.raw_user_meta_data->>'tier', 'free'),
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE 
      SET 
        updated_at = NOW();
      
      RETURN NEW;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
      RETURN NEW;
    END;
    $$;

    -- 7. Bind trigger to auth.users if not already bound
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
