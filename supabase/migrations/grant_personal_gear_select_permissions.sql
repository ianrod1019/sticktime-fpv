/*
  # Grant SELECT permissions on personal_gear schema

  1. Changes
    - Grants SELECT permission on all personal_gear tables to authenticated users
    - Ensures the authenticated role can query personal_gear tables through the Supabase API
    - RLS policies on each table still restrict access to user-owned records only

  2. Security
    - RLS remains enabled on all personal_gear tables
    - Users can only access their own records via the user_id = auth.uid() policy
*/

GRANT USAGE ON SCHEMA personal_gear TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA personal_gear TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA personal_gear
GRANT SELECT ON TABLES TO authenticated;
