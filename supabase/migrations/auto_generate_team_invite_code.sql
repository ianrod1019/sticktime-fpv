/*
      # Auto-Generate Team Invite Code on Creation & Strict Regeneration Function

      1. Triggers
        - Automatically generates a secure, collision-free 8-character invite code when a new team is inserted.
      2. Functions
        - Updated `create_team_invite_code(_team_id uuid)` with strict owner/manager checks and duplicate collision prevention.
    */

    -- 1. Helper function for random invite code
    CREATE OR REPLACE FUNCTION generate_random_invite_code()
    RETURNS text
    LANGUAGE plpgsql
    AS $$
    DECLARE
      chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      result text := '';
      i integer;
    BEGIN
      FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
      END LOOP;
      RETURN result;
    END;
    $$;

    -- 2. Strict owner/manager invite code generator with duplicate prevention
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

    -- 3. Trigger function to auto-generate invite code on team insert
    CREATE OR REPLACE FUNCTION auto_generate_team_invite_code_trigger()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $$
    DECLARE
      _new_code text;
    BEGIN
      LOOP
        _new_code := generate_random_invite_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM team_invite_codes WHERE code = _new_code);
      END LOOP;

      INSERT INTO team_invite_codes (team_id, code, expires_at)
      VALUES (NEW.id, _new_code, now() + interval '30 days');

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Attach trigger to teams table
    DROP TRIGGER IF EXISTS trigger_auto_team_invite_code ON teams;
    CREATE TRIGGER trigger_auto_team_invite_code
      AFTER INSERT ON teams
      FOR EACH ROW
      EXECUTE FUNCTION auto_generate_team_invite_code_trigger();