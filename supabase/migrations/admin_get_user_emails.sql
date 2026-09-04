/*
      # Create admin_get_user_emails function

      1. New Functions
        - `admin_get_user_emails()`: Returns table of user ids and emails for admin management.
      2. Security
        - Only accessible by users with admin or dev role in public.profiles.
    */

    CREATE OR REPLACE FUNCTION admin_get_user_emails()
    RETURNS TABLE (
      id uuid,
      email text
    )
    SECURITY DEFINER
    SET search_path = public, auth
    AS $$
    DECLARE
      current_user_role text;
    > BEGIN
      -- Check if calling user is admin or dev
      SELECT role INTO current_user_role
      FROM public.profiles
      WHERE profiles.id = auth.uid();

      IF current_user_role IS NULL OR (LOWER(current_user_role) NOT IN ('admin', 'dev')) THEN
        RAISE EXCEPTION 'Access denied. Admin privileges required.';
      END IF;

      RETURN QUERY
      SELECT u.id, u.email::text
      FROM auth.users u;
    END;
    $$ LANGUAGE plpgsql;
