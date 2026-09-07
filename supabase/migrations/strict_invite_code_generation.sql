/*
      # Restrict Invite Code Generation to Owners/Managers with Duplicate Checks

      1. Updated Functions
        - `create_team_invite_code(_team_id uuid)`:
          - Validates that the executing user is either an 'owner' or 'manager' of the team.
          - Ensures generated 8-character code is strictly checked against existing codes in `team_invite_codes` to avoid duplicates.
      2. Security
        - SECURITY DEFINER function with strict role-based verification.
    */

    CREATE OR REPLACE FUNCTION create_team_invite_code(_team_id uuid)
    RETURNS text
    SECURITY DEFINER
    AS $$
    DECLARE
      _new_code text;
      _user_role text;
    BEGIN
      -- Check if user is owner or manager of the team
      SELECT team_role INTO _user_role
      FROM team_members
      WHERE team_id = _team_id AND user_id = auth.uid();

      IF _user_role IS NULL OR _user_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Access denied: Only squadron owners and managers can generate or regenerate invite codes.';
      END IF;

      -- Generate guaranteed unique code without collisions
      LOOP
        _new_code := generate_random_invite_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM team_invite_codes WHERE code = _new_code);
      END LOOP;

      -- Insert new invite code (expires in 30 days)
      INSERT INTO team_invite_codes (team_id, code, expires_at)
      VALUES (_team_id, _new_code, now() + interval '30 days');

      RETURN _new_code;
    END;
    $$ LANGUAGE plpgsql;