import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ActivitySquare,
  AlertTriangle,
  BarChart3,
  Building2,
  Lock,
  PieChart as PieChartIcon,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db_request } from "@/lib/db_request";
import { useEnterpriseAccess } from "@/hooks/inventory/use-enterprise-access";
import { useOrgRole } from "@/hooks/inventory/use-org-role";
import {
  AnalyticsTooltip,
  EmptyChartHint,
  PREMIUM_PALETTE,
} from "@/components/analytics/failure-analytics-dashboard";
import { cn } from "@/lib/utils";

/**
 * Squadron (org fleet) failure analytics.
 *
 * Data comes from the `get_org_failure_analytics` RPC, which aggregates the
 * team-owned `org_gear` schema: structured failure reports in
 * `org_gear.maintenance_logs` (descriptions starting
 * "Failure: <reason> · Part: <part> · Category: <bucket>") plus
 * `org_gear.drone_parts` rows marked broken — with the SAME dedup event
 * model as the personal dashboard (a report + its matching broken part is
 * one event; exact double-submits collapse; costs come from reports only).
 *
 * The RPC is SECURITY INVOKER over the shared org fleet: RLS scopes every
 * read to teams the caller belongs to, and there is no per-pilot
 * attribution at all — the gear belongs to the squadron.
 *
 * ENTERPRISE-gated (one tier above the personal analytics' Pro gate): free
 * AND Pro members get the lock card and no query is issued; the server-side
 * RPC re-checks the tier so the gate cannot be bypassed client-side.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgFailureRow {
  team_id: string;
  team_name: string;
  bucket: string;
  label: string;
  reports: number;
  broken_parts: number;
  events: number;
  repair_cost: number | string | null;
  is_crash: boolean;
  fleet_minutes: number | string | null;
  drone_crashes: number | string | null;
}

// ---------------------------------------------------------------------------
// Constants (mirrors the personal dashboard)
// ---------------------------------------------------------------------------

/** Fewer fleet hours between crashes than this => warning state. */
const MTBF_WARNING_HOURS = 25;
/** Share of the worst driver before a bar turns amber. */
const HIGH_FAILURE_THRESHOLD_RATIO = 0.6;

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const hoursFmt = (value: number) => `${value.toFixed(1)} h`;

