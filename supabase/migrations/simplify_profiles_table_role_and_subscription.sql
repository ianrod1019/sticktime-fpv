/*
      # Simplify Public Profiles Table to Role & Subscription Only

      1. Overview
        - Re-creates or alters `public.profiles` so it strictly contains ONLY user identification (`id`), `role`, and `subscription` (or `tier`), dropping legacy/unnecessary metadata columns to keep the schema ultra-clean as requested.
        - Updates the `handle_new_user()` trigger function to only insert `id`, `role`, and `subscription` (defaulting to `user` and `free`).
    */

    -- 1. Create or ensure profiles table has only essential columns
    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'user',
      subscription text NOT NULL DEFAULT 'free',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    -- 2. Drop extraneous columns if they exist from older migrations
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
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tier') THEN
        -- Rename tier to subscription if needed or keep subscription
        -- If tier exists and subscription doesn't, rename it
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription') THEN
          ALTER TABLE public.profiles RENAME COLUMN tier TO subscription;
        ELSE
          ALTER TABLE public.profiles DROP COLUMN tier;
        END IF;
      END IF;
    END $$;

    -- Ensure subscription column exists and defaults to 'free'
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription') THEN
        ALTER TABLE public.profiles ADD COLUMN subscription text NOT NULL DEFAULT 'free';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'user';
      END IF;
    END $$;

    -- 3. Enable RLS
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- 4. Drop existing RLS policies on profiles
    DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
    DROP POLICY IF EXISTS "Profiles delete policy" ON public.profiles;

    -- 5. Recreate strict RLS policies
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

    -- 6. Update handle_new_user trigger function to insert ONLY id, role, and subscription
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
        subscription,
        created_at,
        updated_at
      )
      VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'role', 'user'),
        COALESCE(new.raw_user_meta_data->>'subscription', 'free'),
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
