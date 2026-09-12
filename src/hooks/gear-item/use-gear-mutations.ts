import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";
import { getGearTable, type GearType } from "./use-gear-item";
import { getPartsTable } from "./use-gear-parts";
import type { BatteryVoltageFields } from "@/lib/battery-voltages";

export interface UpdateGearInput extends BatteryVoltageFields {
  name?: string;
  brand?: string | null;
  service_interval_minutes?: number;
  purchase_cost?: number;
}

export interface ServiceInput {
  cost: number;
  description: string;
  /** Optional inventory item to record on the gear's parts table. */
  part?: { name: string; category: string } | undefined;
}

async function updateGearRecord(
  type: GearType,
  uuid: string,
  input: UpdateGearInput,
) {
  const payload: Record<string, unknown> = {
    ...input,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: getGearTable(type),
    operation: "update",
    data: payload,
    filters: { id: uuid },
    single: true,
  });
  if (error) throw error;
}

/**
 * Logs a completed service: records a maintenance-log entry (what + cost),
 * saves the note on the gear record and resets the minutes-since-service
 * clock. Flight time (total_minutes) is never touched.
 */
async function serviceGearRecord(
  type: GearType,
  uuid: string,
  input: ServiceInput,
  userId: string | null,
) {
  const now = new Date().toISOString();

  const { error: logError } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: "maintenance_logs",
    operation: "insert",
    data: {
      ...(userId ? { user_id: userId } : {}),
      gear_id: uuid,
      description: input.description,
      cost: input.cost,
      reset_service_clock: true,
      performed_on: now,
    },
    single: true,
  });
  if (logError) throw logError;

  const { error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: getGearTable(type),
    operation: "update",
    data: {
      minutes_since_service: 0,
      last_service_notes: input.description,
      updated_at: now,
    },
    filters: { id: uuid },
    single: true,
  });
  if (error) throw error;

  // Optional inventory item: record it on the gear's own parts table so it
  // shows up under Installed Parts. Tables without lifespan/spare columns
  // (goggles_parts) get a minimal payload.
  const partsTable = getPartsTable(type);
  if (input.part && partsTable) {
    const partPayload: Record<string, unknown> = {
      gear_id: uuid,
      name: input.part.name,
      category: input.part.category,
    };
    if (partsTable !== "goggles_parts") {
      partPayload["lifespan_minutes"] = 0;
      partPayload["spare_count"] = 0;
    }
    const { error: partError } = await db_request({
      mode: "query",
      schema: "personal_gear",
      table: partsTable,
      operation: "insert",
      data: partPayload,
      single: true,
    });
    if (partError) throw partError;
  }
}

async function deleteGearRecord(type: GearType, uuid: string) {
  const { error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: getGearTable(type),
    operation: "delete",
    filters: { id: uuid },
  });
  if (error) throw error;
}

export function useGearMutations(type: string, uuid: string) {
  const queryClient = useQueryClient();
  const { profile } = usePilot();
  const validType = type as GearType;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["gear-item", validType, uuid] });
    queryClient.invalidateQueries({ queryKey: ["gear-logs"] });
    queryClient.invalidateQueries({ queryKey: ["gear-parts"] });
    queryClient.invalidateQueries({ queryKey: ["hanger"] });
  };

  const updateGear = useMutation({
    mutationFn: (input: UpdateGearInput) =>
      updateGearRecord(validType, uuid, input),
    onSuccess: () => {
      invalidate();
      toast.success("Gear updated");
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });

  const serviceGear = useMutation({
    mutationFn: (input: ServiceInput) =>
      serviceGearRecord(validType, uuid, input, profile?.id ?? null),
    onSuccess: () => {
      invalidate();
      toast.success("Service logged — clock reset");
    },
    onError: (e: Error) => toast.error(e.message || "Service logging failed"),
  });

  const deleteGear = useMutation({
    mutationFn: () => deleteGearRecord(validType, uuid),
    onSuccess: () => {
      invalidate();
      toast.success("Gear removed from the hanger");
    },
    onError: (e: Error) => toast.error(e.message || "Delete failed"),
  });

  return {
    updateGear,
    serviceGear,
    deleteGear,
    isMutating:
      updateGear.isPending || serviceGear.isPending || deleteGear.isPending,
  };
}
