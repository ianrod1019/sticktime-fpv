/*
      # Squadron Leave & Dissolve Functions

      1. New Functions
        - `dissolve_squadron(_team_id uuid)`: Allows the owner of a team to completely delete the team and its relations.
        - `leave_squadron(_team_id uuid)`: Allows a non-owner team member to leave the squadron.
      2. Security
        - Both functions are SECURITY DEFINER with proper ownership and membership checks.
    */

    CREATE OR REPLACE FUNCTION dissolve_squadron(_team_id uuid)
    RETURNS void
    SECURITY DEFINER
    AS $$
    DECLARE
      _owner_id uuid;
    BEGIN
      -- Check team ownership
      SELECT owner_id INTO _owner_id
      FROM teams
      WHERE id = _team_id;

      IF _owner_id IS NULL THEN
        RAISE EXCEPTION 'Squadron not found.';
      END IF;

      IF _owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Only the squadron owner can dissolve this squadron.';
      END IF;

      -- Delete the team (cascade takes care of team_members, team_gear, team_sessions, etc.)
      DELETE FROM teams WHERE id = _team_id;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION leave_squadron(_team_id uuid)
    RETURNS void
    SECURITY DEFINER
    AS $$
    DECLARE
      _owner_id uuid;
    BEGIN
      -- Check team ownership
      SELECT owner_id INTO _owner_id
      FROM teams
      WHERE id = _team_id;

      IF _owner_id IS NULL THEN
        RAISE EXCEPTION 'Squadron not found.';
      END IF;

      IF _owner_id = auth.uid() THEN
        RAISE EXCEPTION 'Squadron owners cannot leave their own squadron. Dissolve it instead.';
      END IF;

      -- Remove member association
      DELETE FROM team_members
      WHERE team_id = _team_id AND user_id = auth.uid();
    END;
    $$ LANGUAGE plpgsql;