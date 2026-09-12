import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";

/**
 * Data layer for per-pack LiPo internal-resistance tracking.
 *
 * A battery "set" (personal_gear.batteries row) contains physical packs
 * (personal_gear.battery_packs, one row per pack_number). IR readings
 * (personal_gear.battery_ir_readings) key on (battery_id, pack_number):
 * ir_values holds one milliohm value per cell, index 0 = cell 1.
 */

const IR_TABLE = "battery_ir_readings";
const PACKS_TABLE = "battery_packs";

export interface BatteryPack {
  id: string;
  gear_id: string;
  pack_number: number;
  total_cycles: number | null;
}

export interface IrReading {
  id: string;
  battery_id: string;
  pack_number: number;
  cells: number;
  ir_values: number[];
  pack_cycle_count: number | null;
  measured_at: string;
}

export interface IrReadingInput {
  batteryId: string;
  packNumber: number;
  cells: number;
  irValues: number[];
  cycleCount: number | null;
  measuredAt: string;
}

export interface IrReadingEdit {
  id: string;
  irValues: number[];
  pack_cycle_count: number | null;
  measured_at: string;
}

export type CellStatus = "healthy" | "elevated" | "high";

/** Health graded relative to the pack's own average — no invented absolute thresholds. */
export function gradeCell(value: number, packAvg: number): CellStatus {
  const delta = packAvg > 0 ? (value - packAvg) / packAvg : 0;
  if (delta > 0.2) return "high";
  if (delta > 0.1) return "elevated";
  return "healthy";
}

function mapPack(row: Record<string, unknown> | null): BatteryPack | null {
  if (!row || typeof row["id"] !== "string") return null;
  const packNumber = Number(row["pack_number"]);
  if (!Number.isInteger(packNumber) || packNumber <= 0) return null;
  return {
    id: row["id"],
    gear_id: String(row["gear_id"] ?? ""),
    pack_number: packNumber,
    total_cycles:
      row["total_cycles"] == null ? null : Number(row["total_cycles"]),
  };
}

function mapReading(row: Record<string, unknown> | null): IrReading | null {
  if (!row || typeof row["id"] !== "string") return null;
  const nums = (Array.isArray(row["ir_values"]) ? row["ir_values"] : [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  return {
    id: row["id"],
    battery_id: String(row["battery_id"] ?? ""),
    pack_number: Number(row["pack_number"]) || 1,
    cells: Number(row["cells"]) || nums.length,
    ir_values: nums,
    pack_cycle_count:
      row["pack_cycle_count"] == null ? null : Number(row["pack_cycle_count"]),
    measured_at: String(row["measured_at"] ?? ""),
  };
}

export function useBatteryPacks(batteryId: string) {
  const { profile } = usePilot();
  const query = useQuery({
    queryKey: ["battery-packs", profile?.id ?? null, batteryId],
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: PACKS_TABLE,
        operation: "select",
        selectColumns: "id,gear_id,pack_number,total_cycles",
        filters: { gear_id: batteryId },
        orderBy: { column: "pack_number", ascending: true },
      });
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as Record<
        string,
        unknown
      >[];
      return rows.map(mapPack).filter((p): p is BatteryPack => p !== null);
    },
    enabled: !!batteryId && !!profile?.id,
    staleTime: 30_000,
  });
  return { packs: query.data ?? [], isLoading: query.isLoading };
}

export function useIrReadings(batteryId: string) {
  const queryClient = useQueryClient();
  const { profile } = usePilot();

  const query = useQuery({
    queryKey: ["battery-ir", profile?.id ?? null, batteryId],
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: IR_TABLE,
        operation: "select",
        selectColumns: "*",
        filters: { battery_id: batteryId },
        orderBy: { column: "measured_at", ascending: false },
      });
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as Record<
        string,
        unknown
      >[];
      return rows.map(mapReading).filter((r): r is IrReading => r !== null);
    },
    enabled: !!batteryId && !!profile?.id,
    staleTime: 30_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["battery-ir", profile?.id ?? null, batteryId] });

  // One multi-row insert = one request, one toast, all-or-nothing save.
  const addMutation = useMutation({
    mutationFn: async (inputs: IrReadingInput[]) => {
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: IR_TABLE,
        operation: "insert",
        data: inputs.map((input) => ({
          battery_id: input.batteryId,
          pack_number: input.packNumber,
          cells: input.cells,
          ir_values: input.irValues,
          pack_cycle_count: input.cycleCount,
          measured_at: input.measuredAt,
        })),
      });
      if (error) throw error;
    },
    onSuccess: (_data, inputs) => {
      invalidate();
      toast.success(
        inputs.length === 1
          ? "IR reading saved"
          : `${inputs.length} IR readings saved`,
      );
    },
    onError: (e: Error) =>
      toast.error(e.message || "Could not save IR readings"),
  });

  const updateMutation = useMutation({
    mutationFn: async (edit: IrReadingEdit) => {
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: IR_TABLE,
        operation: "update",
        data: {
          ir_values: edit.irValues,
          pack_cycle_count: edit.pack_cycle_count,
          measured_at: edit.measured_at,
        },
        filters: { id: edit.id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("IR reading updated");
    },
    onError: (e: Error) =>
      toast.error(e.message || "Could not update IR reading"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (readingId: string) => {
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: IR_TABLE,
        operation: "delete",
        filters: { id: readingId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("IR reading deleted");
    },
    onError: (e: Error) =>
      toast.error(e.message || "Could not delete IR reading"),
  });

  return {
    readings: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    addReadings: (inputs: IrReadingInput[]) =>
      addMutation.mutateAsync(inputs).then(() => true),
    updateReading: (edit: IrReadingEdit) =>
      updateMutation.mutateAsync(edit).then(() => true),
    deleteReading: (readingId: string) =>
      deleteMutation.mutateAsync(readingId).then(() => true),
    isSaving:
      addMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
  };
}
