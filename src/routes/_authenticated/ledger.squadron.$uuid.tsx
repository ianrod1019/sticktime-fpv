import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  Battery,
  CircuitBoard,
  CircleDollarSign,
  Flame,
  Gamepad2,
  ListFilter,
  Lock,
  Package,
  Plane,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { GearScopeProvider, useGearScopeContext } from "@/lib/gear-scope";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorPanel } from "@/components/state-panels";
import { db_request } from "@/lib/db_request";

/**
 * Squadron Cost Ledger (/ledger/squadron/$uuid)
 *
 * The org-owned fleet's money view — the mirror of the personal ledger at
 * /ledger/personal, scoped to org_gear instead of personal_gear. Served by
 * the get_squadron_ledger RPC, which is RBAC-gated server-side: the squadron
 * owner (or managers) always, plain pilots only when the owner granted them
 * ledger access (team_members.can_view_ledger, managed on the Squadron
 * Management page). This page mirrors that check for UI only — the RPC is
 * the enforcement.
 */

type GearType =
  | "quad"
  | "battery"
  | "transmitter"
  | "goggles"
  | "other"
  | "component";

interface OrgLedgerRow {
  gear_id: string;
  gear_name: string;
  gear_type: GearType;
  part_category: string | null;
  purchase_cost: number | string;
  repair_cost: number | string;
  total_cost: number | string;
  flight_minutes: number | string;
  flight_count: number;
  last_flight: string | null;
  packs_flown: number;
}

const GEAR_TYPE_META: Record<GearType, { label: string; icon: typeof Plane }> = {
  quad: { label: "Quad", icon: Plane },
  battery: { label: "Battery set", icon: Battery },
  transmitter: { label: "Transmitter", icon: Gamepad2 },
  goggles: { label: "Goggles", icon: Package },
  other: { label: "Other", icon: Wrench },
  component: { label: "Component", icon: CircuitBoard },
};

const categoryKey = (r: OrgLedgerRow): string =>
  r.gear_type === "component"
    ? `component:${r.part_category ?? "misc"}`
    : r.gear_type;

const categoryLabel = (r: OrgLedgerRow): string =>
  r.gear_type === "component"
    ? `Component · ${r.part_category ?? "misc"}`
    : (GEAR_TYPE_META[r.gear_type]?.label ?? "Other");

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type SortMode = "cost" | "name";

const SORT_LABELS: Record<SortMode, string> = {
  cost: "Investment (high → low)",
  name: "Name (A–Z)",
};

export const Route = createFileRoute("/_authenticated/ledger/squadron/$uuid")({
  head: () => ({
    meta: [
      { title: "Squadron Cost Ledger — StickTime FPV" },
      {
        name: "description",
        content:
          "The squadron's shared fleet ledger: org gear, bench parts and repairs, with costs amortized per hour.",
      },
    ],
  }),
  component: SquadronLedgerRoute,
});

function SquadronLedgerRoute() {
  const { uuid: teamId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <GearScopeProvider scope={{ kind: "org", teamId }}>
      <SquadronLedgerPage teamId={teamId} navigate={navigate} />
    </GearScopeProvider>
  );
}

