/*
  # Squad Portal Dedicated Logs & Gear with Sync

  1. New Tables
    - `team_gear`: Equipment belonging specifically to a squad space.
    - `team_sessions`: Flight sessions logged directly within a squad.
  2. Sync Triggers
    - Automatic trigger when a team session is logged so it also records to the pilot's personal sessions table.
  3. Security
    - RLS policies ensuring only squad members can view and manage squad gear and sessions.
*/

-- 1. Team Gear Table
CREATE TABLE IF NOT EXISTS team_gear (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  gear_type text NOT NULL DEFAULT 'quad',
  brand text,
  total_minutes integer DEFAULT 0,
  cells integer DEFAULT 0,
  connector_type text,
  pack_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_gear ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view squad gear"
  ON team_gear FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id, auth.uid()));

CREATE POLICY "Team members can insert squad gear"
  ON team_gear FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_member(team_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Owners can update squad gear"
  ON team_gear FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_owner(team_id, auth.uid()));

CREATE POLICY "Owners can delete squad gear"
  ON team_gear FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_owner(team_id, auth.uid()));

-- 2. Team Sessions Table
CREATE TABLE IF NOT EXISTS team_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type text NOT NULL DEFAULT 'real',
  flown_on date NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes integer NOT NULL,
  sim_platform text,
  packs_flown integer DEFAULT 0,
  crashes integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view squad sessions"
  ON team_sessions FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id, auth.uid()));

CREATE POLICY "Team members can insert squad sessions"
  ON team_sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_member(team_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Users can delete own squad sessions"
  ON team_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Function and Trigger to Sync Team Sessions to Personal Sessions
CREATE OR REPLACE FUNCTION sync_team_session_to_personal()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO sessions (
    user_id,
    session_type,
    flown_on,
    duration_minutes,
    sim_platform,
    packs_flown,
    crashes,
    notes
  ) VALUES (
    NEW.user_id,
    NEW.session_type,
    NEW.flown_on,
    NEW.duration_minutes,
    NEW.sim_platform,
    NEW.packs_flown,
    NEW.crashes,
    COALESCE(NEW.notes, '') || ' [Logged in Squad]'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_team_session ON team_sessions;
CREATE TRIGGER trigger_sync_team_session
  AFTER INSERT ON team_sessions
  FOR EACH ROW
  EXECUTE FUNCTION sync_team_session_to_personal();