/**
 * Firmware compliance UI — fleet matrix, drift queue, digital twin,
 * ingest panel, work-order stepper, and the AD board. Reads are RLS-
 * scoped; every mutation goes through the firmware_* RPC hooks.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck, ShieldAlert, GitCompareArrows } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAdvanceWorkOrder,
  useAirframeComponents,
  useConfigSnapshots,
  useDirectives,
  useDriftEvents,
  useFirmwareAirframes,
  useFirmwareRegistry,
  useIngestConfigSnapshot,
  usePublishDirective,
  useRecordFlash,
  useResolveDrift,
  useVerifyAuditChain,
  useWorkOrderSteps,
  useWorkOrders,
  type AdvanceInput,
} from "@/hooks/firmware/use-firmware";
import type {
  AirframeComponent,
  ComponentClass,
  ConfigSnapshot,
  DriftEvent,
  DriftSeverity,
  FirmwareAirframe,
  IngestFormat,
  LifecycleStatus,
  WorkOrder,
  WorkOrderStep,
} from "@/types/firmware";

/* ------------------------------------------------------------- constants */

const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  active: "Active",
  maintenance: "Maintenance",
  grounded: "Grounded",
  decommissioned: "Decommissioned",
};

const SEVERITY_BADGE: Record<
  DriftSeverity,
  { label: string; variant: "secondary" | "default" | "destructive" }
> = {
  critical_safety: { label: "Critical / safety", variant: "destructive" },
  operational: { label: "Operational", variant: "default" },
  informational: { label: "Informational", variant: "secondary" },
};

const canManage = (role: string | undefined) => role !== undefined && role !== "pilot";

/* --------------------------------------------------------- fleet overview */

