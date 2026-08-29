/*
      # Remove Broken Trigger and Profile Auto-Creation

      1. Changes
        - Drop the `on_auth_user_created` trigger and `handle_new_user` function that attempts to insert into `profiles` and causes "Database error saving new user" when users sign up.
        - Let Supabase Auth handle user creation cleanly without external table dependencies or triggers.
    */

    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    DROP FUNCTION IF EXISTS public.handle_new_user();
