import { useMemo, useState } from "react";
import { ArrowDownUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Per-cell IR entry forms; input count scales with the pack's cell count. */

interface IrEntryFormProps {
  cells: number;
  isSaving: boolean;
  onSubmit: (
    irValues: number[],
    cycleCount: number | null,
    measuredAt: string,
  ) => void;
  /** Pre-fills the form with an existing reading for editing. */
  initialIrValues?: number[];
  initialCycleCount?: number | null;
  initialMeasuredAt?: string;
  submitLabel?: string;
  onCancel?: () => void;
}

export function IrEntryForm({
  cells,
  isSaving,
  onSubmit,
  initialIrValues,
  initialCycleCount = null,
  initialMeasuredAt,
  submitLabel = "Log IR reading",
  onCancel,
}: IrEntryFormProps) {
  const [values, setValues] = useState<string[]>(
    initialIrValues
      ? initialIrValues.slice(0, cells).map(String)
      : Array.from({ length: cells }, () => ""),
  );
  const [cycleCount, setCycleCount] = useState(
    initialCycleCount == null ? "" : String(initialCycleCount),
  );
  const [measuredAt, setMeasuredAt] = useState(
    initialMeasuredAt
      ? initialMeasuredAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  );

  const parsed = values.map((v) => Number(v));
  const allValid = parsed.every((n) => Number.isFinite(n) && n > 0);

  const handleSubmit = () => {
    if (!allValid || !measuredAt) return;
    onSubmit(
      parsed,
      cycleCount === "" ? null : Math.max(0, Number(cycleCount)),
      new Date(`${measuredAt}T12:00:00`).toISOString(),
    );
    setValues(Array.from({ length: cells }, () => ""));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {values.map((v, i) => (
          <div key={i} className="space-y-1">
            <Label htmlFor={`ir-cell-${i}`} className="text-xs">
              Cell {i + 1} (mΩ)
            </Label>
            <Input
              id={`ir-cell-${i}`}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              placeholder="e.g. 2.4"
              value={v}
              onChange={(e) =>
                setValues((prev) =>
                  prev.map((p, j) => (j === i ? e.target.value : p)),
                )
              }
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-sm">
        <div className="space-y-1">
          <Label htmlFor="ir-date" className="text-xs">
            Measured on
          </Label>
          <Input
            id="ir-date"
            type="date"
            value={measuredAt}
            onChange={(e) => setMeasuredAt(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ir-cycles" className="text-xs">
            Pack cycles
          </Label>
          <Input
            id="ir-cycles"
            type="number"
            min="0"
            placeholder="optional"
            value={cycleCount}
            onChange={(e) => setCycleCount(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!allValid || !measuredAt || isSaving}
        >
          <Plus className="h-3.5 w-3.5 mr-1" aria-hidden />
          {isSaving ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

interface IrAllPacksFormProps {
  packs: { pack_number: number }[];
  cells: number;
  isSaving: boolean;
  /** Latest reading per pack number, for the "copy from last check" helper. */
  latestByPack: Record<number, { ir_values: number[] } | undefined>;
  /** Submits one row per pack; every pack must have all cells filled. */
  onSubmit: (
    rows: { packNumber: number; irValues: number[] }[],
    cycleCount: number | null,
    measuredAt: string,
  ) => void;
}

/**
 * Log one IR check for every pack in the set from a single form —
 * one date + one cycle count shared by all packs, per-pack cell values.
 */
export function IrAllPacksForm({
  packs,
  cells,
  isSaving,
  latestByPack,
  onSubmit,
}: IrAllPacksFormProps) {
  const [measuredAt, setMeasuredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [cycleCount, setCycleCount] = useState("");
  const [valuesByPack, setValuesByPack] = useState<Record<number, string[]>>(
    () =>
      Object.fromEntries(
        packs.map((p) => [p.pack_number, Array(cells).fill("")]),
      ),
  );

  const rows = useMemo(
    () =>
      packs
        .map((p) => ({
          packNumber: p.pack_number,
          parsed: (valuesByPack[p.pack_number] ?? []).map((v) => Number(v)),
        }))
        .filter((r) => r.parsed.every((n) => Number.isFinite(n) && n > 0)),
    [packs, valuesByPack],
  );

  const canSubmit = rows.length === packs.length && packs.length > 0;

  const setValue = (packNumber: number, cellIdx: number, value: string) =>
    setValuesByPack((prev) => ({
      ...prev,
      [packNumber]: (prev[packNumber] ?? Array(cells).fill("")).map((v, j) =>
        j === cellIdx ? value : v,
      ),
    }));

  const copyFromPack = (from: number, to: number) =>
    setValuesByPack((prev) => ({
      ...prev,
      [to]: [...(prev[from] ?? [])],
    }));

  const copyFromLatest = () =>
    setValuesByPack((prev) => {
      const template =
        Object.values(latestByPack).find((r) => r != null) ?? undefined;
      if (!template) return prev;
      const next: Record<number, string[]> = { ...prev };
      for (const p of packs) {
        next[p.pack_number] = template.ir_values.slice(0, cells).map(String);
      }
      return next;
    });

  const handleSubmit = () => {
    if (!canSubmit || !measuredAt) return;
    onSubmit(
      rows.map((r) => ({ packNumber: r.packNumber, irValues: r.parsed })),
      cycleCount === "" ? null : Math.max(0, Number(cycleCount)),
      new Date(`${measuredAt}T12:00:00`).toISOString(),
    );
  };

  if (packs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No packs registered for this set yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {packs.map((p) => (
        <div
          key={p.pack_number}
          className="rounded-lg border border-primary/10 bg-muted/30 p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">
              Pack {p.pack_number}
            </span>
            {latestByPack[p.pack_number] && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={() => copyFromLatest()}
              >
                Pre-fill all from last check
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {(valuesByPack[p.pack_number] ?? Array(cells).fill("")).map(
              (v, i) => (
                <div key={i} className="space-y-1">
                  <Label
                    htmlFor={`ir-all-${p.pack_number}-${i}`}
                    className="text-xs"
                  >
                    Cell {i + 1} (mΩ)
                  </Label>
                  <Input
                    id={`ir-all-${p.pack_number}-${i}`}
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="e.g. 2.4"
                    value={v}
                    onChange={(e) => setValue(p.pack_number, i, e.target.value)}
                  />
                </div>
              ),
            )}
          </div>
          {packs.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ArrowDownUp className="h-3 w-3" aria-hidden /> Copy values from
                pack:
              </span>
              {packs
                .filter((other) => other.pack_number !== p.pack_number)
                .map((other) => (
                  <button
                    key={other.pack_number}
                    type="button"
                    onClick={() =>
                      copyFromPack(other.pack_number, p.pack_number)
                    }
                    className="rounded-full border border-primary/10 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    Pack {other.pack_number}
                  </button>
                ))}
            </div>
          )}
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2 max-w-sm">
        <div className="space-y-1">
          <Label htmlFor="ir-all-date" className="text-xs">
            Measured on
          </Label>
          <Input
            id="ir-all-date"
            type="date"
            value={measuredAt}
            onChange={(e) => setMeasuredAt(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ir-all-cycles" className="text-xs">
            Pack cycles (all packs)
          </Label>
          <Input
            id="ir-all-cycles"
            type="number"
            min="0"
            placeholder="optional"
            value={cycleCount}
            onChange={(e) => setCycleCount(e.target.value)}
          />
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={!canSubmit || !measuredAt || isSaving}
      >
        <Plus className="h-3.5 w-3.5 mr-1" aria-hidden />
        {isSaving
          ? "Saving…"
          : canSubmit
            ? `Log reading for all ${packs.length} packs`
            : `Fill all packs (${rows.length}/${packs.length} ready)`}
      </Button>
    </div>
  );
}
