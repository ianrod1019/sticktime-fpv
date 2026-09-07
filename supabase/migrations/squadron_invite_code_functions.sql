/*
      # Squadron Invite Code Functions & Triggers

      1. New Functions
        - `generate_random_invite_code()`: Returns a random 8-character uppercase alphanumeric code.
        - `create_team_invite_code(_team_id uuid)`: Allows team owners/members to generate a new invite code on demand.
        - `auto_generate_team_invite_code()`: Trigger function that automatically creates an initial invite code upon team creation.
      2. Triggers
        - Trigger on `teams` table `AFTER INSERT` to auto-generate an initial team invite code.
      3. Security
        - SECURITY DEFINER functions with team membership/ownership checks.
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

    -- 2. On-demand invite code generator function
    CREATE OR REPLACE FUNCTION create_team_invite_code(_team_id uuid)
    RETURNS text
    SECURITY DEFINER
    AS $$
    DECLARE
      _new_code text;
      _is_owner boolean;
    BEGIN
      -- Check if user is owner or member of the team
      IF NOT public.is_team_member(_team_id, auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: You must be a squadron member to generate invite codes.';
      END IF;

      -- Generate unique code
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

    -- 3. Auto-generate trigger function for new teams
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

    -- Attach trigger to teams table if not exists
    DROP TRIGGER IF EXISTS trigger_auto_team_invite_code ON teams;
    CREATE TRIGGER trigger_auto_team_invite_code
      AFTER INSERT ON teams
      FOR EACH ROW
      EXECUTE FUNCTION auto_generate_team_invite_code_trigger();