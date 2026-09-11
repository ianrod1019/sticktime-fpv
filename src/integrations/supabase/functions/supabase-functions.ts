import { supabase } from "./client";

interface SessionGearData {
  id: string;
  user_id: string;
  session_type: string;
  flown_on: string;
  drone_id: string | null;
  controller_id: string | null;
  location_id: string | null;
  track_id: string | null;
  sim_platform: string | null;
  packs_flown: number;
  crashes: number;
  battery_notes: string | null;
  weather: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
  transmitter: string | null;
  drone: string | null;
  goggles: string | null;
}

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

  // Get sessions with associated gear (transmitter, drone, goggles) for the current user
  // Takes up to 100 session IDs and returns enriched data with gear names
  // Only returns sessions owned by the current user (enforced via Edge Function + RLS)
  getSessionsWithGear: async (sessionIds: string[]) => {
    const { data, error } = await supabase.functions.invoke(
      "get-sessions-with-gear",
      {
        body: { sessionIds },
      },
    );

    if (error) throw error;
    return data as SessionGearData[];
  },
};
