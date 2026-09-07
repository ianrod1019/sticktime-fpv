/*
      # Fix Created-By Constraint in Team Invite Code Trigger

      1. Bug Fix
        - Fixes `null value in column "created_by" of relation "team_invite_codes" violates not-null constraint` during automatic squad creation.
        - Sets `created_by` to `NEW.owner_id` in the auto-generation trigger.
    */

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

      INSERT INTO team_invite_codes (team_id, code, created_by, expires_at)
      VALUES (NEW.id, _new_code, NEW.owner_id, now() + interval '30 days');

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_auto_team_invite_code ON teams;
    CREATE TRIGGER trigger_auto_team_invite_code
      AFTER INSERT ON teams
      FOR EACH ROW
      EXECUTE FUNCTION auto_generate_team_invite_code_trigger();