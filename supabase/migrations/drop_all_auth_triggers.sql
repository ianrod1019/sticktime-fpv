/*
      # Drop All Auth Triggers and Functions causing "Database error saving new user"

      1. Changes
        - Safely drops any remaining triggers on `auth.users` (`on_auth_user_created`, etc.)
        - Drops helper functions like `handle_new_user()` or custom sync triggers that throw database errors during `auth.signUp()`.
        - Ensures pure Supabase Auth operation without any failing custom triggers.
    */

    DO $$
    DECLARE
      trg RECORD;
    BEGIN
      -- Drop any triggers on auth.users that might be failing
      FOR trg IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'users' 
          AND event_object_schema = 'auth'
      LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users CASCADE;', trg.trigger_name);
      END LOOP;
    END $$;

    DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
    DROP FUNCTION IF EXISTS public.sync_user_profile() CASCADE;
