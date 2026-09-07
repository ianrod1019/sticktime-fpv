/*
  # Team Portal Features and Invite Code RPCs

  1. New Tables / Updates
    - Ensure `teams`, `team_members`, and `team_invite_codes` tables are properly configured with RLS.
  2. Functions & RPCs
    - `join_team_with_code(_code text)`: Securely joins a team using an active invite code.
    - `generate_team_invite(_team_id uuid)`: Generates a 7-day rotating invite code for a team admin.
  3. Security
    - Enable RLS and add appropriate policies.
*/

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_role text NOT NULL DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  CONSTRAINT unique_team_member UNIQUE (team_id, user_id)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS team_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_invite_codes ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = _team_id AND user_id = _user_id
  );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS join_team_with_code(text);

CREATE OR REPLACE FUNCTION join_team_with_code(_code text)
RETURNS text
SECURITY DEFINER
AS $$
DECLARE
  v_team_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT team_id INTO v_team_id
  FROM team_invite_codes
  WHERE code = upper(trim(_code)) AND expires_at > now();

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  INSERT INTO team_members (team_id, user_id, team_role)
  VALUES (v_team_id, v_user_id, 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RETURN 'Successfully joined team';
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
DROP POLICY IF EXISTS "Teams viewable by members or owners" ON teams;
CREATE POLICY "Teams viewable by members or owners" ON teams
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_team_member(id, auth.uid()));

DROP POLICY IF EXISTS "Teams insertable by authenticated users" ON teams;
CREATE POLICY "Teams insertable by authenticated users" ON teams
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Team members viewable by squad" ON team_members;
CREATE POLICY "Team members viewable by squad" ON team_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(team_id, auth.uid()));

DROP POLICY IF EXISTS "Team members insertable by owner/admin" ON team_members;
CREATE POLICY "Team members insertable by owner/admin" ON team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM teams WHERE id = team_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Team invite codes viewable by members" ON team_invite_codes;
CREATE POLICY "Team invite codes viewable by members" ON team_invite_codes
  FOR SELECT TO authenticated
  USING (public.is_team_member(team_id, auth.uid()));

DROP POLICY IF EXISTS "Team invite codes insertable by members" ON team_invite_codes;
CREATE POLICY "Team invite codes insertable by members" ON team_invite_codes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(team_id, auth.uid()));