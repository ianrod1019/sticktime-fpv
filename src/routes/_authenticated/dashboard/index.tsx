import { createFileRoute } from "@tanstack/react-router";
import { usePilot } from "@/hooks/use-pilot";
import { DashboardContent } from "./components/DashboardContent";
import { useDashboardTotals } from "./hooks";
import { useDashboardMonthlyVolume } from "./hooks";
import { useDashboardHeatmap } from "./hooks";
import { useRecentSessions } from "./hooks";
import { useActiveRigs, useRigUsage, useCurrentStreak, useWeeklyGoal } from "./hooks";
import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard — StickTime FPV" },
      { name: "description", content: "Your FPV flight hours, streak and airtime analytics." },
      { property: "og:title", content: "Dashboard — StickTime FPV" },
      {
        property: "og:description",
        content: "Your FPV flight hours, streak and airtime analytics.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { profile } = usePilot();
  const user = profile?.id;

  const { data: totalsData } = useDashboardTotals(user ?? null);
  const { data: monthlyData } = useDashboardMonthlyVolume(user ?? null);
  const { data: heatmapData } = useDashboardHeatmap(user ?? null);
  const { data: recentSessionsData } = useRecentSessions(user ?? null);
  const { data: activeRigCount } = useActiveRigs(user ?? null);
  const { data: rigUsage } = useRigUsage(user ?? null);
  const { data: streakData } = useCurrentStreak(user ?? null);

  const { data: gearData } = useQuery({
    queryKey: ["gear", user],
    queryFn: async () => {
      if (!user) return [];

      const [
        { data: batteries, error: batteriesError },
        { data: drones, error: dronesError },
        { data: transmitters, error: transmittersError },
        { data: goggles, error: gogglesError },
        { data: otherGear, error: otherGearError },
      ] = await Promise.all([
        db_request({ mode: "query", schema: "personal_gear", table: "batteries", operation: "select", selectColumns: "id,name,total_minutes,service_interval_minutes", filters: { user_id: user } }) as Promise<{ data: Array<{ id: string; name: string; total_minutes: number; service_interval_minutes: number }>; error: Error | null }>,
        db_request({ mode: "query", schema: "personal_gear", table: "drones", operation: "select", selectColumns: "id,name,total_minutes,service_interval_minutes", filters: { user_id: user } }) as Promise<{ data: Array<{ id: string; name: string; total_minutes: number; service_interval_minutes: number }>; error: Error | null }>,
        db_request({ mode: "query", schema: "personal_gear", table: "transmitters", operation: "select", selectColumns: "id,name,total_minutes,service_interval_minutes", filters: { user_id: user } }) as Promise<{ data: Array<{ id: string; name: string; total_minutes: number; service_interval_minutes: number }>; error: Error | null }>,
        db_request({ mode: "query", schema: "personal_gear", table: "goggles", operation: "select", selectColumns: "id,name,total_minutes,service_interval_minutes", filters: { user_id: user } }) as Promise<{ data: Array<{ id: string; name: string; total_minutes: number; service_interval_minutes: number }>; error: Error | null }>,
        db_request({ mode: "query", schema: "personal_gear", table: "other_gear", operation: "select", selectColumns: "id,name,total_minutes,service_interval_minutes", filters: { user_id: user } }) as Promise<{ data: Array<{ id: string; name: string; total_minutes: number; service_interval_minutes: number }>; error: Error | null }>,
      ]);

      if (batteriesError) throw batteriesError;
      if (dronesError) throw dronesError;
      if (transmittersError) throw transmittersError;
      if (gogglesError) throw gogglesError;
      if (otherGearError) throw otherGearError;

      const gear = [
        ...(batteries ?? []).map((item) => ({ ...item, is_as_needed: item.service_interval_minutes <= 0, gear_type: "battery" as const })),
        ...(drones ?? []).map((item) => ({ ...item, is_as_needed: item.service_interval_minutes <= 0, gear_type: "quad" as const })),
        ...(transmitters ?? []).map((item) => ({ ...item, is_as_needed: item.service_interval_minutes <= 0, gear_type: "transmitter" as const })),
        ...(goggles ?? []).map((item) => ({ ...item, is_as_needed: item.service_interval_minutes <= 0, gear_type: "goggles" as const })),
        ...(otherGear ?? []).map((item) => ({ ...item, is_as_needed: item.service_interval_minutes <= 0, gear_type: "other" as const })),
      ];

      return gear;
    },
  });

  const simMinutes = totalsData?.total_sim_minutes ?? 0;
  const realMinutes = totalsData?.total_real_minutes ?? 0;
  const totalMinutes = simMinutes + realMinutes;
  const totalSessions = totalsData?.total_sessions ?? 0;
  const totalPacks = totalsData?.total_packs ?? 0;
  const gear = gearData ?? [];
  const recentSessions = recentSessionsData ?? [];
  const activeRigs = activeRigCount ?? 0;
  const rigUsageData = rigUsage ?? [];
  const streak = streakData ?? { sim: 0, real: 0, combined: 0 };

  return (
    <DashboardContent
      simMinutes={simMinutes}
      realMinutes={realMinutes}
      totalMinutes={totalMinutes}
      totalSessions={totalSessions}
      totalPacks={totalPacks}
      gear={gear}
      recentSessions={recentSessions}
      heatmapData={heatmapData ?? []}
      monthlyData={monthlyData ?? []}
      rigUsage={rigUsageData}
      activeRigs={activeRigs}
      profile={profile ?? null}
      streak={streak}
    />
  );
}