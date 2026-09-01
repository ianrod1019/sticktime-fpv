/*
      # Create sessions table

      1. New Tables
        - `sessions`
          - `id` (uuid, primary key)
          - `user_id` (uuid, references auth.users)
          - `session_type` (session_type enum: 'sim', 'real')
          - `flown_on` (text, date string)
          - `duration_minutes` (integer)
          - `gear_id` (uuid, references gear)
          - `controller_id` (uuid, references gear)
          - `location_id` (uuid, references locations)
          - `track_id` (uuid, references tracks)
          - `sim_platform` (text)
          - `packs_flown` (integer)
          - `crashes` (integer)
          - `battery_notes` (text)
          - `weather` (jsonb)
          - `notes` (text)
          - `created_at` (timestamptz)
          - `updated_at` (timestamptz)
      2. Security
        - Enable RLS on `sessions` table
        - Add policies for user CRUD operations
    */

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_type') THEN
        CREATE TYPE session_type AS ENUM ('sim', 'real');
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      session_type session_type DEFAULT 'real'::session_type,
      flown_on text NOT NULL,
      duration_minutes integer DEFAULT 15 NOT NULL,
      gear_id uuid REFERENCES gear(id) ON DELETE SET NULL,
      controller_id uuid REFERENCES gear(id) ON DELETE SET NULL,
      location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
      track_id uuid REFERENCES tracks(id) ON DELETE SET NULL,
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