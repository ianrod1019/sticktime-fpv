import { supabase } from "@/integrations/supabase/client";

// SECURITY: This module previously created a Supabase client from
// VITE_SUPABASE_SERVICE_ROLE_KEY — every VITE_* variable is inlined into the
// public JS bundle, so a real service-role key here would have handed full,
// RLS-bypassing database access to anyone who opened devtools. It now uses
// the PUBLIC publishable key via the shared client. Admin authorization is
// enforced server-side inside the RPCs themselves (they verify the caller's
// role from the JWT and fail closed for non-admins), so the public key is
// exactly the right credential for these calls.
//
// If a real service-role key was ever set as VITE_SUPABASE_SERVICE_ROLE_KEY,
// treat it as compromised and rotate it in the Supabase dashboard.

export async function getAdminDirectory(): Promise<any[]> {
  // admin_get_admin_directory() is SECURITY DEFINER and re-verifies the
  // caller's admin/dev role on every invocation.
  const { data, error } = await supabase.rpc("admin_get_admin_directory");
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function getUserEmails(userId: string): Promise<string[]> {
  // admin_get_user_emails() is admin-gated server-side; we filter the
  // directory-style result to the requested user client-side.
  const { data, error } = await supabase.rpc("admin_get_user_emails");
  if (error) throw error;
  return (
    ((data ?? []) as Array<{ id?: string; email?: string }>)
      .filter((row) => row.id === userId && !!row.email)
      .map((row) => row.email as string)
  );
}
