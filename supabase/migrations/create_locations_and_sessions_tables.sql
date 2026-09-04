/*
      # Create locations and sessions tables

      1. New Tables
        - `locations`
          - `id` (uuid, primary key)
          - `user_id` (uuid, references auth.users)
          - `name` (text, not null)
          - `address` (text)
          - `notes` (text)
          - `created_at` (timestamptz)
        - `sessions`
          - `id` (uuid, primary key)
          - `user_id` (uuid, references auth.users)
          - `session_type` (session_type enum: 'sim', 'real')
          - `flown_on` (text, date string)
          - `duration_minutes` (integer)
          - `gear_id` (uuid)
          - `controller_id` (uuid)
          - `location_id` (uuid, references locations)
          - `track_id` (uuid)
          - `sim_platform` (text)
          - `packs_flown` (integer)
          - `crashes` (integer)
          - `battery_notes` (text)
          - `weather` (jsonb)
          - `notes` (text)
          - `created_at` (timestamptz)
          - `updated_at` (timestamptz)
      2. Security
        - Enable RLS on `locations` and `sessions` tables
        - Add policies for user CRUD operations
    */

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_type') THEN
        CREATE TYPE session_type AS ENUM ('sim', 'real');
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS locations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      name text NOT NULL,
      address text DEFAULT '',
      notes text DEFAULT '',
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage their own locations" ON locations;
    CREATE POLICY "Users can manage their own locations"
      ON locations
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      session_type session_type DEFAULT 'real'::session_type,
      flown_on text NOT NULL,
      duration_minutes integer DEFAULT 15 NOT NULL,
      gear_id uuid,
      controller_id uuid,
      location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
      track_id uuid,
      sim_platform text,
      packs_flown integer DEFAULT 0,
      crashes integer DEFAULT 0,
      battery_notes text,
      weather jsonb,
      notes text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage their own sessions" ON sessions;
    CREATE POLICY "Users can manage their own sessions"
      ON sessions
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
