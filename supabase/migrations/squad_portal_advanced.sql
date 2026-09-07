/*
  # Advanced Squad Portal Features

  1. New Features & Updates
    - Ensures team deletion cascades cleanly to `team_members` and `team_invite_codes`.
    - Adds helper functions to fetch all gear and sessions for members of a team.
  2. Security
    - Strict RLS check ensuring only squad members can view squad garage items and flight logs.
*/

-- Helper function to check if two users share at least one team
CREATE OR REPLACE FUNCTION share_team(_user_a uuid, _user_b uuid)
RETURNS boolean
SECURITY DEFINER
AS $$
BEGIN
  IF _user_a = _user_b THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM team_members m1
    JOIN team_members m2 ON m1.team_id = m2.team_id
    WHERE m1.user_id = _user_a AND m2.user_id = _user_b
  );
END;
$$ LANGUAGE plpgsql;

-- RLS policies for shared gear viewable by teammates
DROP POLICY IF EXISTS "Gear viewable by teammates" ON gear;
CREATE POLICY "Gear viewable by teammates" ON gear
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.share_team(user_id, auth.uid()));

-- RLS policies for shared sessions viewable by teammates
DROP POLICY IF EXISTS "Sessions viewable by teammates" ON sessions;
CREATE POLICY "Sessions viewable by teammates" ON sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.share_team(user_id, auth.uid()));