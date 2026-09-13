import { useCallback, useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ActivitySquare,
  AlertTriangle,
  BarChart3,
  Crown,
  Loader2,
  Lock,
  PieChart as PieChartIcon,
  Plus,
  RefreshCw,
  ShieldCheck,
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
import { openUpgradeModal } from "@/components/billing/upgrade-modal";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { db_request, primeDeltaSyncCache } from "@/lib/db_request";
import { resetDeltaSyncTable } from "@/lib/delta-sync";
import { useProAccess } from "@/hooks/inventory/use-pro-access";
import { usePilot } from "@/hooks/use-pilot";
import { cn } from "@/lib/utils";

/**
 * Premium analytics surface: fleet-wide component failure rates + crash
 * attribution. Strictly Pro/Enterprise — free users see a lock overlay
 * blurring the suite below (and no data is fetched on the free tier).
 *
 * Two sources feed the analytics, deduplicated so a single failure is never
 * counted twice:
 *  1. `personal_gear.maintenance_logs` — failure reports following the
 *     structured format built by `buildFailureReportDescription`
 *     ("Failure: <reason> · Part: <part> · Category: <bucket>"). Exact
 *     duplicate reports (double submits) are collapsed.
 *  2. `personal_gear.drone_parts` — components marked status='broken'
 *     (e.g. a dead motor swapped off an airframe).
 *
 * Dedup rule: events are grouped by (category bucket, component label). A
 * broken part whose name matches a failure report's "Part" field in the same
 * bucket merges into that report's group, and each group contributes
 * max(#reports, #broken parts) events — so 1 report + 1 broken motor = 1
 * event, while 2 broken motors = 2 events. Costs come from reports only
 * (part rows carry no cost).
 *
 * Reads go through the delta-sync layer (`db_request({ sync: "delta" })`):
 * each pass only fetches rows newer than the client's watermark, so repeat
 * loads transfer ~0 rows. "Full resync" forces a paged full reconcile.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FailureAnalyticsData {
  /** Failures by component category (donut source). */
  categoryBreakdown: Array<{ name: string; value: number }>;
  /** Specific components/airframes with the most failures (bar source). */
  topFailureDrivers: Array<{
    name: string;
    failures: number;
    totalCost: number;
  }>;
  /** Average flight hours between crashes/catastrophic failures (fleet-wide). */
  crashCorrelation: {
    avgHoursBetweenCrashes: number | null;
    totalCrashEvents: number;
    totalFleetHours: number;
  };
  totalFailures: number;
  totalRepairCost: number;
}

export interface FleetGearOption {
  id: string;
  label: string;
}

export interface FailureReportDraft {
  gearId: string;
  category: string;
  part: string;
  reason: string;
  notes: string;
  cost: string;
}

export interface ParsedFailureReport {
  reason: string;
  part: string;
  category: string;
  notes: string;
}

interface FleetDroneRow {
  id: string;
  name: string;
  brand: string | null;
  total_minutes: number | null;
  crash_count: number | null;
  updated_at: string;
}

interface FailureLogRow {
  id: string;
  gear_id: string | null;
  description: string;
  cost: number | string | null;
  performed_on: string;
  updated_at: string;
}

