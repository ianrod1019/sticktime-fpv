import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  Battery,
  BatteryCharging,
  CircuitBoard,
  CircleDollarSign,
  Clock,
  Flame,
  Gamepad2,
  Hourglass,
  ListFilter,
  Package,
  Plane,
  Search,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Route } from "@/routes/_authenticated/gear/ledger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorPanel } from "@/components/state-panels";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";

/**
 * Cost-per-Flight-Hour Ledger (fpvlog.racing)
 *
 * Financial truth for the ENTIRE hangar — gear AND bench components:
 * what every airframe, pack set, radio, headset, accessory and spare part
 * cost, how long it has been used (real AND sim — sim hours are still hours
 * on the gear), and what each hour or pack actually cost. Data comes from
 * the `get_cost_per_flight_hour_ledger` RPC, which unions all personal_gear
 * tables + drone_parts and aggregates every session.
 *
 * Batteries amortize per PACK FLOWN, everything else per hour. Gear with
 * zero usage isn't a problem — it's PLANNED: bought, on the shelf, waiting
 * for its first session. The meter starts the moment it's used.
 *
 * NOTE: gear sets / team roll-ups are an enterprise-tier feature and are
 * intentionally out of scope here — this ledger is strictly personal.
 */

type GearType = "quad" | "battery" | "transmitter" | "goggles" | "other" | "component";

interface LedgerRow {
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

const GEAR_TYPE_META: Record<
  GearType,
  { label: string; icon: typeof Plane }
> = {
  quad: { label: "Quad", icon: Plane },
  battery: { label: "Battery set", icon: Battery },
  transmitter: { label: "Transmitter", icon: Gamepad2 },
  goggles: { label: "Goggles", icon: Package },
  other: { label: "Other", icon: Wrench },
  component: { label: "Component", icon: CircuitBoard },
};

/** Category filter value for a row (components get their own sub-category). */
const categoryKey = (r: LedgerRow): string =>
  r.gear_type === "component"
    ? `component:${r.part_category ?? "misc"}`
    : r.gear_type;

const categoryLabel = (r: LedgerRow): string =>
  r.gear_type === "component"
    ? `Component · ${r.part_category ?? "misc"}`
    : GEAR_TYPE_META[r.gear_type]?.label ?? "Other";

/** Burn-rate thresholds ($ per flight hour) for the warning badges. */
const BURN_WARN = 50;
const BURN_DANGER = 120;

/** Per-pack thresholds for battery badges ($ per pack flown). */
const PACK_WARN = 4;
const PACK_DANGER = 8;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const fmtHours = (minutes: number | string): string =>
  `${(num(minutes) / 60).toFixed(1)}h`;

function BurnBadge({ perHour }: { perHour: number }) {
  if (perHour >= BURN_DANGER) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-destructive/50 bg-destructive/10 text-destructive"
      >
        <Flame className="h-3 w-3" aria-hidden />
        Burning cash
      </Badge>
    );
  }
  if (perHour >= BURN_WARN) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-500"
      >
        <TriangleAlert className="h-3 w-3" aria-hidden />
        High burn
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
    >
      Healthy
    </Badge>
  );
}

function PackBadge({ perPack }: { perPack: number }) {
  if (perPack >= PACK_DANGER) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-destructive/50 bg-destructive/10 text-destructive"
      >
        <Flame className="h-3 w-3" aria-hidden />
        Pricey packs
      </Badge>
    );
  }
  if (perPack >= PACK_WARN) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-500"
      >
        <TriangleAlert className="h-3 w-3" aria-hidden />
        Warming up
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
    >
      Amortizing
    </Badge>
  );
}

