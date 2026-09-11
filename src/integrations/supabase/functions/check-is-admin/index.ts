import { supabase } from "@/integrations/supabase/client";

export interface AdminCheckResult {
  isAdmin: boolean;
  role?: string;
}

export async function checkIsAdmin(userId: string): Promise<AdminCheckResult> {
  const { data, error } = await supabase.rpc("check_is_admin", {
    p_user_id: userId,
  });

  if (error) throw error;

  if (data === null || data === undefined) {
    return { isAdmin: false };
  }

  return {
    isAdmin: data.is_admin === true,
    role: data.role,
  };
}
