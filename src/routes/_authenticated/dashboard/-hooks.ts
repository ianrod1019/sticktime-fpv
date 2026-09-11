import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import { type SessionRow } from "@/lib/fpv";
import { computeStreakByMode } from "@/lib/fpv";

export function useDashboardTotals(userId: string | null) {
  return useQuery({
    queryKey: ["session-totals", userId],
    queryFn: async () => {
      if (!userId)
        return {
          total_sim_minutes: 0,
          total_real_minutes: 0,
          total_sessions: 0,
          total_packs: 0,
        };
      const result = await db_request({
        mode: "rpc",
        rpcFunction: "get_user_session_totals",
        rpcParams: { p_user_id: userId },
      });
      if (result.error) throw result.error;
      return (
        result.data?.[0] ?? {
          total_sim_minutes: 0,
          total_real_minutes: 0,
          total_sessions: 0,
          total_packs: 0,
        }
      );
    },
    enabled: !!userId,
  });
}

export function useDashboardMonthlyVolume(userId: string | null) {
  return useQuery({
    queryKey: ["monthly-volume", userId],
    queryFn: async () => {
      if (!userId) return [];
      const result = await db_request({
        mode: "rpc",
        rpcFunction: "get_user_monthly_volume",
        rpcParams: { p_user_id: userId },
      });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!userId,
  });
}

export function useDashboardHeatmap(userId: string | null) {
  return useQuery({
    queryKey: ["heatmap", userId],
    queryFn: async () => {
      if (!userId) return [];
      const result = await db_request({
        mode: "rpc",
        rpcFunction: "get_user_heatmap_data",
        rpcParams: { p_user_id: userId },
      });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!userId,
  });
}

export function useRecentSessions(userId: string | null) {
  return useQuery({
    queryKey: ["recent-sessions", userId],
    queryFn: async () => {
      if (!userId) return [];
      const result = await supabase
        .from("sessions")
        .select(
          "id, session_type, flown_on, duration_minutes, drone_id, controller_id, goggles_id, location_id, track_id, sim_platform, packs_flown, crashes, battery_notes, weather, rating, notes",
        )
        .eq("user_id", userId)
        .order("flown_on", { ascending: false });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!userId,
  });
}

export function useActiveRigs(userId: string | null) {
  return useQuery({
    queryKey: ["active-rigs", userId],
    queryFn: async () => {
      if (!userId) return 0;
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const oneMonthAgoStr = oneMonthAgo.toISOString().split("T")[0];

      // Fetch sessions from the last month for the user
      const sessionsResult = await db_request({
        mode: "query",
        table: "sessions",
        selectColumns: "drone_id",
        filters: {
          user_id: userId,
          flown_on: { $gte: oneMonthAgoStr },
        },
      });
      if (sessionsResult.error) throw sessionsResult.error;
      const sessionGearIds = (sessionsResult.data as { drone_id: string }[])
        .map((row) => row.drone_id)
        .filter((id): id is string => id !== null);

      // Fetch user's drones
      const dronesResult = await db_request({
        mode: "query",
        table: "drones",
        schema: "personal_gear",
        selectColumns: "id",
        filters: {
          user_id: userId,
        },
      });
      if (dronesResult.error) throw dronesResult.error;
      const droneIds = (dronesResult.data as { id: string }[]).map(
        (row) => row.id,
      );

      // Count distinct drone_ids from sessions that are in the user's non-retired drones
      const uniqueSessionGearIds = new Set(sessionGearIds);
      const activeCount = [...uniqueSessionGearIds].filter((id) =>
        droneIds.includes(id),
      ).length;

      return activeCount;
    },
    enabled: !!userId,
  });
}

/** Fetches sessions for the user and returns streak data broken down by mode.
 * Returns an object with sim, real, and combined streak values. */
export function useCurrentStreak(userId: string | null) {
  return useQuery({
    queryKey: ["current-streak", userId],
    queryFn: async () => {
      if (!userId) return { sim: 0, real: 0, combined: 0 };
      const result = await db_request({
        mode: "query",
        table: "sessions",
        selectColumns: "flown_on,session_type",
        filters: { user_id: userId },
        orderBy: { column: "flown_on", ascending: false },
        limit: 500,
      });
      if (result.error) throw result.error;
      const sessions = result.data as Pick<
        SessionRow,
        "flown_on" | "session_type"
      >[];
      return computeStreakByMode(sessions);
    },
    enabled: !!userId,
  });
}

/** Calculates total flight minutes for the current week (Monday to Sunday).
 * Returns minutes for consistency with other dashboard calculations. */
export function useWeeklyGoal(userId: string | null) {
  return useQuery({
    queryKey: ["weekly-goal", userId],
    queryFn: async () => {
      if (!userId) return 0;
      const now = new Date();
      // Calculate the most recent Monday
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      // Calculate Sunday at 23:59:59 of the same week
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      const weekStartStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
      const weekEndStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, "0")}-${String(weekEnd.getDate()).padStart(2, "0")} ${String(weekEnd.getHours()).padStart(2, "0")}:${String(weekEnd.getMinutes()).padStart(2, "0")}:${String(weekEnd.getSeconds()).padStart(2, "0")}`;

      const result = await db_request({
        mode: "query",
        table: "sessions",
        selectColumns: "flown_on,duration_minutes",
        filters: {
          user_id: userId,
          flown_on: { $gte: weekStartStr, $lte: weekEndStr },
        },
      });
      if (result.error) throw result.error;
      const sessions =
        (result.data as
          { flown_on: string; duration_minutes: number }[] | null) ?? [];
      const totalMinutes = sessions.reduce(
        (sum, s) => sum + s.duration_minutes,
        0,
      );
      return totalMinutes;
    },
    enabled: !!userId,
  });
}

export function useRigUsage(userId: string | null) {
  return useQuery({
    queryKey: ["rig-usage", userId],
    queryFn: async () => {
      if (!userId) return [];
      const result = await db_request({
        mode: "rpc",
        rpcFunction: "get_user_rig_usage",
        rpcParams: { p_user_id: userId },
      });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!userId,
  });
}
