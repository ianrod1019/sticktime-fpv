/*
  # One-time bulk grant: tester role for pre-launch QA

  Marks every existing profile as 'tester' except the two owner accounts,
  so QA/dev-console access (mock data generator, /dev route) can be
  exercised broadly before public launch. Existing admin/dev accounts are
  left untouched — this upgrades ordinary accounts, it doesn't downgrade
  ones already elevated. New signups after this migration runs are
  unaffected; they still default to 'user'.
*/

UPDATE public.profiles
SET role = 'tester', updated_at = now()
WHERE id NOT IN (
  SELECT id FROM auth.users
  WHERE email IN ('alexrod1019@gmail.com', 'alexrod1019alt3@gmail.com')
)
AND LOWER(COALESCE(role, 'user')) NOT IN ('admin', 'dev');