export function FleetComplianceOverview({
  orgId,
  myRole,
}: {
  orgId: string;
  myRole: string | undefined;
}) {
  const { data: airframes, isLoading, error, refetch } = useFirmwareAirframes(orgId);
  const airframeIds = useMemo(() => (airframes ?? []).map((a) => a.id), [airframes]);
  const { data: components } = useAirframeComponents(airframeIds);
  const { data: drift } = useDriftEvents(orgId);
  const { data: workOrders } = useWorkOrders(orgId);
  const { data: registry } = useFirmwareRegistry();
  const { data: chain, isLoading: chainLoading } = useVerifyAuditChain(orgId);

  if (isLoading) return <LoadingCard label="Loading fleet compliance…" />;
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fleet compliance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The firmware module backend may not be migrated yet. Ask your admin
            to apply the firmware schema.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rows = (airframes ?? []).map((af) => {
    const comps = (components ?? []).filter(
      (c) => c.airframe_id === af.id && c.lifecycle_status === "active",
    );
    const openCritical = (drift ?? []).some(
      (d) =>
        d.airframe_id === af.id &&
        d.severity === "critical_safety" &&
        (d.drift_status === "open" || d.drift_status === "acknowledged"),
    );
    const openWork = (workOrders ?? []).some(
      (w) =>
        w.airframe_id === af.id &&
        (w.status === "open" || w.status === "in_progress" || w.status === "awaiting_safety_review"),
    );
    return { af, comps, openCritical, openWork };
  });

  const groundedCount = rows.filter((r) => r.af.lifecycle_status === "grounded").length;
  const driftCritical = (drift ?? []).filter(
    (d) => d.severity === "critical_safety" && (d.drift_status === "open" || d.drift_status === "acknowledged"),
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Airframes" value={rows.length} />
        <Metric label="Grounded" value={groundedCount} tone={groundedCount > 0 ? "danger" : "ok"} />
        <Metric label="Critical drift" value={driftCritical} tone={driftCritical > 0 ? "danger" : "ok"} />
        <Metric
          label="Audit chain"
          value={chainLoading ? "…" : chain?.ok ? `${chain.events} ok` : "BROKEN"}
          tone={chainLoading ? "neutral" : chain?.ok ? "ok" : "danger"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Fleet compliance matrix
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No airframes registered in the firmware module yet. Add one below.
            </p>
          )}
          {rows.map(({ af, comps, openCritical, openWork }) => (
            <AirframeRow
              key={af.id}
              af={af}
              comps={comps}
              openCritical={openCritical}
              openWork={openWork}
              releases={registry?.releases ?? []}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "ok" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "ok"
        ? "text-emerald-400"
        : "text-foreground";
  return (
    <div className="hud-panel p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-display text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function AirframeRow({
  af,
  comps,
  openCritical,
  openWork,
  releases,
}: {
  af: FirmwareAirframe;
  comps: AirframeComponent[];
  openCritical: boolean;
  openWork: boolean;
  releases: { id: string; version: string; release_status: string }[];
}) {
  const tone =
    af.lifecycle_status === "grounded" || openCritical
      ? "border-destructive/40 bg-destructive/[0.04]"
      : openWork
        ? "border-amber-500/40 bg-amber-500/[0.04]"
        : "border-primary/20";
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{af.name}</span>
        <Badge
          variant={af.lifecycle_status === "grounded" ? "destructive" : af.lifecycle_status === "active" ? "secondary" : "default"}
        >
          {LIFECYCLE_LABELS[af.lifecycle_status]}
        </Badge>
        {openCritical && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> critical drift
          </Badge>
        )}
        {openWork && <Badge variant="default">work order open</Badge>}
        {af.registration_id && (
          <span className="font-mono text-[10px] text-muted-foreground">
            reg {af.registration_id}
          </span>
        )}
      </div>
      {comps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {comps.map((c) => {
            const rel = releases.find((r) => r.id === c.installed_release_id);
            const blacklisted = rel?.release_status === "blacklisted";
            return (
              <span key={c.id} className="font-mono text-[10px] text-muted-foreground">
                {c.component_class.replace(/_/g, " ")}:{" "}
                <span className={blacklisted ? "text-destructive" : "text-foreground"}>
                  {rel ? `${rel.version}${blacklisted ? " (BLACKLISTED)" : ""}` : "—"}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="hud-panel p-8 text-center text-sm text-muted-foreground">{label}</div>
  );
}

/* --------------------------------------------------------------- drift UI */

export function DriftQueue({ orgId, myRole }: { orgId: string; myRole: string | undefined }) {
  const { data: drift, isLoading } = useDriftEvents(orgId);
  const resolve = useResolveDrift();
  const [filter, setFilter] = useState<DriftSeverity | "all">("all");

  const open = (drift ?? []).filter(
    (d) => d.drift_status === "open" || d.drift_status === "acknowledged",
  );
  const visible = open.filter((d) => filter === "all" || d.severity === filter);
  const manage = canManage(myRole);

  const act = async (
    d: DriftEvent,
    status: "acknowledged" | "cleared" | "suppressed",
  ) => {
    try {
      await resolve.mutateAsync({ driftId: d.id, status });
      toast.success(`Drift ${status}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update drift.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4" /> Configuration drift queue
        </CardTitle>
        <Select value={filter} onValueChange={(v) => setFilter(v as DriftSeverity | "all")}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical_safety">Critical / safety</SelectItem>
            <SelectItem value="operational">Operational</SelectItem>
            <SelectItem value="informational">Informational</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <LoadingCard label="Loading drift…" />}
        {!isLoading && visible.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No open drift — every ingested configuration matches its golden baseline.
          </p>
        )}
        {visible.map((d) => (
          <div
            key={d.id}
            className={`rounded-lg border p-3 ${
              d.severity === "critical_safety"
                ? "border-destructive/40 bg-destructive/[0.04]"
                : ""
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={SEVERITY_BADGE[d.severity].variant}>
                {SEVERITY_BADGE[d.severity].label}
              </Badge>
              <span className="font-mono text-xs">{d.field_path}</span>
              <span className="text-xs text-muted-foreground">
                {formatValue(d.old_value)} → {formatValue(d.new_value)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => act(d, "acknowledged")}>
                Acknowledge
              </Button>
              {manage && (
                <>
                  <Button size="sm" variant="outline" onClick={() => act(d, "cleared")}>
                    Clear
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act(d, "suppressed")}>
                    Suppress
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "(absent)";
  return typeof v === "string" ? `"${v}"` : String(v);
}

/* ------------------------------------------------------------- digital twin */

export function AirframeDigitalTwin({
  orgId,
  myRole,
}: {
  orgId: string;
  myRole: string | undefined;
}) {
  const { data: airframes } = useFirmwareAirframes(orgId);
  const [selected, setSelected] = useState<string | null>(null);
  const af = (airframes ?? []).find((a) => a.id === selected) ?? airframes?.[0];
  const airframeIds = af ? [af.id] : [];

  const { data: components } = useAirframeComponents(airframeIds);
  const { data: registry } = useFirmwareRegistry();
  const { data: snapshots } = useConfigSnapshots(airframeIds);

  if (!af) return <LoadingCard label="No airframe selected." />;
  const relById = new Map((registry?.releases ?? []).map((r) => [r.id, r]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Airframe digital twin</CardTitle>
        <Select value={af.id} onValueChange={(v) => setSelected(v)}>
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(airframes ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge
            variant={af.lifecycle_status === "grounded" ? "destructive" : "secondary"}
          >
            {LIFECYCLE_LABELS[af.lifecycle_status]}
          </Badge>
          {af.grounded_reason && (
            <span className="text-xs text-destructive">{af.grounded_reason}</span>
          )}
          {af.chassis_type && (
            <span className="font-mono text-[10px] text-muted-foreground">
              chassis {af.chassis_type}
            </span>
          )}
          {af.manufacturer_serial && (
            <span className="font-mono text-[10px] text-muted-foreground">
              serial {af.manufacturer_serial}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {(components ?? []).map((c) => (
            <ComponentRow key={c.id} c={c} release={c.installed_release_id ? relById.get(c.installed_release_id) : undefined} />
          ))}
          {(components ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No components registered yet.</p>
          )}
        </div>

        <SnapshotList snapshots={snapshots ?? []} />
        <FlashPanel orgId={orgId} af={af} components={components ?? []} registry={registry} />
        <IngestPanel orgId={orgId} af={af} components={components ?? []} />
      </CardContent>
    </Card>
  );
}

function ComponentRow({
  c,
  release,
}: {
  c: AirframeComponent;
  release: { id: string; version: string; release_status: string; certified: boolean } | undefined;
}) {
  const blacklisted = release?.release_status === "blacklisted";
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 ${
        blacklisted ? "border-destructive/40" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium">
          {c.slot_label ?? c.component_class.replace(/_/g, " ")}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {[c.manufacturer, c.model, c.hardware_serial].filter(Boolean).join(" · ") || "no hardware id"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {release ? (
          <Badge variant={blacklisted ? "destructive" : release.release_status === "approved" ? "secondary" : "default"}>
            {release.version}
          </Badge>
        ) : (
          <Badge variant="outline">no firmware</Badge>
        )}
        {release?.certified && <Badge variant="secondary">certified</Badge>}
      </div>
    </div>
  );
}

function SnapshotList({ snapshots }: { snapshots: ConfigSnapshot[] }) {
  if (snapshots.length === 0) return null;
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Configuration history (latest 5)
      </p>
      <div className="space-y-1">
        {snapshots.slice(0, 5).map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <Badge variant={s.snapshot_kind === "golden" ? "default" : "outline"}>
              {s.snapshot_kind}
            </Badge>
            <span>{s.format}</span>
            <span>{s.field_count} fields</span>
            <span>sha {s.raw_sha256.slice(0, 8)}…</span>
            <span>{new Date(s.captured_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ flash panel */

function FlashPanel({
  orgId,
  af,
  components,
  registry,
}: {
  orgId: string;
  af: FirmwareAirframe;
  components: AirframeComponent[];
  registry: { families: { id: string; name: string }[]; targets: { id: string; family_id: string; target_key: string }[]; releases: { id: string; target_id: string; version: string; release_status: string }[] } | undefined;
}) {
  const flash = useRecordFlash();
  const [componentId, setComponentId] = useState<string>("");
  const [releaseId, setReleaseId] = useState<string>("");

  const release = registry?.releases.find((r) => r.id === releaseId);
  const flashable = components.filter((c) => c.lifecycle_status === "active");

  const go = async () => {
    if (!componentId || !releaseId) {
      toast.error("Pick a component and a target release.");
      return;
    }
    try {
      const res = await flash.mutateAsync({
        orgId,
        airframeId: af.id,
        componentId,
        toReleaseId: releaseId,
        flashStatus: "succeeded",
      });
      toast.success(
        res?.work_order_id
          ? "Flash recorded — sign-off work order created."
          : "Flash recorded.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Flash failed.");
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Record firmware flash
      </p>
      <div className="flex flex-wrap gap-2">
        <Select value={componentId} onValueChange={setComponentId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Component" /></SelectTrigger>
          <SelectContent>
            {flashable.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.slot_label ?? c.component_class.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={releaseId} onValueChange={setReleaseId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Target release" /></SelectTrigger>
          <SelectContent>
            {(registry?.releases ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id} disabled={r.release_status === "blacklisted"}>
                {r.version} ({r.release_status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={go} disabled={flash.isPending || release?.release_status === "blacklisted"}>
          Record flash
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        A successful version change creates the 4-step sign-off work order automatically.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- ingest panel */

function IngestPanel({
  orgId,
  af,
  components,
}: {
  orgId: string;
  af: FirmwareAirframe;
  components: AirframeComponent[];
}) {
  const ingest = useIngestConfigSnapshot(orgId);
  const [raw, setRaw] = useState("");
  const [format, setFormat] = useState<IngestFormat>("betaflight_cli");
  const [componentId, setComponentId] = useState<string>("");
  const [kind, setKind] = useState<"observed" | "golden">("observed");

  const go = async () => {
    if (!raw.trim()) {
      toast.error("Paste a configuration dump first.");
      return;
    }
    try {
      const res = await ingest.mutateAsync({
        orgId,
        teamId: af.team_id,
        airframeId: af.id,
        componentId: componentId || null,
        source: "cli_export",
        format,
        raw,
        kind,
      });
      const d = res.diff;
      if (res.grounded) {
        toast.error(
          `Critical drift: airframe GROUNDED (${d.critical} critical field(s), ${d.operational} operational).`,
        );
      } else if (d.changed > 0) {
        toast.warning(
          `Ingested — ${d.changed} changed field(s): ${d.critical} critical / ${d.operational} operational / ${d.informational} informational.`,
        );
      } else {
        toast.success(`Ingested — matches the golden baseline (${res.field_count} fields).`);
      }
      setRaw("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ingest failed.");
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Ingest configuration dump
      </p>
      <div className="flex flex-wrap gap-2">
        <Select value={format} onValueChange={(v) => setFormat(v as IngestFormat)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="betaflight_cli">Betaflight CLI</SelectItem>
            <SelectItem value="ardupilot_params">ArduPilot params</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
        <Select value={componentId} onValueChange={setComponentId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Airframe-level dump" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Airframe-level</SelectItem>
            {components.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.slot_label ?? c.component_class.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => setKind(v as "observed" | "golden")}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="observed">Observed</SelectItem>
            <SelectItem value="golden">Golden baseline</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={6}
        placeholder={'set failsafe = ON\nset p_roll = 45\nset osd_layout_0_pos = 32,100'}
        className="font-mono text-xs"
      />
      <Button size="sm" onClick={go} disabled={ingest.isPending}>
        {ingest.isPending ? "Ingesting…" : "Ingest & diff"}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------- work order board */

export function WorkOrderBoard({ orgId, myRole }: { orgId: string; myRole: string | undefined }) {
  const { data: workOrders, isLoading } = useWorkOrders(orgId);
  const woIds = useMemo(() => (workOrders ?? []).map((w) => w.id), [workOrders]);
  const { data: steps } = useWorkOrderSteps(woIds);
  const advance = useAdvanceWorkOrder();
  const manage = canManage(myRole);

  const go = async (input: AdvanceInput, label: string) => {
    try {
      await advance.mutateAsync(input);
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    }
  };

  const open = (workOrders ?? []).filter(
    (w) => w.status !== "approved" && w.status !== "cancelled",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-off work orders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <LoadingCard label="Loading work orders…" />}
        {!isLoading && open.length === 0 && (
          <p className="text-sm text-muted-foreground">No open work orders.</p>
        )}
        {open.map((w) => (
          <WorkOrderCard
            key={w.id}
            w={w}
            steps={(steps ?? []).filter((s) => s.work_order_id === w.id)}
            manage={manage}
            onAdvance={go}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function WorkOrderCard({
  w,
  steps,
  manage,
  onAdvance,
}: {
  w: WorkOrder;
  steps: WorkOrderStep[];
  manage: boolean;
  onAdvance: (input: AdvanceInput, label: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const pending = steps.find((s) => s.status === "pending");

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={w.status === "awaiting_safety_review" ? "default" : "secondary"}>
          {w.status.replace(/_/g, " ")}
        </Badge>
        <span className="text-xs font-medium">{w.work_order_kind.replace(/_/g, " ")}</span>
        <span className="text-[10px] text-muted-foreground">{w.justification}</span>
      </div>
      <ol className="space-y-1">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                s.status === "satisfied"
                  ? "bg-emerald-400"
                  : s.status === "rejected"
                    ? "bg-destructive"
                    : "bg-zinc-600"
              }`}
            />
            <span className="font-mono text-[10px]">{s.step_no}</span>
            <span>{s.step_kind.replace(/_/g, " ")}</span>
            <span className="text-[10px] text-muted-foreground">
              ({s.required_role === "safety_manager" ? "safety officer" : "technician"})
            </span>
            {s.status === "satisfied" && (
              <span className="text-[10px] text-emerald-400">
                ✓{s.acted_at ? ` ${new Date(s.acted_at).toLocaleString()}` : ""}
              </span>
            )}
          </li>
        ))}
      </ol>
      {pending && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="h-8 w-56 text-xs"
          />
          <Button
            size="sm"
            onClick={() =>
              onAdvance(
                { workOrderId: w.id, stepNo: pending.step_no, action: "satisfy", notes: notes || null },
                `Step ${pending.step_no} satisfied.`,
              )
            }
          >
            {pending.required_role === "safety_manager" ? "Approve" : "Sign"}
          </Button>
          {manage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onAdvance(
                  { workOrderId: w.id, stepNo: pending.step_no, action: "reject", notes: notes || null },
                  "Work order rejected.",
                )
              }
            >
              Reject
            </Button>
          )}
          {manage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onAdvance({ workOrderId: w.id, stepNo: 0, action: "cancel" }, "Work order cancelled.")
              }
            >
              Cancel WO
            </Button>
          )}
        </div>
      )}
      {w.status === "rejected" && (
        <p className="text-xs text-destructive">Rejected — see audit trail.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- AD board */

export function DirectiveBoard({ orgId, myRole }: { orgId: string; myRole: string | undefined }) {
  const { data: ads, isLoading } = useDirectives(orgId);
  const publish = usePublishDirective();
  const [ref, setRef] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scopeValue, setScopeValue] = useState("");
  const manage = canManage(myRole);

  const go = async () => {
    if (!ref.trim() || !title.trim() || !body.trim() || !scopeValue.trim()) {
      toast.error("Ref, title, body and a scope value are required.");
      return;
    }
    try {
      await publish.mutateAsync({
        orgId,
        ref: ref.trim(),
        title: title.trim(),
        body: body.trim(),
        matches: [{ scope_type: "firmware_release", scope_value: scopeValue.trim() }],
      });
      toast.success("Directive published — affected airframes are grounded.");
      setRef("");
      setTitle("");
      setBody("");
      setScopeValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Airworthiness directives
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <LoadingCard label="Loading directives…" />}
        {(ads ?? []).map((ad) => (
          <div key={ad.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={ad.is_active ? "destructive" : "outline"}>{ad.directive_ref}</Badge>
              <span className="text-sm font-medium">{ad.title}</span>
              {!ad.is_active && <span className="text-[10px] text-muted-foreground">inactive</span>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{ad.body}</p>
          </div>
        ))}
        {manage && (
          <div className="rounded-lg border border-dashed p-3 space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Publish directive (grounds matching airframes)
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ref e.g. AD-2026-001" />
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            </div>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Compliance instructions" rows={2} />
            <Input
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              placeholder="Match firmware release e.g. Betaflight 4.5.1"
            />
            <Button size="sm" onClick={go} disabled={publish.isPending}>Publish</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
