import { createFileRoute } from "@tanstack/react-router";
import { usePilot } from "@/hooks/use-pilot";
import { DashboardContent } from "./components/DashboardContent";
import { useDashboardTotals } from "./hooks";
import { useDashboardMonthlyVolume } from "./hooks";
import { useDashboardHeatmap } from "./hooks";
import { useRecentSessions } from "./hooks";
import { useActiveRigs, useRigUsage } from "./hooks";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

  const { data: gearData } = useQuery({
    queryKey: ["gear", user],
    queryFn: async () => {
      const { data, error } = await supabase.from("gear").select("id,name,gear_type,total_minutes,is_as_needed");
      if (error) throw error;
      return data ?? [];
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
      profile={profile}
    />
  );
}