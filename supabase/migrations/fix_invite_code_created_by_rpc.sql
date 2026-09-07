/*
      # Fix created_by NOT NULL constraint in invite code generation RPC

      1. Changes
        - Updates `create_team_invite_code(_team_id uuid)` to explicitly include `auth.uid()` as the `created_by` value when inserting into `team_invite_codes`.
        - Prevents `null value in column "created_by" of relation "team_invite_codes" violates not-null constraint`.
    */

    CREATE OR REPLACE FUNCTION create_team_invite_code(_team_id uuid)
    RETURNS text
    SECURITY DEFINER
    AS $$
    DECLARE
      _new_code text;
      _user_role text;
      _current_user_id uuid;
    BEGIN
      _current_user_id := auth.uid();

      -- Check if user is owner or manager of the team
      SELECT team_role INTO _user_role
      FROM team_members
      WHERE team_id = _team_id AND user_id = _current_user_id;

      IF _user_role IS NULL OR _user_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Access denied: Only squadron owners and managers can generate or regenerate invite codes.';
      END IF;

      -- Generate guaranteed unique code without collisions
      LOOP
        _new_code := generate_random_invite_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM team_invite_codes WHERE code = _new_code);
      END LOOP;

      -- Insert new invite code with explicit created_by (expires in 30 days)
      INSERT INTO team_invite_codes (team_id, code, created_by, expires_at)
      VALUES (_team_id, _new_code, _current_user_id, now() + interval '30 days');

      RETURN _new_code;
    END;
    $$ LANGUAGE plpgsql;