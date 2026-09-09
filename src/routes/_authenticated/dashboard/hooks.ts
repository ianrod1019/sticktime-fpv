import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePilot } from "@/hooks/use-pilot";

export function useDashboardTotals(userId: string | null) {
  return useQuery({
    queryKey: ["session-totals", userId],
    queryFn: async () => {
      if (!userId) return { total_sim_minutes: 0, total_real_minutes: 0, total_sessions: 0, total_packs: 0 };
      const { data, error } = await supabase.rpc("get_user_session_totals", { p_user_id: userId });
      if (error) throw error;
      return data?.[0] ?? { total_sim_minutes: 0, total_real_minutes: 0, total_sessions: 0, total_packs: 0 };
    },
    enabled: !!userId,
  });
}

export function useDashboardMonthlyVolume(userId: string | null) {
  return useQuery({
    queryKey: ["monthly-volume", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc("get_user_monthly_volume", { p_user_id: userId });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });
}

export function useDashboardHeatmap(userId: string | null) {
  return useQuery({
    queryKey: ["heatmap", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc("get_user_heatmap_data", { p_user_id: userId });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });
}

export function useRecentSessions(userId: string | null) {
  return useQuery({
    queryKey: ["recent-sessions", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("sessions")
        .select("id, session_type, flown_on, duration_minutes, gear_id, controller_id, goggles_id, location_id, track_id, sim_platform, packs_flown, crashes, battery_notes, weather, rating, notes")
        .eq("user_id", userId)
        .order("flown_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });
}

export function useActiveRigs(userId: string | null) {
  return useQuery({
    queryKey: ["active-rigs", userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { data, error } = await supabase.rpc("get_user_active_rigs", { p_user_id: userId });
      if (error) throw error;
      return data?.[0]?.active_rig_count ?? 0;
    },
    enabled: !!userId,
  });
}

export function useRigUsage(userId: string | null) {
  return useQuery({
    queryKey: ["rig-usage", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc("get_user_rig_usage", { p_user_id: userId });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });
}