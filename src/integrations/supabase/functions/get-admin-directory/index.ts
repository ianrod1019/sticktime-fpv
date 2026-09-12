import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const adminSupabase = createClient(
  import.meta.env["VITE_SUPABASE_URL"] || "",
  import.meta.env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export async function getAdminDirectory(): Promise<any[]> {
  const { data, error } = await adminSupabase
    .from("admin_directory")
    .select("*");

  if (error) throw error;
  return data;
}

export async function getUserEmails(userId: string): Promise<string[]> {
  const { data, error } = await adminSupabase
    .from("admin_audit_logs")
    .select("email")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data?.map((log: any) => log.email) || [];
}