/** Zero-usage gear isn't a problem — it's planned future usage. */
function PlannedBadge({ noun }: { noun: string }) {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-sky-500/40 bg-sky-500/10 text-sky-400"
    >
      <Hourglass className="h-3 w-3" aria-hidden />
      Planned
      <span className="font-normal text-sky-400/70">· {noun}</span>
    </Badge>
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

type SortMode = "burn" | "name" | "cost" | "hours";

const SORT_LABELS: Record<SortMode, string> = {
  burn: "Burn rate (worst first)",
  name: "Name (A–Z)",
  cost: "Investment (high → low)",
  hours: "Usage (most hours first)",
};

type LedgerTab = "fleet" | "breakdown";

export function CostLedgerPage() {
  const { profile } = usePilot();
  const navigate = useNavigate({ from: "/gear/ledger" });
  // Tab lives in the URL (?tab=breakdown) so views are shareable and the
  // selection survives refetch re-renders.
  const { tab: tabParam } = Route.useSearch();
  const activeTab: LedgerTab = tabParam === "breakdown" ? "breakdown" : "fleet";
  const setTab = (t: string) =>
    navigate({ search: t === "fleet" ? {} : { tab: t }, replace: true });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("burn");

  const ledger = useQuery({
    queryKey: ["cost-ledger", profile?.id],
    queryFn: async (): Promise<LedgerRow[]> => {
      // RPC supports p_limit/p_offset; the fleet table is small enough to
      // fetch in one call but now bounded server-side (cap 10k).
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_cost_per_flight_hour_ledger",
        rpcParams: { p_user_id: profile!.id, p_limit: 500, p_offset: 0 },
      });
      if (error) throw error;
      return (data ?? []) as LedgerRow[];
    },
    enabled: !!profile?.id,
    staleTime: 30_000,
  });

  const rows = ledger.data ?? [];

  const fleet = useMemo(() => {
    const investment = rows.reduce((sum, r) => sum + num(r.total_cost), 0);
    const minutes = rows.reduce((sum, r) => sum + num(r.flight_minutes), 0);
    // Sessions involving a quad are "flight sessions"; per-gear counts
    // legitimately overlap (one session touches quad + TX + goggles + set).
    const flightSessions = Math.max(
      0,
      ...rows
        .filter((r) => r.gear_type === "quad")
        .map((r) => r.flight_count ?? 0),
    );
    const packs = rows
      .filter((r) => r.gear_type === "battery")
      .reduce((sum, r) => sum + (r.packs_flown ?? 0), 0);
    const componentRows = rows.filter((r) => r.gear_type === "component");
    const componentSpend = componentRows.reduce(
      (sum, r) => sum + num(r.total_cost),
      0,
    );
    const hours = minutes / 60;
    return {
      investment,
      hours,
      flightSessions,
      packs,
      componentSpend,
      componentCount: componentRows.length,
      perHour: hours > 0 ? investment / hours : 0,
    };
  }, [rows]);

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
    return rows.filter((r) => {
      if (category !== "all" && categoryKey(r) !== category) return false;
      if (q && !r.gear_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, category]);

  const sortedRows = useMemo(() => {
    const rateOf = (r: LedgerRow): number => {
      const hours = num(r.flight_minutes) / 60;
      if (r.gear_type === "battery" && (r.packs_flown ?? 0) > 0) {
        return num(r.total_cost) / r.packs_flown;
      }
      return hours > 0 ? num(r.total_cost) / hours : 0;
    };
    const used = (r: LedgerRow): boolean =>
      num(r.flight_minutes) > 0 || (r.gear_type === "battery" && (r.packs_flown ?? 0) > 0);

    return [...filteredRows].sort((a, b) => {
      if (sortMode === "name") return a.gear_name.localeCompare(b.gear_name);
      if (sortMode === "cost")
        return num(b.total_cost) - num(a.total_cost);
      if (sortMode === "hours") {
        const aMin = num(a.flight_minutes);
        const bMin = num(b.flight_minutes);
        if (aMin !== bMin) return bMin - aMin;
        return num(b.total_cost) - num(a.total_cost);
      }
      // "burn": used gear first (worst burn rate on top), planned gear at
      // the bottom sorted by what was paid.
      if (used(a) && used(b)) return rateOf(b) - rateOf(a);
      if (used(a)) return -1;
      if (used(b)) return 1;
      return num(b.purchase_cost) - num(a.purchase_cost);
    });
  }, [filteredRows, sortMode]);

  const isLoading = ledger.isLoading;

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Cost Ledger"
        subtitle="What every hour — and every pack — actually costs, across the entire hangar."
        action={
          <Button asChild variant="secondary">
            <Link to="/hanger" search={{ add: "1" }}>
              Add gear in the Hanger
            </Link>
          </Button>
        }
      />

      {isLoading ? (
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
          message="Could not load the ledger. Check your connection and try again."
          onRetry={() => ledger.refetch()}
        />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setTab}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="fleet">Global Fleet Ledger</TabsTrigger>
            <TabsTrigger value="breakdown">
              Per-Gear Breakdown
              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                {filteredRows.length === rows.length
                  ? rows.length
                  : `${filteredRows.length}/${rows.length}`}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Global Fleet Ledger ---------------- */}
          <TabsContent value="fleet" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <MetricTile
                label="Total investment"
                value={usd.format(fleet.investment)}
                hint="Everything: gear + components + repairs"
                icon={<CircleDollarSign className="h-3.5 w-3.5" aria-hidden />}
                accent
              />
              <MetricTile
                label="Total usage time"
                value={`${fleet.hours.toFixed(1)}h`}
                hint="Every session — sim included, it's still hours"
                icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
              />
              <MetricTile
                label="Fleet cost per hour"
                value={fleet.hours > 0 ? `${usd.format(fleet.perHour)}/hr` : "—"}
                hint={
                  fleet.hours > 0
                    ? "Total investment ÷ total hours"
                    : "Log a session to start the meter"
                }
                icon={<Plane className="h-3.5 w-3.5" aria-hidden />}
              />
              <MetricTile
                label="Packs flown"
                value={String(fleet.packs)}
                hint={
                  fleet.packs > 0
                    ? `Lifetime pack-cycles across ${rows.filter((r) => r.gear_type === "battery" && (r.packs_flown ?? 0) > 0).length || "all"} set(s)`
                    : "Pick a battery set when logging real sessions"
                }
                icon={
                  <BatteryCharging className="h-3.5 w-3.5" aria-hidden />
                }
              />
            </div>

            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5">
                {fleet.flightSessions} real flight session
                {fleet.flightSessions === 1 ? "" : "s"} · sim and real time
                both count
              </span>
              <span className="rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5">
                {fleet.componentCount} component
                {fleet.componentCount === 1 ? "" : "s"} ·{" "}
                {usd.format(fleet.componentSpend)} on the bench ·{" "}
                <Link
                  to="/gear/inventory"
                  className="text-primary underline underline-offset-2"
                >
                  Bench Inventory
                </Link>
              </span>
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
                      The ledger is empty
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add gear — with a purchase price — in the Hanger and it
                      will start earning its keep, or burning cash.
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link to="/hanger" search={{ add: "1" }}>
                      Open the Hanger
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/60 bg-card/60">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">
                    Where the money burns
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sortedRows
                    .filter((r) => usedRow(r))
                    .slice(0, 5)
                    .map((r) => {
                      const hours = num(r.flight_minutes) / 60;
                      const perHour = hours > 0 ? num(r.total_cost) / hours : 0;
                      const share =
                        fleet.investment > 0
                          ? (num(r.total_cost) / fleet.investment) * 100
                          : 0;
                      return (
                        <div
                          key={r.gear_id}
                          className="flex items-center gap-3"
                        >
                          <div className="w-40 shrink-0 truncate text-xs text-foreground">
                            {r.gear_name}
                          </div>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                hours > 0 && perHour >= BURN_DANGER
                                  ? "bg-destructive"
                                  : hours > 0 && perHour >= BURN_WARN
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.max(3, share)}%` }}
                            />
                          </div>
                          <div className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                            {hours > 0
                              ? `${usd.format(perHour)}/hr`
                              : r.gear_type === "battery" && r.packs_flown > 0
                                ? `${usd.format(num(r.total_cost) / r.packs_flown)}/pack`
                                : "—"}
                          </div>
                        </div>
                      );
                    })}
                  {rows.every((r) => !usedRow(r)) && (
                    <p className="text-xs text-muted-foreground">
                      No usage logged yet — everything on the shelves is
                      planned. The burn meter starts with your first session.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ---------------- Per-Gear Breakdown ---------------- */}
          <TabsContent value="breakdown" className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="ledger-search" className="text-xs text-muted-foreground">
                  Search
                </Label>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="ledger-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search gear by name…"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:w-52">
                <Label className="text-xs text-muted-foreground">Category</Label>
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
                <Label className="text-xs text-muted-foreground">Sort by</Label>
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

            {rows.length === 0 ? (
              <Card className="border-dashed border-border/60 bg-card/40">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Nothing to break down yet — add gear in the{" "}
                  <Link
                    to="/hanger"
                    search={{ add: "1" }}
                    className="text-primary underline underline-offset-2"
                  >
                    Gear Hanger
                  </Link>{" "}
                  or parts on the{" "}
                  <Link
                    to="/gear/inventory"
                    className="text-primary underline underline-offset-2"
                  >
                    Bench Inventory
                  </Link>
                  .
                </CardContent>
              </Card>
            ) : filteredRows.length === 0 ? (
              <Card className="border-dashed border-border/60 bg-card/40">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No gear matches{" "}
                  {search.trim() ? (
                    <span className="font-mono text-foreground">
                      “{search.trim()}”
                    </span>
                  ) : (
                    "this filter"
                  )}
                  .
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-xl border border-border/60 bg-card/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">
                        Purchase cost
                      </TableHead>
                      <TableHead className="text-right">Repairs</TableHead>
                      <TableHead className="text-right">Total time</TableHead>
                      <TableHead className="text-right">Cost / hour</TableHead>
                      <TableHead className="pr-4 text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.map((r) => {
                      const hours = num(r.flight_minutes) / 60;
                      const perHour = hours > 0 ? num(r.total_cost) / hours : 0;
                      const packs =
                        r.gear_type === "battery" ? r.packs_flown ?? 0 : 0;
                      const perPack = packs > 0 ? num(r.total_cost) / packs : 0;
                      const meta =
                        GEAR_TYPE_META[r.gear_type] ?? GEAR_TYPE_META.other;
                      const Icon = meta.icon;
                      const isUsed = hours > 0 || packs > 0;
                      return (
                        <TableRow key={r.gear_id}>
                          <TableCell className="pl-4">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                                <Icon className="h-3.5 w-3.5" aria-hidden />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {r.gear_name}
                                </div>
                                <div className="font-mono text-[10px] text-muted-foreground">
                                  {r.gear_type === "battery" ? (
                                    <>
                                      {packs} pack{packs === 1 ? "" : "s"}{" "}
                                      flown
                                      {hours > 0
                                        ? ` · ${r.flight_count} session${r.flight_count === 1 ? "" : "s"}`
                                        : ""}
                                    </>
                                  ) : (
                                    <>
                                      {r.flight_count} session
                                      {r.flight_count === 1 ? "" : "s"}
                                    </>
                                  )}
                                </div>
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
                          <TableCell className="text-right font-mono tabular-nums text-foreground">
                            {isUsed ? (
                              <>
                                {fmtHours(r.flight_minutes)}
                                {r.gear_type === "battery" && packs > 0 && (
                                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                                    · {packs} packs
                                  </span>
                                )}
                              </>
                            ) : (
                              <span
                                className="text-muted-foreground/60"
                                title="Bought and ready — the meter starts with its first session."
                              >
                                0h
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {r.gear_type === "battery" ? (
                              packs > 0 ? (
                                <span
                                  className={
                                    perPack >= PACK_DANGER
                                      ? "font-semibold text-destructive"
                                      : perPack >= PACK_WARN
                                        ? "font-semibold text-amber-500"
                                        : "text-emerald-500"
                                  }
                                >
                                  {usd.format(perPack)}/pack
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60">
                                  per pack
                                </span>
                              )
                            ) : hours > 0 ? (
                              <span
                                className={
                                  perHour >= BURN_DANGER
                                    ? "font-semibold text-destructive"
                                    : perHour >= BURN_WARN
                                      ? "font-semibold text-amber-500"
                                      : "text-emerald-500"
                                }
                              >
                                {usd.format(perHour)}/hr
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            {r.gear_type === "battery" ? (
                              packs > 0 ? (
                                <PackBadge perPack={perPack} />
                              ) : (
                                <PlannedBadge noun="no packs yet" />
                              )
                            ) : isUsed ? (
                              <BurnBadge perHour={perHour} />
                            ) : (
                              <PlannedBadge noun="awaiting first use" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Burn-rate flags: high ≥ {usd.format(BURN_WARN)}/hr · critical ≥{" "}
              {usd.format(BURN_DANGER)}/hr. Battery sets amortize per pack
              flown, not per hour. Zero-time gear is planned usage — it joins
              the meter at its first session. Every session counts: sim hours
              are still hours on the gear.
            </p>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

const usedRow = (r: LedgerRow): boolean =>
  num(r.flight_minutes) > 0 ||
  (r.gear_type === "battery" && (r.packs_flown ?? 0) > 0);
