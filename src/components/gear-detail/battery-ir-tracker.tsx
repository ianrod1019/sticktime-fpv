import { useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ListChecks,
  Lock,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { usePilot } from "@/hooks/use-pilot";
import { isProOrHigher } from "@/lib/role-verification";
import { IrEntryForm, IrAllPacksForm } from "./battery-ir-form";
import {
  useBatteryPacks,
  useIrReadings,
  gradeCell,
  type CellStatus,
  type IrReading,
  type IrReadingEdit,
} from "@/hooks/gear-item/use-battery-ir";
import type { GearItem } from "@/hooks/gear-item";

/**
 * Pro-gated per-pack LiPo IR tracking.
 * Data layer: hooks/gear-item/use-battery-ir.ts · Form: battery-ir-form.tsx
 */

function statusStyle(status: CellStatus): { label: string; className: string } {
  if (status === "high")
    return {
      label: "High",
      className: "border-destructive/40 text-destructive",
    };
  if (status === "elevated")
    return {
      label: "Elevated",
      className: "border-amber-500/40 text-amber-500",
    };
  return {
    label: "Healthy",
    className: "border-emerald-500/40 text-emerald-500",
  };
}

function formatDate(iso: string): string {
  return !iso
    ? "—"
    : new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

const readingAvg = (r: IrReading) =>
  r.ir_values.reduce((s, v) => s + v, 0) / r.ir_values.length;

/** All checks of one pack, newest first, with a per-check edit affordance. */
function PackHistory({
  packNumber,
  readings,
  cells,
  isSaving,
  onUpdate,
  onDelete,
}: {
  packNumber: number;
  readings: IrReading[];
  cells: number;
  isSaving: boolean;
  onUpdate: (edit: IrReadingEdit) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (readings.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        No IR checks for pack {packNumber} yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {readings.map((r) => {
        const avg = readingAvg(r);
        const min = Math.min(...r.ir_values);
        const max = Math.max(...r.ir_values);
        const spread = min > 0 ? Math.round(((max - min) / min) * 100) : 0;

        if (editingId === r.id) {
          return (
            <li
              key={r.id}
              className="rounded-lg border border-primary/30 bg-primary/5 p-3"
            >
              <p className="text-xs font-semibold text-primary mb-2">
                Editing check from {formatDate(r.measured_at)}
              </p>
              <IrEntryForm
                key={r.id}
                cells={cells || r.ir_values.length}
                isSaving={isSaving}
                submitLabel="Save changes"
                initialIrValues={r.ir_values}
                initialCycleCount={r.pack_cycle_count}
                initialMeasuredAt={r.measured_at}
                onSubmit={(irValues, cycleCount, measuredAt) => {
                  onUpdate({
                    id: r.id,
                    irValues,
                    pack_cycle_count: cycleCount,
                    measured_at: measuredAt,
                  });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          );
        }

        return (
          <li
            key={r.id}
            className="rounded-lg border border-primary/10 bg-muted/30 px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                {formatDate(r.measured_at)}
              </span>
              <div className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="text-[10px] border-primary/30 text-primary"
                >
                  {r.pack_cycle_count != null
                    ? `${r.pack_cycle_count} cycles`
                    : "cycle n/a"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                  aria-label={`Edit IR reading from ${formatDate(r.measured_at)}`}
                  onClick={() => setEditingId(r.id)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete IR reading from ${formatDate(r.measured_at)}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete IR reading from {formatDate(r.measured_at)}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the IR check for pack {packNumber} from
                        your history and degradation trend. This action cannot
                        be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(r.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete reading
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.ir_values.map((v, i) => {
                const style = statusStyle(gradeCell(v, avg));
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded-md border bg-background/60 px-2 py-0.5 text-xs font-mono ${style.className}`}
                    title={`Cell ${i + 1}: ${style.label}`}
                  >
                    C{i + 1} {v.toFixed(1)} mΩ
                  </span>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Avg {avg.toFixed(2)} mΩ · spread {spread}% between cells
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function BatteryIrTracker({ item }: { item: GearItem }) {
  const { tier, role } = usePilot();
  const isPro = isProOrHigher(tier, role);
  const { packs } = useBatteryPacks(item.id);
  const {
    readings,
    isLoading,
    isError,
    addReadings,
    updateReading,
    deleteReading,
    isSaving,
  } = useIrReadings(item.id);
  const cells = item.cells && item.cells > 0 ? item.cells : 0;
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"single" | "all">("all");
  const [activePack, setActivePack] = useState<number | null>(null);
  const selectedPack = activePack ?? packs[0]?.pack_number ?? 0;

  // Latest reading per pack, used by the bulk form's pre-fill helper and by
  // the per-pack degradation badges.
  const latestByPack = useMemo(() => {
    const map: Record<number, IrReading | undefined> = {};
    for (const r of readings) {
      // readings are newest-first; first hit per pack is the latest.
      if (map[r.pack_number] == null) map[r.pack_number] = r;
    }
    return map;
  }, [readings]);

  // Readings grouped per pack for the always-visible all-packs history.
  const readingsByPack = useMemo(() => {
    const map: Record<number, IrReading[]> = {};
    for (const p of packs) map[p.pack_number] = [];
    for (const r of readings) {
      (map[r.pack_number] ??= []).push(r);
    }
    return map;
  }, [packs, readings]);

  // Set-wide degradation: first vs latest average across all packs.
  const degradation = useMemo(() => {
    if (readings.length < 2) return null;
    const first = readingAvg(readings[readings.length - 1]!);
    return first > 0
      ? Math.round(((readingAvg(readings[0]!) - first) / first) * 100)
      : null;
  }, [readings]);

  const handleLogAll = (
    rows: { packNumber: number; irValues: number[] }[],
    cycleCount: number | null,
    measuredAt: string,
  ) => {
    addReadings(
      rows.map((row) => ({
        batteryId: item.id,
        packNumber: row.packNumber,
        cells,
        irValues: row.irValues,
        cycleCount,
        measuredAt,
      })),
    );
    setShowForm(false);
  };

  if (!isPro) {
    return (
      <Card className="bg-card/50 border-primary/20 border-dashed">
        <CardContent className="p-6 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-3">
            <Lock className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            LiPo Internal Resistance Tracking
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Log per-cell IR values for each pack in the set and watch
            degradation over time. Available on the Pro tier.
          </p>
          <Button size="sm" variant="outline" className="mt-3" asChild>
            <a href="/">See what Pro unlocks</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary text-base">
          <Activity className="h-4 w-4" aria-hidden />
          Internal Resistance (IR) Tracking
          {degradation != null && (
            <Badge
              variant="outline"
              className={`ml-auto text-[10px] ${
                degradation > 20
                  ? "border-destructive/40 text-destructive"
                  : "border-primary/30 text-primary"
              }`}
            >
              {degradation > 0 ? `+${degradation}%` : `${degradation}%`} since
              first check
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {cells === 0 ? (
          <p className="text-xs text-muted-foreground">
            Set the cell count on this battery (Edit) to enable per-cell IR
            logging.
          </p>
        ) : !showForm ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowForm(true)}
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            Log IR reading
          </Button>
        ) : (
          <div className="space-y-2">
            {packs.length > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={mode === "all" ? "secondary" : "ghost"}
                  onClick={() => setMode("all")}
                >
                  All packs at once
                </Button>
                <Button
                  size="sm"
                  variant={mode === "single" ? "secondary" : "ghost"}
                  onClick={() => setMode("single")}
                >
                  Single pack
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setShowForm(false)}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  Close
                </Button>
              </div>
            )}
            {packs.length <= 1 || mode === "all" ? (
              <IrAllPacksForm
                packs={packs}
                cells={cells}
                isSaving={isSaving}
                latestByPack={latestByPack}
                onSubmit={handleLogAll}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Pack:</span>
                  {packs.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePack(p.pack_number)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selectedPack === p.pack_number
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-primary/10 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-primary"
                      }`}
                    >
                      Pack {p.pack_number}
                    </button>
                  ))}
                </div>
                <IrEntryForm
                  cells={cells}
                  isSaving={isSaving}
                  submitLabel="Log IR reading"
                  onSubmit={(irValues, cycleCount, measuredAt) => {
                    addReadings([
                      {
                        batteryId: item.id,
                        packNumber: selectedPack,
                        cells,
                        irValues,
                        cycleCount,
                        measuredAt,
                      },
                    ]);
                    setShowForm(false);
                  }}
                />
              </div>
            )}
          </div>
        )}

        <div className="border-t border-primary/10 pt-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-2">
              Loading history…
            </p>
          ) : isError ? (
            <p className="text-sm text-muted-foreground py-2">
              Couldn't load IR history — try refreshing.
            </p>
          ) : packs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No packs registered for this set yet.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {packs.map((p) => {
                const packReadings = readingsByPack[p.pack_number] ?? [];
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border border-primary/10 p-3"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        Pack {p.pack_number}
                      </h4>
                      <DegradationBadge readings={packReadings} />
                    </div>
                    <PackHistory
                      packNumber={p.pack_number}
                      readings={packReadings}
                      cells={cells}
                      isSaving={isSaving}
                      onUpdate={(args) => updateReading(args)}
                      onDelete={deleteReading}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DegradationBadge({ readings }: { readings: IrReading[] }) {
  const degradation = useMemo(() => {
    if (readings.length < 2) return null;
    const first = readingAvg(readings[readings.length - 1]!);
    return first > 0
      ? Math.round(((readingAvg(readings[0]!) - first) / first) * 100)
      : null;
  }, [readings]);
  if (degradation == null) return null;
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${
        degradation > 20
          ? "border-destructive/40 text-destructive"
          : "border-primary/30 text-primary"
      }`}
    >
      {degradation > 0 ? `+${degradation}%` : `${degradation}%`}
    </Badge>
  );
}
