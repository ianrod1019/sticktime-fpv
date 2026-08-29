/*
      # Complete FPV Garage, Flights, Maintenance, Spots, and Profiles Schema

      1. New Tables
        - `profiles`
          - `id` (uuid, primary key, references auth.users)
          - `email` (text)
          - `display_name` (text)
          - `avatar_url` (text)
          - `created_at` (timestamptz, default now())
        - `drones`
          - `id` (uuid, primary key)
          - `user_id` (uuid, references auth.users)
          - `name` (text, not null)
          - `frame` (text)
          - `fc` (text)
          - `esc` (text)
          - `motors` (text)
          - `vtx` (text)
          - `receiver` (text)
          - `weight` (numeric)
          - `status` (text, default 'Ready')
          - `image_url` (text)
          - `created_at` (timestamptz, default now())
        - `flights`
          - `id` (uuid, primary key)
          - `user_id` (uuid, references auth.users)
          - `drone_id` (uuid, references drones)
          - `spot_name` (text, not null)
          - `duration_seconds` (integer, default 0)
          - `batteries_flown` (integer, default 1)
          - `max_speed` (numeric)
          - `notes` (text)
          - `rating` (integer, default 5)
          - `date` (timestamptz, default now())
          - `created_at` (timestamptz, default now())
        - `maintenance`
          - `id` (uuid, primary key)
          - `user_id` (uuid, references auth.users)
          - `drone_id` (uuid, references drones)
          - `title` (text, not null)
          - `description` (text)
          - `cost` (numeric, default 0)
          - `status` (text, default 'Pending')
          - `date` (timestamptz, default now())
          - `created_at` (timestamptz, default now())
        - `spots`
          - `id` (uuid, primary key)
          - `user_id` (uuid, references auth.users)
          - `name` (text, not null)
          - `location` (text)
          - `description` (text)
          - `rating` (integer, default 5)
          - `image_url` (text)
          - `created_at` (timestamptz, default now())

      2. Security
        - Enable RLS on all tables
        - Add user management policies
    */

    CREATE TABLE IF NOT EXISTS profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text DEFAULT '',
      display_name text DEFAULT '',
      avatar_url text DEFAULT '',
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can manage their own profile"
      ON profiles
      FOR ALL
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);

    CREATE TABLE IF NOT EXISTS drones (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      name text NOT NULL,
      frame text DEFAULT '',
      fc text DEFAULT '',
      esc text DEFAULT '',
      motors text DEFAULT '',
      vtx text DEFAULT '',
      receiver text DEFAULT '',
      weight numeric DEFAULT 0,
      status text DEFAULT 'Ready',
      image_url text DEFAULT '',
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE drones ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can manage their own drones"
      ON drones
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE TABLE IF NOT EXISTS flights (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      drone_id uuid REFERENCES drones(id) ON DELETE SET NULL,
      spot_name text NOT NULL,
      duration_seconds integer DEFAULT 0,
      batteries_flown integer DEFAULT 1,
      max_speed numeric DEFAULT 0,
      notes text DEFAULT '',
      rating integer DEFAULT 5,
      date timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE flights ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can manage their own flights"
      ON flights
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE TABLE IF NOT EXISTS maintenance (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      drone_id uuid REFERENCES drones(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text DEFAULT '',
      cost numeric DEFAULT 0,
      status text DEFAULT 'Pending',
      date timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can manage their own maintenance"
      ON maintenance
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE TABLE IF NOT EXISTS spots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      name text NOT NULL,
      location text DEFAULT '',
      description text DEFAULT '',
      rating integer DEFAULT 5,
      image_url text DEFAULT '',
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE spots ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can manage their own spots"
      ON spots
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    -- Trigger to automatically create profile on signup
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
