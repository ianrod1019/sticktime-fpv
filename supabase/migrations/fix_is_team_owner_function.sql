/*
  # Fix is_team_owner Function

  1. New Functions
    - `public.is_team_owner(_team_id uuid, _user_id uuid)`: Checks if a user is the owner of a given team.
  2. Security
    - SECURITY DEFINER function to support RLS policies safely.
*/

CREATE OR REPLACE FUNCTION public.is_team_owner(_team_id uuid, _user_id uuid)
RETURNS boolean
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM teams
    WHERE id = _team_id AND owner_id = _user_id
  );
END;
$$ LANGUAGE plpgsql;