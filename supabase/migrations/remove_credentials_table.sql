/*
    # Remove Credentials Table and Finalize Supabase Auth

    1. Changes
      - Drop legacy `credentials` or `user_credentials` tables safely if they exist.
      - Rely 100% on Supabase built-in `auth.users` table for secure authentication.
      - Keep public `profiles` table synced via trigger.
    
    2. Security
      - Zero custom password storage. Supabase handles all encryption and hashing automatically.
  */

  DROP TABLE IF EXISTS credentials CASCADE;
  DROP TABLE IF EXISTS user_credentials CASCADE;

  CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text DEFAULT '',
    display_name text DEFAULT '',
    avatar_url text DEFAULT '',
    bio text DEFAULT '',
    callsign text DEFAULT '',
    accent_color text DEFAULT '#0ea5e9',
    weekly_goal_hours integer DEFAULT 5,
    subscription_tier text DEFAULT 'free',
    is_private boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can manage their own profile'
    ) THEN
      CREATE POLICY "Users can manage their own profile"
        ON profiles
        FOR ALL
        TO authenticated
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    END IF;
  END $$;

  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (new.id, new.email, split_part(new.email, '@', 1))
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
