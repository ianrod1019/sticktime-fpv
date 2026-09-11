import { supabase } from "./client";

export const SUPABASE_FUNCTIONS = {
  getPilotSettings: async () => {
    const { data, error } = await supabase.rpc("get_pilot_settings");
    if (error) throw error;
    return data;
  },

  updateProfile: async (profileData: {
    display_name?: string;
    accent_color?: string;
    avatar_url?: string;
    tier?: string;
  }) => {
    const { data, error } = await supabase.rpc("update_profile", profileData);
    if (error) throw error;
    return data;
  },

  checkIsAdmin: async (userId: string) => {
    const { data, error } = await supabase.rpc("check_is_admin", {
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
  },

  getSecurityLogs: async (options?: {
    limit?: number;
    eventType?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const { data, error } = await supabase.rpc("get_security_logs", options);
    if (error) throw error;
    return data;
  },

  getAdminDirectory: async () => {
    const { data, error } = await supabase.rpc("get_admin_directory");
    if (error) throw error;
    return data;
  },

  getUserEmails: async (userId: string) => {
    const { data, error } = await supabase.rpc("get_user_emails", {
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
  },
};
