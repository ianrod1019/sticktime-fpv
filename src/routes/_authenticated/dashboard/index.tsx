import { createFileRoute } from "@tanstack/react-router";
import { usePilot } from "@/hooks/use-pilot";
import { DashboardContent } from "./components/-DashboardContent";
import {
  useDashboardTotals,
  useDashboardMonthlyVolume,
  useDashboardHeatmap,
  useRecentSessions,
  useActiveRigs,
  useRigUsage,
  useCurrentStreak,
  useWeeklyGoal,
} from "./-hooks";
import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import { GEAR_REGISTRY } from "@/lib/gear-registry";
import type { SessionRow } from "@/lib/fpv";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard — StickTime FPV" },
      {
        name: "description",
        content: "Your FPV flight hours, streak and airtime analytics.",
      },
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

      const gearTypes = Object.keys(GEAR_REGISTRY) as Array<
        keyof typeof GEAR_REGISTRY
      >;
      const results = await Promise.all(
        gearTypes.map((type) =>
          db_request({
            mode: "query",
            schema: "personal_gear",
            table: GEAR_REGISTRY[type].table,
            operation: "select",
            selectColumns: "id,name,total_minutes,service_interval_minutes",
            filters: { user_id: user },
          }),
        ),
      );

      for (const result of results) {
        if (result.error) throw result.error;
      }

      return results.flatMap((result, i) =>
        (result.data ?? []).map((item: Record<string, any>) => ({
          ...item,
          is_as_needed: item["service_interval_minutes"] <= 0,
          gear_type: gearTypes[i],
        })),
      );
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const simMinutes = totalsData?.total_sim_minutes ?? 0;
  const realMinutes = totalsData?.total_real_minutes ?? 0;
  const totalMinutes = simMinutes + realMinutes;
  const totalSessions = totalsData?.total_sessions ?? 0;
  const totalPacks = totalsData?.total_packs ?? 0;
  const gear = gearData ?? [];
  // The live sessions table has no rating column; the type carries it as
  // optional so dashboard consumers can render it when present.
  const recentSessions = (recentSessionsData ?? []) as SessionRow[];
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