function SquadronLedgerPage({
  teamId,
  navigate,
}: {
  teamId: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  // Org scope resolution (membership + role gates) comes from the
  // GearScopeProvider — shared with every org-scoped hook/mutation.
  const { resolution: scope } = useGearScopeContext();
  const { canEditMoney, teamName } = scope;

  // Server-truth RBAC check — the same gate the ledger RPC enforces. Only
  // meaningful for members; owner/manager always pass (role-based).
  const rbac = useQuery({
    queryKey: ["squadron-ledger-access", teamId, scope.isMember],
    enabled: scope.isMember,
    staleTime: 30_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "can_view_squadron_ledger",
        rpcParams: { _team_id: teamId },
      });
      if (error) throw error;
      return Boolean(data);
    },
  });

  const canViewLedger = scope.isMember && rbac.data === true;

  const ledger = useQuery({
    queryKey: ["squadron-ledger", teamId],
    enabled: canViewLedger,
    staleTime: 30_000,
    queryFn: async (): Promise<OrgLedgerRow[]> => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_squadron_ledger",
        rpcParams: { _team_id: teamId },
      });
      if (error) throw error;
      return (data ?? []) as OrgLedgerRow[];
    },
  });

  const rows = ledger.data ?? [];

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("cost");

  const totals = useMemo(() => {
    const investment = rows.reduce((sum, r) => sum + num(r.total_cost), 0);
    const componentRows = rows.filter((r) => r.gear_type === "component");
    return {
      investment,
      items: rows.length,
      components: componentRows.length,
      componentSpend: componentRows.reduce(
        (sum, r) => sum + num(r.total_cost),
        0,
      ),
      repairs: rows.reduce((sum, r) => sum + num(r.repair_cost), 0),
    };
  }, [rows]);

  const burnRanked = useMemo(
    () =>
      [...rows]
        .sort((a, b) => num(b.total_cost) - num(a.total_cost))
        .slice(0, 5),
    [rows],
  );

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const key = categoryKey(r);
      if (!seen.has(key)) seen.set(key, categoryLabel(r));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (category !== "all" && categoryKey(r) !== category) return false;
        if (q && !r.gear_name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) =>
        sortMode === "name"
          ? a.gear_name.localeCompare(b.gear_name)
          : num(b.total_cost) - num(a.total_cost),
      );
  }, [rows, search, category, sortMode]);

  if (scope.isLoading || (scope.isMember && rbac.isLoading)) {
    return (
      <div className="p-12 text-center text-muted-foreground font-mono animate-pulse">
        Checking ledger clearance…
      </div>
    );
  }

  if (!scope.isMember) {
    return (
      <AccessPanel
        icon={<ShieldAlert className="h-6 w-6" />}
        title="Access Denied"
        message="You are not a member of this squadron."
        onBack={() => navigate({ to: "/ledger" })}
      />
    );
  }

  if (!canViewLedger) {
    return (
      <AccessPanel
        icon={<Lock className="h-6 w-6" />}
        title="Ledger Private"
        message="The squadron owner has not granted your account access to this fleet ledger. Access is set per member in Squadron Management."
        onBack={() => navigate({ to: "/ledger" })}
      />
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/ledger" })}
          className="mb-2 text-muted-foreground hover:text-foreground gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> All ledgers
        </Button>
        <PageHeader
          title={teamName ? `${teamName} Ledger` : "Squadron Ledger"}
          subtitle={
            canEditMoney
              ? "The squadron's shared fleet — org gear, bench parts and repairs."
              : "The squadron's shared fleet — costs are managed by the owner and managers."
          }
        />
      </div>

      {ledger.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : ledger.isError ? (
        <ErrorPanel
          message="Could not load the squadron ledger. Check your connection and try again."
          onRetry={() => ledger.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricTile
              label="Squad investment"
              value={usd.format(totals.investment)}
              hint="Org gear + bench parts + repairs"
              icon={<CircleDollarSign className="h-3.5 w-3.5" aria-hidden />}
              accent
            />
            <MetricTile
              label="Tracked items"
              value={String(totals.items)}
              hint="Across every org gear table"
              icon={<Package className="h-3.5 w-3.5" aria-hidden />}
            />
            <MetricTile
              label="Bench components"
              value={`${totals.components} · ${usd.format(totals.componentSpend)}`}
              hint="Spare parts held for the fleet"
              icon={<CircuitBoard className="h-3.5 w-3.5" aria-hidden />}
            />
            <MetricTile
              label="Repair spend"
              value={usd.format(totals.repairs)}
              hint="Maintenance logged on org gear"
              icon={<Wrench className="h-3.5 w-3.5" aria-hidden />}
            />
          </div>

          {rows.length === 0 ? (
            <Card className="border-dashed border-border/60 bg-card/40">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <CircleDollarSign
                  className="h-8 w-8 text-muted-foreground/50"
                  aria-hidden
                />
                <div>
                  <p className="font-display text-sm text-foreground">
                    The squadron ledger is empty
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Gear added to the squadron hanger with a purchase price
                    shows up here.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-border/60 bg-card/60">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">
                    Where the squad's money sits
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {burnRanked.map((r) => {
                    const share =
                      totals.investment > 0
                        ? (num(r.total_cost) / totals.investment) * 100
                        : 0;
                    return (
                      <div key={r.gear_id} className="flex items-center gap-3">
                        <div className="w-40 shrink-0 truncate text-xs text-foreground">
                          <Flame
                            className="mr-1 inline h-3 w-3 text-muted-foreground"
                            aria-hidden
                          />
                          {r.gear_name}
                        </div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(3, share)}%` }}
                          />
                        </div>
                        <div className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {usd.format(num(r.total_cost))}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1.5 flex-1">
                  <Label
                    htmlFor="squad-ledger-search"
                    className="text-xs text-muted-foreground"
                  >
                    Search
                  </Label>
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="squad-ledger-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search gear by name…"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5 sm:w-52">
                  <Label className="text-xs text-muted-foreground">
                    Category
                  </Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger aria-label="Filter by category">
                      <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories.map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:w-56">
                  <Label className="text-xs text-muted-foreground">
                    Sort by
                  </Label>
                  <Select
                    value={sortMode}
                    onValueChange={(v) => setSortMode(v as SortMode)}
                  >
                    <SelectTrigger aria-label="Sort rows">
                      <ArrowDownWideNarrow className="h-3.5 w-3.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {SORT_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Purchase</TableHead>
                      <TableHead className="text-right">Repairs</TableHead>
                      <TableHead className="pr-4 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="p-8 text-center text-sm text-muted-foreground"
                        >
                          No gear matches{" "}
                          {search.trim() ? (
                            <span className="font-mono text-foreground">
                              “{search.trim()}”
                            </span>
                          ) : (
                            "this filter"
                          )}
                          .
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((r) => {
                      const meta =
                        GEAR_TYPE_META[r.gear_type] ?? GEAR_TYPE_META.other;
                      const Icon = meta.icon;
                      return (
                        <TableRow key={r.gear_id}>
                          <TableCell className="pl-4">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                                <Icon className="h-3.5 w-3.5" aria-hidden />
                              </div>
                              <div className="truncate text-sm font-medium text-foreground">
                                {r.gear_name}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="border-border/60 text-muted-foreground"
                            >
                              {categoryLabel(r)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-foreground">
                            {usd.format(num(r.purchase_cost))}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                            {num(r.repair_cost) > 0
                              ? usd.format(num(r.repair_cost))
                              : "—"}
                          </TableCell>
                          <TableCell className="pr-4 text-right font-mono tabular-nums text-foreground">
                            {usd.format(num(r.total_cost))}
                          </TableCell>
                        </TableRow>
                      );
                    })
                    )}
                  </TableBody>
                </Table>
              </div>

              <p className="text-[11px] text-muted-foreground">
                The squadron ledger covers org-owned gear only — member
                personal gear stays personal. Flight-hour amortization lands
                when org gear is linked to sessions.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AccessPanel({
  icon,
  title,
  message,
  onBack,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="max-w-md mx-auto mt-16 p-8 hud-panel text-center space-y-4">
      <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
        {icon}
      </div>
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button onClick={onBack} className="w-full gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Ledgers
      </Button>
    </div>
  );
}

function MetricTile({
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