interface DronePartRow {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  status: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Structured failure-report format
// ---------------------------------------------------------------------------

const CATEGORY_BUCKETS = [
  "Frames",
  "Motors",
  "ESCs",
  "Flight Controllers",
  "VTX/Camera",
  "Other",
] as const;

export const FAILURE_CATEGORIES: readonly string[] = CATEGORY_BUCKETS;

const FAILURE_LINE_PATTERN =
  /^Failure:\s*(.+?)\s*·\s*Part:\s*(.+?)\s*·\s*Category:\s*(.+?)\s*$/;

/** Crash-type reasons (everything else counts as a component failure). */
const CRASH_REASONS = new Set([
  "mid-air collision",
  "tree strike",
  "hard landing",
  "lost signal / flyaway",
  "ground crash on launch",
]);

const QUICK_REASONS = [
  "Mid-air collision",
  "Tree strike",
  "Hard landing",
  "Lost signal / flyaway",
  "Ground crash on launch",
  "ESC desync",
  "Battery failure",
  "Motor bearing seizure",
];

/** Local part categories -> presentation buckets (for drone_parts rows). */
const PART_CATEGORY_BUCKET: Record<string, string> = {
  frame: "Frames",
  motor: "Motors",
  esc: "ESCs",
  fc: "Flight Controllers",
  aio: "Flight Controllers",
  vtx: "VTX/Camera",
  camera: "VTX/Camera",
};

/**
 * Serializes a failure report into the canonical maintenance-log description.
 * First line is machine-parseable; the optional second block is free text.
 */
export function buildFailureReportDescription(draft: {
  reason: string;
  part: string;
  category: string;
  notes?: string;
}): string {
  const head = `Failure: ${draft.reason.trim()} · Part: ${
    draft.part.trim() || "Unspecified"
  } · Category: ${draft.category}`;
  const notes = draft.notes?.trim();
  return notes ? `${head}\n${notes}` : head;
}

/** Parses the canonical format; returns null for regular maintenance logs. */
export function parseFailureReport(
  description: string,
): ParsedFailureReport | null {
  const [head, ...rest] = description.split("\n");
  const match = head?.match(FAILURE_LINE_PATTERN);
  if (!match) return null;
  return {
    reason: (match[1] ?? "").trim(),
    part: (match[2] ?? "").trim(),
    category: (match[3] ?? "").trim(),
    notes: rest.join("\n").trim(),
  };
}

function isCrashReason(reason: string): boolean {
  return CRASH_REASONS.has(reason.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Premium dark-mode chart palette (violet -> indigo -> cyan, gold accent). */
export const PREMIUM_PALETTE = [
  "#8b5cf6",
  "#6366f1",
  "#22d3ee",
  "#a78bfa",
  "#f59e0b",
  "#64748b",
];

const ANALYTICS_KEY = "failure-analytics";

/** Share of the worst driver before a bar turns amber. */
const HIGH_FAILURE_THRESHOLD_RATIO = 0.6;
/** Fewer fleet hours between crashes than this => warning state. */
const MTBF_WARNING_HOURS = 25;

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

function normalizeBucket(raw: string): string {
  return (CATEGORY_BUCKETS as readonly string[]).includes(raw) ? raw : "Other";
}

function bucketForPartCategory(raw: string | null): string {
  const mapped = PART_CATEGORY_BUCKET[(raw ?? "").toLowerCase().trim()];
  return mapped ?? "Other";
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function partDisplayLabel(part: DronePartRow): string {
  return (
    [part.brand, part.name].filter(Boolean).join(" ").trim() || "Unspecified"
  );
}

/**
 * True when a failure report's free-text "Part" field refers to the same
 * component as a drone_parts row (by exact name or brand+name match).
 */
function reportPartMatches(reportPart: string, part: DronePartRow): boolean {
  const rp = normalizeLabel(reportPart);
  if (!rp || rp === "unspecified") return false;
  return (
    rp === normalizeLabel(part.name ?? "") ||
    rp === normalizeLabel(partDisplayLabel(part))
  );
}

// ---------------------------------------------------------------------------
// Aggregation (pure; client-side — no server rollups)
// ---------------------------------------------------------------------------

interface FailureGroup {
  bucket: string;
  label: string;
  reports: number;
  brokenParts: number;
  cost: number;
  hasCrashReason: boolean;
}

export function buildAnalyticsPayload(
  drones: FleetDroneRow[],
  logs: FailureLogRow[],
  parts: DronePartRow[],
): FailureAnalyticsData {
  // ---- 1. Structured failure reports from maintenance_logs ----------------
  const allReports = logs
    .map((log) => ({ log, parsed: parseFailureReport(log.description) }))
    .filter(
      (entry): entry is { log: FailureLogRow; parsed: ParsedFailureReport } =>
        entry.parsed !== null,
    );

  // Double-submit guard: collapse exact duplicates (same gear, reason, part,
  // category and cost). Distinct-but-similar reports stay counted.
  const seen = new Set<string>();
  const reports = allReports.filter(({ log, parsed }) => {
    const key = [
      log.gear_id ?? "",
      normalizeLabel(parsed.reason),
      normalizeLabel(parsed.part),
      normalizeBucket(parsed.category),
      toNumber(log.cost),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ---- 2. Group events by (bucket, component label) ------------------------
  const groups = new Map<string, FailureGroup>();
  const groupKey = (bucket: string, label: string) =>
    `${bucket}::${normalizeLabel(label)}`;

  const ensureGroup = (bucket: string, label: string): FailureGroup => {
    const key = groupKey(bucket, label);
    let group = groups.get(key);
    if (!group) {
      group = {
        bucket,
        label,
        reports: 0,
        brokenParts: 0,
        cost: 0,
        hasCrashReason: false,
      };
      groups.set(key, group);
    }
    return group;
  };

  for (const { log, parsed } of reports) {
    const bucket = normalizeBucket(parsed.category);
    const label = parsed.part || "Unspecified";
    const group = ensureGroup(bucket, label);
    group.reports += 1;
    group.cost += toNumber(log.cost);
    if (isCrashReason(parsed.reason)) group.hasCrashReason = true;
  }

  // Broken components merge into a matching report's group when one exists
  // (same component, same bucket) so the pair counts as a single event; an
  // unmatched broken part forms its own group.
  const brokenParts = parts.filter(
    (p) => (p.status ?? "").toLowerCase() === "broken",
  );
  for (const part of brokenParts) {
    const bucket = bucketForPartCategory(part.category);
    const label = partDisplayLabel(part);
    const matching = [...groups.values()].find(
      (g) =>
        g.bucket === bucket &&
        g.reports > 0 &&
        reportPartMatches(
          reports.find(
            (r) =>
              normalizeBucket(r.parsed.category) === bucket &&
              (r.parsed.part || "Unspecified") === g.label,
          )?.parsed.part ?? "",
          part,
        ),
    );
    if (matching) {
      matching.brokenParts += 1;
    } else {
      ensureGroup(bucket, label).brokenParts += 1;
    }
  }

  // ---- 3. Deduplicated event counts ----------------------------------------
  // A group's event count is the larger of its two sources: a report plus its
  // matching broken part is ONE event, but two broken motors are still two.
  const eventCount = (group: FailureGroup) =>
    Math.max(group.reports, group.brokenParts);
  const totalEvents = [...groups.values()].reduce(
    (sum, g) => sum + eventCount(g),
    0,
  );

  const bucketTotals = new Map<string, number>();
  for (const bucket of CATEGORY_BUCKETS) bucketTotals.set(bucket, 0);
  for (const group of groups.values()) {
    bucketTotals.set(
      group.bucket,
      (bucketTotals.get(group.bucket) ?? 0) + eventCount(group),
    );
  }

  // ---- 4. Crash correlation (MTBF-style) -----------------------------------
  // crash_count already covers crashes that were also reported, so only
  // non-crash component failures are added on top — no double counting.
  const totalFleetMinutes = drones.reduce(
    (sum, d) => sum + toNumber(d.total_minutes),
    0,
  );
  const totalFleetHours = Math.round((totalFleetMinutes / 60) * 10) / 10;
  const fleetCrashes = drones.reduce(
    (sum, d) => sum + toNumber(d.crash_count),
    0,
  );
  const crashReasonReports = reports.filter(({ parsed }) =>
    isCrashReason(parsed.reason),
  ).length;
  const componentFailureEvents = totalEvents - crashReasonReports;
  const totalCrashEvents = fleetCrashes + componentFailureEvents;
  const avgHoursBetweenCrashes =
    totalCrashEvents > 0
      ? Math.round((totalFleetHours / totalCrashEvents) * 10) / 10
      : null;

  return {
    categoryBreakdown: CATEGORY_BUCKETS.map((name) => ({
      name,
      value: bucketTotals.get(name) ?? 0,
    })).filter((entry) => entry.value > 0),
    topFailureDrivers: [...groups.values()]
      .map((group) => ({
        name: group.label,
        failures: eventCount(group),
        totalCost: group.cost,
      }))
      .sort((a, b) => b.failures - a.failures)
      .slice(0, 8),
    crashCorrelation: {
      avgHoursBetweenCrashes,
      totalCrashEvents,
      totalFleetHours,
    },
    totalFailures: totalEvents,
    totalRepairCost: [...groups.values()].reduce((sum, g) => sum + g.cost, 0),
  };
}

// ---------------------------------------------------------------------------
// Free-tier gate: blurred suite + prominent lock overlay
// ---------------------------------------------------------------------------

function FreeTierGate() {
  return (
    <div className="relative space-y-6">
      {/* Blurred decorative preview (no real data rendered on free tier) */}
      <div
        aria-hidden
        className="pointer-events-none select-none space-y-6 blur-xl"
      >
        <PageHeader
          title="Fleet Failure Analytics"
          subtitle="Failure rates and crash attribution across your entire hangar."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {["14.2 h", "23", "Ethix Stout v3"].map((value, i) => (
            <Card key={value} className="border-border/60 bg-card/60">
              <CardContent className="p-5">
                <div className="h-3 w-24 rounded bg-muted-foreground/20" />
                <div className="mt-3 font-display text-3xl font-bold text-foreground/80">
                  {value}
                </div>
                {i === 1 && (
                  <div className="mt-3 h-2 w-full rounded bg-muted-foreground/10" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <Card className="border-border/60 bg-card/60 xl:col-span-2">
            <CardContent className="p-6">
              <div className="mx-auto h-[180px] w-[180px] rounded-full border-[28px] border-primary/30 border-t-cyan-400/60 border-r-violet-500/60" />
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card/60 xl:col-span-3">
            <CardContent className="flex h-full flex-col justify-center gap-3 p-6">
              {[92, 70, 55, 34].map((w) => (
                <div key={w} className="flex items-center gap-3">
                  <div
                    className="h-2.5 flex-1 rounded-r-full bg-gradient-to-r from-violet-500/60 to-primary/20"
                    style={{ width: `${w}%` }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/40 backdrop-blur-[2px]">
        <Card className="relative z-20 w-full max-w-lg border-primary/25 bg-gradient-to-br from-primary/10 via-background/60 to-background/30 shadow-[0_24px_80px_-24px_var(--primary)] backdrop-blur-xl">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 shadow-inner">
              <Lock className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <div className="flex items-center justify-center gap-2">
              <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">
                Fleet Failure Analytics
              </h3>
              <Badge
                variant="outline"
                className="border-primary/40 bg-primary/15 text-primary"
              >
                <Crown className="mr-1 h-3 w-3" aria-hidden />
                Pro
              </Badge>
            </div>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Component failure rates, crash attribution and repair-cost
              analytics across your fleet — reserved for Pro and Enterprise
              pilots.
            </p>
            <ul className="mx-auto mt-4 space-y-1.5 text-left text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <PieChartIcon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                  aria-hidden
                />
                Failure breakdown by component category
              </li>
              <li className="flex items-start gap-2">
                <BarChart3
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                  aria-hidden
                />
                Top failure drivers with high-failure warnings
              </li>
              <li className="flex items-start gap-2">
                <ActivitySquare
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                  aria-hidden
                />
                Fleet-wide crash correlation metric
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                  aria-hidden
                />
                One-tap failure reporting with root-cause notes
              </li>
            </ul>
            <Button
              size="lg"
              className="mt-6 w-full sm:w-auto"
              onClick={() =>
                openUpgradeModal({
                  tier: "pro",
                  featureName: "Fleet Failure Analytics",
                  description:
                    "Component failure rates, crash attribution and repair-cost analytics across your fleet — reserved for Pro and Enterprise pilots.",
                  perks: [
                    "Failure breakdown by component category",
                    "Top failure drivers with high-failure warnings",
                    "Fleet-wide crash correlation metric",
                    "One-tap failure reporting with root-cause notes",
                  ],
                })
              }
            >
              <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
              Upgrade to Pro
            </Button>
            <p className="mt-3 text-[11px] text-muted-foreground/70">
              Current plan: Free — analytics unlock instantly after upgrade.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart tooltip
// ---------------------------------------------------------------------------

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  payload?: {
    name?: string;
    failures?: number;
    totalCost?: number;
    value?: number;
  };
}

export function AnalyticsTooltip({
  active,
  payload,
  label,
  suffix = "failures",
  showCost = false,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  suffix?: string;
  showCost?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]!;
  const name = entry.payload?.name ?? label ?? entry.name ?? "";
  const value = entry.payload?.failures ?? entry.value ?? 0;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      <div className="font-semibold text-foreground">{name}</div>
      <div className="mt-0.5 text-muted-foreground">
        {value} {suffix}
      </div>
      {showCost && (entry.payload?.totalCost ?? 0) > 0 && (
        <div className="mt-0.5 text-amber-400/90">
          {currencyFmt.format(entry.payload?.totalCost ?? 0)} repair cost
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  icon,
  label,
  value,
  hint,
  warning = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  warning?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-card/40 backdrop-blur-sm",
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
              "font-display text-3xl font-bold text-foreground",
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
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Add Failure Report modal (Pro only) — writes a structured maintenance log
// ---------------------------------------------------------------------------

function AddFailureReportModal({
  open,
  onOpenChange,
  gearOptions,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gearOptions: FleetGearOption[];
  onSubmit: (draft: FailureReportDraft) => Promise<boolean>;
  isSubmitting: boolean;
}) {
  const [draft, setDraft] = useState<FailureReportDraft>({
    gearId: "",
    category: "Other",
    part: "",
    reason: "",
    notes: "",
    cost: "",
  });

  useEffect(() => {
    if (open) {
      setDraft({
        gearId: "",
        category: "Other",
        part: "",
        reason: "",
        notes: "",
        cost: "",
      });
    }
  }, [open]);

  const canSubmit =
    !!draft.gearId &&
    draft.reason.trim().length >= 3 &&
    !!draft.category &&
    !isSubmitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const ok = await onSubmit(draft);
    if (ok) {
      toast.success("Failure report logged");
      onOpenChange(false);
    } else {
      toast.error("Could not log the failure report");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/60 bg-card/95 backdrop-blur-xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <Wrench className="h-5 w-5 text-primary" aria-hidden />
            Log failure report
          </DialogTitle>
          <DialogDescription>
            Filed as a maintenance-log entry with a structured failure reason,
            affected component and estimated repair cost.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="failure-gear">Gear</Label>
            <Select
              value={draft.gearId}
              onValueChange={(value) =>
                setDraft((d) => ({ ...d, gearId: value }))
              }
            >
              <SelectTrigger id="failure-gear" aria-label="Select gear">
                <SelectValue placeholder="Select an airframe" />
              </SelectTrigger>
              <SelectContent>
                {gearOptions.map((gear) => (
                  <SelectItem key={gear.id} value={gear.id}>
                    {gear.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="failure-category">Category</Label>
              <Select
                value={draft.category}
                onValueChange={(value) =>
                  setDraft((d) => ({ ...d, category: value }))
                }
              >
                <SelectTrigger
                  id="failure-category"
                  aria-label="Select category"
                >
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_BUCKETS.map((bucket) => (
                    <SelectItem key={bucket} value={bucket}>
                      {bucket}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="failure-cost">Repair cost (USD)</Label>
              <Input
                id="failure-cost"
                inputMode="decimal"
                placeholder="e.g. 45"
                value={draft.cost}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    cost: e.target.value.replace(/[^0-9.]/g, ""),
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="failure-part">Component / part</Label>
            <Input
              id="failure-part"
              placeholder="e.g. Ethix Stout v3"
              value={draft.part}
              onChange={(e) =>
                setDraft((d) => ({ ...d, part: e.target.value }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Matching a bench part by name keeps it deduplicated if that part
              is also marked broken.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="failure-reason">Failure reason</Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, reason }))}
                  className={cn(
                    "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    draft.reason === reason
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {reason}
                </button>
              ))}
            </div>
            <Input
              id="failure-reason"
              placeholder="Or type a custom reason…"
              value={draft.reason}
              onChange={(e) =>
                setDraft((d) => ({ ...d, reason: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="failure-notes">Notes (optional)</Label>
            <Textarea
              id="failure-notes"
              rows={2}
              placeholder="Anything worth remembering…"
              value={draft.notes}
              onChange={(e) =>
                setDraft((d) => ({ ...d, notes: e.target.value }))
              }
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Log failure
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Analytics suite (Pro render)
// ---------------------------------------------------------------------------

function AnalyticsSuite({
  data,
  gearOptions,
  onAddFailure,
  isSubmitting,
  onFullResync,
  isResyncing,
  lastSyncPass,
}: {
  data: FailureAnalyticsData;
  gearOptions: FleetGearOption[];
  onAddFailure: (draft: FailureReportDraft) => Promise<boolean>;
  isSubmitting: boolean;
  onFullResync: () => void;
  isResyncing: boolean;
  lastSyncPass: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const {
    totalFailures,
    categoryBreakdown,
    topFailureDrivers,
    crashCorrelation,
  } = data;

  const worstDriver = topFailureDrivers[0]?.failures ?? 0;
  // Warn only on meaningful outliers: >=2 failures AND >=60% of the worst.
  const warningThreshold = Math.max(
    2,
    Math.ceil(worstDriver * HIGH_FAILURE_THRESHOLD_RATIO),
  );

  const mtbf = crashCorrelation.avgHoursBetweenCrashes;
  const mtbfWarning = mtbf !== null && mtbf < MTBF_WARNING_HOURS;

  const syncLabel =
    lastSyncPass === "full"
      ? "reconciled"
      : lastSyncPass === "delta"
        ? "delta"
        : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet Failure Analytics"
        subtitle="Failure reports and broken components, attributed across the hangar."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onFullResync}
              disabled={isResyncing}
              className="border-border/60 bg-card/40 hover:bg-accent/40"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isResyncing && "animate-spin")}
                aria-hidden
              />
              Full resync
              {syncLabel && (
                <span className="ml-1 hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                  {syncLabel}
                </span>
              )}
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add failure report
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          icon={<ActivitySquare className="h-4 w-4" />}
          label="Avg hours between crashes"
          value={mtbf === null ? "—" : hoursFmt(mtbf)}
          hint={`${crashCorrelation.totalCrashEvents} crash/failure events · ${crashCorrelation.totalFleetHours} fleet hours`}
          warning={mtbfWarning}
        />
        <MetricCard
          icon={<PieChartIcon className="h-4 w-4" />}
          label="Failures logged"
          value={String(totalFailures)}
          hint={`${currencyFmt.format(data.totalRepairCost)} estimated repair spend`}
        />
        <MetricCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Worst offender"
          value={topFailureDrivers[0]?.name ?? "—"}
          hint={
            topFailureDrivers[0]
              ? `${topFailureDrivers[0].failures} failures`
              : "No failures recorded yet"
          }
          warning={
            topFailureDrivers.length > 0 && worstDriver >= warningThreshold
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
              From failure reports and broken components (deduplicated).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {categoryBreakdown.length === 0 ? (
              <EmptyChartHint
                icon={<PieChartIcon className="h-8 w-8" />}
                message="No failures recorded yet — log a report or mark a broken part to populate your analytics."
              />
            ) : (
              <>
                <div className="relative h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={96}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {categoryBreakdown.map((entry, index) => (
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
                      {totalFailures}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      failures
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {categoryBreakdown.map((entry, index) => (
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
              Components with the most failures, sorted by frequency.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {topFailureDrivers.length === 0 ? (
              <EmptyChartHint
                icon={<BarChart3 className="h-8 w-8" />}
                message="No failure drivers yet — log a failure report to populate this chart."
              />
            ) : (
              <>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topFailureDrivers}
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
                        {topFailureDrivers.map((entry) => (
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
                {topFailureDrivers.some(
                  (d) => d.failures >= warningThreshold,
                ) && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-500/90">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    High-failure components detected — consider stocking spares.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AddFailureReportModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        gearOptions={gearOptions}
        onSubmit={onAddFailure}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

export function EmptyChartHint({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
      <span className="text-muted-foreground/50">{icon}</span>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function SuiteSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet Failure Analytics"
        subtitle="Failure rates and crash attribution across your entire hangar."
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FailureAnalyticsDashboard() {
  const queryClient = useQueryClient();
  const { profile } = usePilot();
  const { hasProAccess, isLoading: proLoading } = useProAccess();
  const userId = profile?.id ?? null;

  const enabled = hasProAccess && !!userId;

  // ---- Fleet (drones) via delta sync --------------------------------------
  const fleetQuery = useQuery({
    queryKey: [ANALYTICS_KEY, "fleet", userId],
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "drones",
        operation: "select",
        selectColumns:
          "id, name, brand, total_minutes, crash_count, updated_at",
        sync: "delta",
      });
      if (error) throw error;
      return (data ?? []) as unknown as FleetDroneRow[];
    },
  });

  // ---- Failure logs via delta sync ----------------------------------------
  const logsQuery = useQuery({
    queryKey: [ANALYTICS_KEY, "logs", userId],
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "maintenance_logs",
        operation: "select",
        selectColumns:
          "id, gear_id, description, cost, performed_on, updated_at",
        sync: "delta",
      });
      if (error) throw error;
      return (data ?? []) as unknown as FailureLogRow[];
    },
  });

  // ---- Broken components via delta sync ------------------------------------
  const partsQuery = useQuery({
    queryKey: [ANALYTICS_KEY, "parts", userId],
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "drone_parts",
        operation: "select",
        selectColumns: "id, name, brand, category, status, updated_at",
        sync: "delta",
      });
      if (error) throw error;
      return (data ?? []) as unknown as DronePartRow[];
    },
  });

  const drones = useMemo(
    () => (fleetQuery.data ?? []) as FleetDroneRow[],
    [fleetQuery.data],
  );
  const logs = useMemo(
    () => (logsQuery.data ?? []) as FailureLogRow[],
    [logsQuery.data],
  );
  const parts = useMemo(
    () => (partsQuery.data ?? []) as DronePartRow[],
    [partsQuery.data],
  );

  const data = useMemo(
    () => buildAnalyticsPayload(drones, logs, parts),
    [drones, logs, parts],
  );

  const gearOptions = useMemo<FleetGearOption[]>(
    () =>
      drones.map((d) => ({
        id: d.id,
        label: [d.brand, d.name].filter(Boolean).join(" ") || d.id,
      })),
    [drones],
  );

  // ---- Add failure report --------------------------------------------------
  const [isSubmitting, setIsSubmitting] = useState(false);
  const addFailure = useCallback(
    async (draft: FailureReportDraft): Promise<boolean> => {
      if (!userId) return false;
      const cost = Number.parseFloat(draft.cost) || 0;
      setIsSubmitting(true);
      try {
        const { data: inserted, error } = await db_request({
          mode: "query",
          schema: "personal_gear",
          table: "maintenance_logs",
          operation: "insert",
          data: {
            gear_id: draft.gearId,
            description: buildFailureReportDescription({
              reason: draft.reason,
              part: draft.part,
              category: draft.category,
              notes: draft.notes,
            }),
            cost,
            reset_service_clock: false,
            performed_on: new Date().toISOString(),
          },
          single: true,
        });
        if (error || !inserted) return false;
        // Keep the delta-sync cache newest without waiting for a refetch.
        primeDeltaSyncCache(
          "maintenance_logs",
          userId,
          inserted as Record<string, unknown>,
          "personal_gear",
        );
        queryClient.invalidateQueries({ queryKey: [ANALYTICS_KEY, "logs"] });
        return true;
      } finally {
        setIsSubmitting(false);
      }
    },
    [userId, queryClient],
  );

  // ---- Full resync ----------------------------------------------------------
  const [isResyncing, setIsResyncing] = useState(false);
  const [lastSyncPass, setLastSyncPass] = useState("cache");
  const handleFullResync = useCallback(async () => {
    setIsResyncing(true);
    try {
      for (const table of ["drones", "maintenance_logs", "drone_parts"]) {
        if (userId) resetDeltaSyncTable("personal_gear", table, userId);
      }
      await Promise.all([
        fleetQuery.refetch(),
        logsQuery.refetch(),
        partsQuery.refetch(),
      ]);
      setLastSyncPass("full");
      toast.success("Fleet analytics resynced");
    } catch {
      toast.error("Resync failed — check your connection");
    } finally {
      setIsResyncing(false);
    }
  }, [userId, fleetQuery, logsQuery, partsQuery]);

  // ---- Render gates ----------------------------------------------------------
  if (proLoading) return <SuiteSkeleton />;
  if (!hasProAccess) return <FreeTierGate />;

  if (fleetQuery.isLoading || logsQuery.isLoading || partsQuery.isLoading) {
    return <SuiteSkeleton />;
  }

  if (fleetQuery.isError || logsQuery.isError || partsQuery.isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Fleet Failure Analytics"
          subtitle="Failure rates and crash attribution across your entire hangar."
        />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Could not load your fleet analytics. Check your connection and try
              again.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                fleetQuery.refetch();
                logsQuery.refetch();
                partsQuery.refetch();
              }}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AnalyticsSuite
      data={data}
      gearOptions={gearOptions}
      onAddFailure={addFailure}
      isSubmitting={isSubmitting}
      onFullResync={handleFullResync}
      isResyncing={isResyncing}
      lastSyncPass={lastSyncPass}
    />
  );
}
