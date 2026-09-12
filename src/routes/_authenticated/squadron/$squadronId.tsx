import { useMemo } from "react";
import {
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ShieldAlert,
  Users,
  BatteryCharging,
  Settings,
  CircleDollarSign,
  Clock,
  Flame,
  Plane,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db_request } from "@/lib/db_request";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/squadron/$squadronId")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    // ?tab=ledger — shareable Squad HQ views (roster vs fleet ledger).
    const v = search["tab"];
    return v === "ledger" ? { tab: v } : {};
  },
  head: () => ({ meta: [{ title: `Squad HQ — StickTime FPV` }] }),
  component: SquadronHQPage,
});

interface RosterMember {
  member_id: string;
  display_name: string;
  callsign: string | null;
  team_role: string;
  joined_at: string;
  session_count: number;
  flight_minutes: number;
  packs_flown: number;
}

interface SquadLedgerRow {
  member_id: string;
  member_name: string;
  gear_id: string;
  gear_name: string;
  gear_type: string;
  part_category: string | null;
  purchase_cost: number | string;
  repair_cost: number | string;
  total_cost: number | string;
  flight_minutes: number | string;
  flight_count: number;
  packs_flown: number;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const ROLE_META: Record<string, { label: string; cls: string }> = {
  owner: {
    label: "Owner",
    cls: "border-primary/40 bg-primary/10 text-primary",
  },
  manager: {
    label: "Manager",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  },
  member: {
    label: "Pilot",
    cls: "border-border/60 bg-secondary/60 text-secondary-foreground",
  },
};

function SquadMetricTile({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
          accent ? "text-emerald-500" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function SquadronHQPage() {
  const { squadronId } = Route.useParams();
  const navigate = useNavigate({ from: "/squadron/$squadronId" });
  // Tab lives in the URL (?tab=ledger) so views are shareable and the
  // selection survives refetch re-renders.
  const { tab: tabParam } = Route.useSearch();
  const activeTab = tabParam === "ledger" ? "ledger" : "roster";
  const setTab = (t: string) =>
    navigate({ search: t === "roster" ? {} : { tab: t }, replace: true });

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const {
    data: squadData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["squadron-hq-details", squadronId, user?.id],
    enabled: !!user?.id && !!squadronId,
    queryFn: async () => {
      const teamRes = await supabase
        .from("teams")
        .select("id, name, description, owner_id, created_at")
        .eq("id", squadronId)
        .single();

      if (teamRes.error)
        throw new Error("Squadron not found or access denied.");

      const memberRes = await supabase
        .from("team_members")
        .select("team_role, joined_at")
        .eq("team_id", squadronId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!memberRes.data) {
        throw new Error("Unauthorized: You are not a member of this squadron.");
      }

      return {
        team: teamRes.data,
        membership: memberRes.data,
      };
    },
  });

  const isTeamContext = !!squadData && !error;

  const { data: roster } = useQuery({
    queryKey: ["squadron-roster", squadronId],
    enabled: isTeamContext,
    queryFn: async (): Promise<RosterMember[]> => {
      const { data, error: rpcError } = await db_request({
        mode: "rpc",
        rpcFunction: "get_squadron_overview",
        rpcParams: { _team_id: squadronId },
      });
      if (rpcError) throw rpcError;
      return (data ?? []) as RosterMember[];
    },
  });

  const { data: squadLedger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["squadron-ledger", squadronId],
    enabled: isTeamContext,
    queryFn: async (): Promise<SquadLedgerRow[]> => {
      const { data, error: rpcError } = await db_request({
        mode: "rpc",
        rpcFunction: "get_squadron_ledger",
        rpcParams: { _team_id: squadronId },
      });
      if (rpcError) throw rpcError;
      return (data ?? []) as SquadLedgerRow[];
    },
    staleTime: 30_000,
  });

  const squadTotals = useMemo(() => {
    const rows = squadLedger ?? [];
    const investment = rows.reduce((sum, r) => sum + num(r.total_cost), 0);
    const minutes = rows.reduce((sum, r) => sum + num(r.flight_minutes), 0);
    const packs = rows.reduce(
      (sum, r) => sum + (r.gear_type === "battery" ? r.packs_flown ?? 0 : 0),
      0,
    );
    const hours = minutes / 60;
    return {
      investment,
      hours,
      packs,
      perHour: hours > 0 ? investment / hours : 0,
    };
  }, [squadLedger]);

  const burnRanked = useMemo(() => {
    const rows = (squadLedger ?? []).filter(
      (r) => num(r.flight_minutes) > 0 || (r.gear_type === "battery" && (r.packs_flown ?? 0) > 0),
    );
    return rows
      .map((r) => {
        const hours = num(r.flight_minutes) / 60;
        const rate =
          r.gear_type === "battery" && (r.packs_flown ?? 0) > 0
            ? num(r.total_cost) / r.packs_flown
            : hours > 0
              ? num(r.total_cost) / hours
              : 0;
        return { ...r, rate };
      })
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
  }, [squadLedger]);

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground font-mono animate-pulse">
        Establishing secure telemetry uplink to Squadron HQ...
      </div>
    );
  }

  if (error || !squadData) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 hud-panel text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          {error?.message ||
            "You do not have clearance to access this Squadron HQ."}
        </p>
        <Button
          onClick={() => navigate({ to: "/squadron" })}
          className="w-full gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Squad Portal
        </Button>
      </div>
    );
  }

  const { team, membership } = squadData;
  const isOwner =
    membership.team_role === "owner" || team.owner_id === user?.id;
  const isManagerOrOwner = isOwner || membership.team_role === "manager";

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/squadron" })}
          className="text-muted-foreground hover:text-foreground gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Squad Portal
        </Button>

        {isManagerOrOwner && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigate({
                to: "/squadron/manage/$uuid",
                params: { uuid: squadronId },
              })
            }
            className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
          >
            <Settings className="h-4 w-4" /> Squadron Management
          </Button>
        )}
      </div>

      <PageHeader
        title={team.name}
        subtitle={team.description || "Squadron Command & Telemetry Hub"}
      />

      <Tabs
        value={activeTab}
        onValueChange={setTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="ledger">Squad Fleet Ledger</TabsTrigger>
        </TabsList>

        {/* ---------------- Roster ---------------- */}
        <TabsContent value="roster" className="space-y-4">
          {roster && roster.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <SquadMetricTile
                  label="Squad pilots"
                  value={String(roster.length)}
                  hint="Members with HQ access"
                  icon={<Users className="h-3.5 w-3.5" aria-hidden />}
                />
                <SquadMetricTile
                  label="Squad airtime"
                  value={`${(roster.reduce((s, m) => s + num(m.flight_minutes), 0) / 60).toFixed(1)}h`}
                  hint="Combined logged sessions"
                  icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
                />
                <SquadMetricTile
                  label="Squad packs"
                  value={String(
                    roster.reduce((s, m) => s + num(m.packs_flown), 0),
                  )}
                  hint="Real-world pack-cycles"
                  icon={
                    <BatteryCharging className="h-3.5 w-3.5" aria-hidden />
                  }
                />
              </div>

              <div className="hud-panel p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-bl-full pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" /> Squadron Roster
                  </h2>
                  <span className="text-xs uppercase px-2.5 py-1 rounded bg-primary/10 text-primary font-semibold">
                    You: {membership.team_role}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                  {roster.map((m) => {
                    const roleMeta = ROLE_META[m.team_role] ?? ROLE_META["member"]!;
                    return (
                      <div
                        key={m.member_id}
                        className="p-4 rounded-lg bg-card/60 border border-border/50 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                              {(m.display_name || "P").slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {m.display_name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Joined{" "}
                                {new Date(m.joined_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-mono border ${roleMeta.cls}`}
                          >
                            {roleMeta.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-center">
                          <div>
                            <div className="font-mono text-sm font-semibold text-foreground">
                              {m.session_count}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              sessions
                            </div>
                          </div>
                          <div>
                            <div className="font-mono text-sm font-semibold text-foreground">
                              {(num(m.flight_minutes) / 60).toFixed(1)}h
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              airtime
                            </div>
                          </div>
                          <div>
                            <div className="font-mono text-sm font-semibold text-foreground">
                              {m.packs_flown}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              packs
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <Skeleton className="h-64 rounded-xl" />
          )}
        </TabsContent>

        {/* ---------------- Squad Fleet Ledger ---------------- */}
        <TabsContent value="ledger" className="space-y-4">
          {ledgerLoading ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
              </div>
              <Skeleton className="h-72 rounded-xl" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <SquadMetricTile
                  label="Squad investment"
                  value={usd.format(squadTotals.investment)}
                  hint="All member gear + components + repairs"
                  icon={
                    <CircleDollarSign className="h-3.5 w-3.5" aria-hidden />
                  }
                  accent
                />
                <SquadMetricTile
                  label="Squad usage time"
                  value={`${squadTotals.hours.toFixed(1)}h`}
                  hint="Every session across the squad"
                  icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
                />
                <SquadMetricTile
                  label="Squad cost per hour"
                  value={
                    squadTotals.hours > 0
                      ? `${usd.format(squadTotals.perHour)}/hr`
                      : "—"
                  }
                  hint="Investment ÷ total squad hours"
                  icon={<Plane className="h-3.5 w-3.5" aria-hidden />}
                />
                <SquadMetricTile
                  label="Squad packs"
                  value={String(squadTotals.packs)}
                  hint="Real-world pack-cycles"
                  icon={
                    <BatteryCharging className="h-3.5 w-3.5" aria-hidden />
                  }
                />
              </div>

              <Card className="border-border/60 bg-card/60">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">
                    Where the squad's money burns
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {burnRanked.length > 0 ? (
                    burnRanked.map((r) => {
                      const hours = num(r.flight_minutes) / 60;
                      const share =
                        squadTotals.investment > 0
                          ? (num(r.total_cost) / squadTotals.investment) * 100
                          : 0;
                      return (
                        <div
                          key={r.gear_id}
                          className="flex items-center gap-3"
                        >
                          <div className="w-48 shrink-0 truncate text-xs text-foreground">
                            <span className="font-medium">{r.gear_name}</span>
                            <span className="ml-1.5 text-muted-foreground">
                              · {r.member_name}
                            </span>
                          </div>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                hours > 0 && r.rate >= 120
                                  ? "bg-destructive"
                                  : hours > 0 && r.rate >= 50
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.max(3, share)}%` }}
                            />
                          </div>
                          <div className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                            {r.gear_type === "battery" &&
                            (r.packs_flown ?? 0) > 0
                              ? `${usd.format(r.rate)}/pack`
                              : `${usd.format(r.rate)}/hr`}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No squad usage logged yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="rounded-xl border border-border/60 bg-card/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Item</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead className="text-right">Total cost</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Packs</TableHead>
                      <TableHead className="pr-4 text-right">
                        Burn rate
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(squadLedger ?? []).map((r) => {
                      const hours = num(r.flight_minutes) / 60;
                      const rate =
                        r.gear_type === "battery" && (r.packs_flown ?? 0) > 0
                          ? num(r.total_cost) / r.packs_flown
                          : hours > 0
                            ? num(r.total_cost) / hours
                            : 0;
                      return (
                        <TableRow key={`${r.member_id}-${r.gear_id}`}>
                          <TableCell className="pl-4">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                                <Flame className="h-3.5 w-3.5" aria-hidden />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {r.gear_name}
                                </div>
                                <div className="font-mono text-[10px] capitalize text-muted-foreground">
                                  {r.gear_type}
                                  {r.part_category
                                    ? ` · ${r.part_category}`
                                    : ""}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.member_name}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-foreground">
                            {usd.format(num(r.total_cost))}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-foreground">
                            {hours > 0 ? `${hours.toFixed(1)}h` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-foreground">
                            {r.gear_type === "battery" && r.packs_flown > 0
                              ? r.packs_flown
                              : "—"}
                          </TableCell>
                          <TableCell className="pr-4 text-right font-mono tabular-nums">
                            {rate > 0 ? (
                              <span
                                className={
                                  rate >= 120
                                    ? "font-semibold text-destructive"
                                    : rate >= 50
                                      ? "font-semibold text-amber-500"
                                      : "text-emerald-500"
                                }
                              >
                                {r.gear_type === "battery" &&
                                (r.packs_flown ?? 0) > 0
                                  ? `${usd.format(rate)}/pack`
                                  : `${usd.format(rate)}/hr`}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">
                                —
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <p className="text-[11px] text-muted-foreground">
                The squad ledger aggregates every member's gear and usage the
                same way the personal Cost Ledger does — batteries per pack
                flown, everything else per hour. Members see roll-ups only;
                private flight details stay personal.
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
