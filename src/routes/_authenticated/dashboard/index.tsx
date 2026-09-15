import { createFileRoute } from "@tanstack/react-router";
import { usePilot } from "@/hooks/use-pilot";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, RefreshCw } from "lucide-react";
import { DashboardContent } from "./components/-DashboardContent";
import {
  useDashboardTotals,
  useDashboardMonthlyVolume,
  useDashboardCalendarSessions,
  useRecentSessions,
  useActiveRigs,
  useRigUsage,
  useCurrentStreak,
} from "./-hooks";
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
  const totalsQuery = useDashboardTotals(user ?? null);
  const monthlyQuery = useDashboardMonthlyVolume(user ?? null);
  const calendarQuery = useDashboardCalendarSessions(user ?? null);
  const recentSessionsQuery = useRecentSessions(user ?? null);
  const activeRigsQuery = useActiveRigs(user ?? null);
  const rigUsageQuery = useRigUsage(user ?? null);
  const streakQuery = useCurrentStreak(user ?? null);

  const gearQuery = useQuery({
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
        (result.data ?? []).map((item: Record<string, unknown>) => ({
          ...item,
          is_as_needed: Number(item["service_interval_minutes"] ?? 0) <= 0,
          gear_type: gearTypes[i],
        })),
      );
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const dashboardQueryStates = [
    totalsQuery,
    monthlyQuery,
    calendarQuery,
    recentSessionsQuery,
    activeRigsQuery,
    rigUsageQuery,
    streakQuery,
    gearQuery,
  ];
  const isDashboardLoading = dashboardQueryStates.some(
    (query) => query.isLoading,
  );
  const dashboardError = dashboardQueryStates.find(
    (query) => query.error,
  )?.error;

  const retryDashboard = async () => {
    await Promise.all(dashboardQueryStates.map((query) => query.refetch()));
  };

  if (isDashboardLoading || dashboardError) {
    return (
      <DashboardDataState
        error={dashboardError instanceof Error ? dashboardError.message : null}
        onRetry={retryDashboard}
      />
    );
  }

  const simMinutes = totalsQuery.data?.total_sim_minutes ?? 0;
  const realMinutes = totalsQuery.data?.total_real_minutes ?? 0;
  const totalMinutes = simMinutes + realMinutes;
  const totalSessions = totalsQuery.data?.total_sessions ?? 0;
  const totalPacks = totalsQuery.data?.total_packs ?? 0;
  const gear = gearQuery.data ?? [];
  // The live sessions table has no rating column; the type carries it as
  // optional so dashboard consumers can render it when present.
  const recentSessions = (recentSessionsQuery.data ?? []) as SessionRow[];
  const activeRigs = activeRigsQuery.data ?? 0;
  const rigUsageData = rigUsageQuery.data ?? [];
  const streak = streakQuery.data ?? { sim: 0, real: 0, combined: 0 };

  return (
    <DashboardContent
      simMinutes={simMinutes}
      realMinutes={realMinutes}
      totalMinutes={totalMinutes}
      totalSessions={totalSessions}
      totalPacks={totalPacks}
      gear={gear}
      recentSessions={recentSessions}
      calendarSessions={(calendarQuery.data ?? []) as SessionRow[]}
      monthlyData={monthlyQuery.data ?? []}
      rigUsage={rigUsageData}
      activeRigs={activeRigs}
      profile={profile ?? null}
      streak={streak}
    />
  );
}

function DashboardDataState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => Promise<unknown>;
}) {
  return (
    <div className="space-y-6">
      <div className="mb-7 border-b border-white/[0.08] pb-6">
        <div className="h-3 w-48 animate-pulse rounded bg-white/[0.08]" />
        <div className="mt-4 h-8 w-64 animate-pulse rounded bg-white/[0.08]" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-white/[0.05]" />
      </div>
      {error ? (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-6"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              aria-hidden
            />
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">
                Dashboard data unavailable
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <button
                type="button"
                onClick={() => void onRetry()}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[0.97]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Try again
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Loading dashboard data"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.04]"
            />
          ))}
        </div>
      )}
    </div>
  );
}