function toNumber(value: unknown): number {
  const n =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Aggregation (pure — server sends event groups, we build the views)
// ---------------------------------------------------------------------------

interface OrgRollup {
  teamName: string | null;
  totalEvents: number;
  totalCost: number;
  avgHoursBetweenCrashes: number | null;
  totalCrashEvents: number;
  totalFleetHours: number;
  categoryBreakdown: Array<{ name: string; value: number }>;
  topFailureDrivers: Array<{
    name: string;
    failures: number;
    totalCost: number;
  }>;
  allGroups: OrgFailureRow[];
}

export function buildOrgRollup(rows: OrgFailureRow[]): OrgRollup {
  // fleet_minutes / drone_crashes repeat on every row of a team — take the
  // first occurrence per team so totals are never double counted.
  const fleetMinutesByTeam = new Map<string, number>();
  const crashesByTeam = new Map<string, number>();
  let teamName: string | null = null;
  for (const r of rows) {
    if (!fleetMinutesByTeam.has(r.team_id)) {
      fleetMinutesByTeam.set(r.team_id, toNumber(r.fleet_minutes));
      crashesByTeam.set(r.team_id, toNumber(r.drone_crashes));
    }
    if (!teamName) teamName = r.team_name;
  }

  const totalEvents = rows.reduce((sum, r) => sum + toNumber(r.events), 0);
  const totalCost = rows.reduce((sum, r) => sum + toNumber(r.repair_cost), 0);
  const crashReasonReports = rows.reduce(
    (sum, r) => sum + (r.is_crash ? toNumber(r.reports) : 0),
    0,
  );

  const totalFleetMinutes = [...fleetMinutesByTeam.values()].reduce(
    (sum, v) => sum + v,
    0,
  );
  const totalFleetHours = Math.round((totalFleetMinutes / 60) * 10) / 10;
  const fleetCrashes = [...crashesByTeam.values()].reduce(
    (sum, v) => sum + v,
    0,
  );
  // crash_count already covers crashes that were also reported — same
  // no-double-counting rule as the personal dashboard.
  const componentFailureEvents = Math.max(0, totalEvents - crashReasonReports);
  const totalCrashEvents = fleetCrashes + componentFailureEvents;
  const avgHoursBetweenCrashes =
    totalCrashEvents > 0
      ? Math.round((totalFleetHours / totalCrashEvents) * 10) / 10
      : null;

  const bucketMap = new Map<string, number>();
  for (const r of rows) {
    bucketMap.set(
      r.bucket,
      (bucketMap.get(r.bucket) ?? 0) + toNumber(r.events),
    );
  }
  const categoryBreakdown = [...bucketMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  const topFailureDrivers = [...rows]
    .sort((a, b) => toNumber(b.events) - toNumber(a.events))
    .slice(0, 8)
    .map((r) => ({
      name: r.label,
      failures: toNumber(r.events),
      totalCost: toNumber(r.repair_cost),
    }));

  const allGroups = [...rows].sort(
    (a, b) => toNumber(b.events) - toNumber(a.events),
  );

  return {
    teamName,
    totalEvents,
    totalCost,
    avgHoursBetweenCrashes,
    totalCrashEvents,
    totalFleetHours,
    categoryBreakdown,
    topFailureDrivers,
    allGroups,
  };
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Squadron Failure Analytics"
        subtitle="Failure reports and broken components across the shared org fleet."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="border-border/60 bg-card/60">
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="border-border/60 bg-card/60 xl:col-span-2">
          <CardContent className="p-6">
            <Skeleton className="mx-auto h-[220px] w-[220px] rounded-full" />
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/60 xl:col-span-3">
          <CardContent className="space-y-3 p-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Enterprise-gate lock card: shown to free AND Pro members. */
function ProLockCard() {
  return (
    <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-background/60 to-background/30 shadow-[0_24px_80px_-24px_var(--primary)]">
      <CardContent className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 shadow-inner">
          <Lock className="h-7 w-7 text-primary" aria-hidden />
        </div>
        <div className="flex items-center justify-center gap-2">
          <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Squadron Failure Analytics
          </h3>
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/15 text-primary"
          >
            <Building2 className="mr-1 h-3 w-3" aria-hidden />
            Enterprise
          </Badge>
        </div>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Failure rates, crash attribution and repair-cost roll-ups across the
          shared org fleet — an Enterprise-tier capability, on top of Pro.
        </p>
        <ul className="mx-auto mt-4 space-y-1.5 text-left text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <PieChartIcon
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
              aria-hidden
            />
            Failure breakdown across every airframe the squadron owns
          </li>
          <li className="flex items-start gap-2">
            <BarChart3
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
              aria-hidden
            />
            Top failure drivers with shared-spares warnings
          </li>
          <li className="flex items-start gap-2">
            <Wrench
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
              aria-hidden
            />
            Full event-group table with repair-cost estimates
          </li>
        </ul>
        <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
          <Link to="/settings">
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
            Upgrade to Enterprise
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function MetricTile({
  icon,
  label,
  value,
  hint,
  warning = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  warning?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/60 bg-card/60 backdrop-blur-sm",
        warning && "border-amber-500/30",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent",
          warning && "via-amber-500/60",
        )}
      />
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span className={cn("text-primary", warning && "text-amber-500")}>
            {icon}
          </span>
          {label}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={cn(
              "font-display text-2xl font-bold text-foreground",
              warning && "text-amber-400",
            )}
          >
            {value}
          </span>
          {warning && (
            <AlertTriangle
              className="h-4 w-4 self-center text-amber-500"
              aria-hidden
            />
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SquadronFailureAnalytics({
  squadronId,
}: {
  squadronId: string;
}) {
  const { hasEnterpriseAccess, isLoading: entLoading } = useEnterpriseAccess();
  // Per-member analytics permission (owner/manager always; plain members
  // when granted — via their own switch or a custom role template).
  const { canViewAnalytics, isLoading: roleLoading } = useOrgRole(squadronId);

  const query = useQuery({
    queryKey: ["org-failure-analytics", squadronId],
    // No data leaves the server for free OR Pro members — the RPC re-checks
    // the Enterprise tier server-side, so this gate cannot be bypassed.
    enabled: hasEnterpriseAccess && canViewAnalytics && !!squadronId,
    staleTime: 60_000,
    queryFn: async (): Promise<OrgFailureRow[]> => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_org_failure_analytics",
        rpcParams: { _team_id: squadronId },
      });
      if (error) throw error;
      return (data ?? []) as OrgFailureRow[];
    },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const rollup = useMemo(() => buildOrgRollup(rows), [rows]);

  if (entLoading || roleLoading || query.isLoading) return <AnalyticsSkeleton />;
  if (!hasEnterpriseAccess) return <ProLockCard />;
  if (!canViewAnalytics) {
    return (
      <Card className="border-border/60 bg-card/60">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold">Analytics Private</p>
          <p className="text-xs text-muted-foreground">
            The squadron owner has not granted your account access to failure
            analytics.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Squadron Failure Analytics"
          subtitle="Failure reports and broken components across the shared org fleet."
        />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error
                ? query.error.message
                : "Could not load squadron failure analytics."}
            </p>
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const worstDriver = rollup.topFailureDrivers[0]?.failures ?? 0;
  const warningThreshold = Math.max(
    2,
    Math.ceil(worstDriver * HIGH_FAILURE_THRESHOLD_RATIO),
  );
  const mtbf = rollup.avgHoursBetweenCrashes;
  const mtbfWarning = mtbf !== null && mtbf < MTBF_WARNING_HOURS;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Squadron Failure Analytics"
        subtitle={`Failure reports and broken components across the shared org fleet${
          rollup.teamName ? ` — ${rollup.teamName}` : ""
        }.`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricTile
          icon={<ActivitySquare className="h-4 w-4" />}
          label="Avg hours between crashes"
          value={mtbf === null ? "—" : hoursFmt(mtbf)}
          hint={`${rollup.totalCrashEvents} crash/failure events · ${rollup.totalFleetHours} fleet hours`}
          warning={mtbfWarning}
        />
        <MetricTile
          icon={<PieChartIcon className="h-4 w-4" />}
          label="Failures logged"
          value={String(rollup.totalEvents)}
          hint={`${currencyFmt.format(rollup.totalCost)} estimated repair spend`}
        />
        <MetricTile
          icon={<BarChart3 className="h-4 w-4" />}
          label="Worst offender"
          value={rollup.topFailureDrivers[0]?.name ?? "—"}
          hint={
            rollup.topFailureDrivers[0]
              ? `${rollup.topFailureDrivers[0].failures} failures fleet-wide`
              : "No failures recorded yet"
          }
          warning={
            rollup.topFailureDrivers.length > 0 &&
            worstDriver >= warningThreshold
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Donut */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <PieChartIcon className="h-4 w-4 text-primary" aria-hidden />
              Failures by category
            </CardTitle>
            <CardDescription className="text-xs">
              Shared-fleet reports and broken components (deduplicated).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {rollup.categoryBreakdown.length === 0 ? (
              <EmptyChartHint
                icon={<PieChartIcon className="h-8 w-8" />}
                message="No failures logged for the org fleet yet — log reports from the squadron hanger's maintenance console to populate analytics."
              />
            ) : (
              <>
                <div className="relative h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={rollup.categoryBreakdown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={96}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {rollup.categoryBreakdown.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={
                              PREMIUM_PALETTE[
                                index % PREMIUM_PALETTE.length
                              ] as string
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<AnalyticsTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-3xl font-bold text-foreground">
                      {rollup.totalEvents}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      failures
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {rollup.categoryBreakdown.map((entry, index) => (
                    <div
                      key={entry.name}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: PREMIUM_PALETTE[
                            index % PREMIUM_PALETTE.length
                          ] as string,
                        }}
                      />
                      <span className="truncate text-muted-foreground">
                        {entry.name}
                      </span>
                      <span className="ml-auto font-mono text-foreground/90">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Bars */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
              Top failure drivers
            </CardTitle>
            <CardDescription className="text-xs">
              Components with the most failures across the org fleet.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {rollup.topFailureDrivers.length === 0 ? (
              <EmptyChartHint
                icon={<BarChart3 className="h-8 w-8" />}
                message="No failure drivers yet — org-fleet failures will show up here as they are logged."
              />
            ) : (
              <>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={rollup.topFailureDrivers}
                      layout="vertical"
                      margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={<AnalyticsTooltip showCost />}
                        cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                      />
                      <Bar
                        dataKey="failures"
                        radius={[0, 6, 6, 0]}
                        barSize={16}
                      >
                        {rollup.topFailureDrivers.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={
                              entry.failures >= warningThreshold
                                ? "#f59e0b"
                                : "var(--primary)"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {rollup.topFailureDrivers.some(
                  (d) => d.failures >= warningThreshold,
                ) && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-500/90">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    High-failure components detected — worth a shared spares
                    bin.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full event-group table */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Wrench className="h-4 w-4 text-primary" aria-hidden />
            All tracked components
          </CardTitle>
          <CardDescription className="text-xs">
            Every failure group in the org fleet, sorted by event count.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {rollup.allGroups.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nothing logged yet.
            </p>
          ) : (
            <div className="rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Component</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Reports</TableHead>
                    <TableHead className="text-right">Broken parts</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="pr-4 text-right">
                      Est. repair cost
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rollup.allGroups.map((r) => (
                    <TableRow key={`${r.team_id}-${r.bucket}-${r.label}`}>
                      <TableCell className="pl-4 text-sm font-medium text-foreground">
                        {r.label}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.bucket}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-foreground">
                        {r.reports}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-foreground">
                        {r.broken_parts}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono font-semibold tabular-nums",
                          r.events >= warningThreshold
                            ? "text-amber-500"
                            : "text-foreground",
                        )}
                      >
                        {r.events}
                      </TableCell>
                      <TableCell className="pr-4 text-right font-mono tabular-nums text-foreground">
                        {toNumber(r.repair_cost) > 0
                          ? currencyFmt.format(toNumber(r.repair_cost))
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Aggregated from the squadron's shared org fleet — maintenance-log
        failure reports and broken bench parts, deduplicated so one failure
        never counts twice. Repair costs are estimates from reports only.
      </p>
    </div>
  );
}
