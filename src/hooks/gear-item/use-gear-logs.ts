import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";
import { getGearTable, isGearType, type GearType } from "./use-gear-item";
import { mapLogs, type GearLogResult } from "./log-types";

async function fetchLogs(gearType: GearType, uuid: string) {
  const { data, error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: "maintenance_logs",
    operation: "select",
    selectColumns: "*",
    filters: { gear_id: uuid },
    orderBy: { column: "performed_on", ascending: false },
  });
  if (error) throw error;
  return mapLogs(data);
}

export function useGearLogs(type: string, uuid: string): GearLogResult {
  const { profile } = usePilot();
  const validType = isGearType(type)
    ? type
    : getGearTable(type)
      ? (type as GearType)
      : null;

  const query = useQuery({
    queryKey: ["gear-logs", profile?.id ?? null, validType, uuid],
    queryFn: () => fetchLogs(validType!, uuid),
    enabled: !!validType && !!uuid && !!profile?.id,
    staleTime: 30_000,
  });

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
  };
}

export interface AddLogInput {
  type: GearType;
  uuid: string;
  userId: string;
  description: string;
  cost: number;
}

export async function addGearLog(input: AddLogInput): Promise<boolean> {
  const { error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: "maintenance_logs",
    operation: "insert",
    data: {
      user_id: input.userId,
      gear_id: input.uuid,
      description: input.description,
      cost: input.cost,
      reset_service_clock: false,
      performed_on: new Date().toISOString(),
    },
    single: true,
  });
  return !error;
}
