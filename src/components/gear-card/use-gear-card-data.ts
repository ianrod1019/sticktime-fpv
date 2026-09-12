import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";
import type { GearPart, MaintenanceLog } from "./types";

/**
 * Lazy per-card data: parts and a paged slice of maintenance logs.
 *
 * The hanger no longer fetches every part/log row for the whole fleet up
 * front — each card fetches (and caches) its own slice when mounted, so
 * first paint only waits on the gear tables. Logs are server-paginated
 * (page 1 = newest 25) with a "load more" tail in the card.
 */

export const CARD_LOG_PAGE_SIZE = 25;

export function useGearCardData(gearId: string, gearType: string) {
  const { profile } = usePilot();
  const enabled = !!profile?.id && !!gearId;
  const partsTable = GEAR_PARTS_TABLES[gearType] ?? null;

  const partsQuery = useQuery({
    queryKey: ["gear-card-parts", profile?.id ?? null, gearId],
    queryFn: async (): Promise<GearPart[]> => {
      if (!partsTable) return [];
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: partsTable,
        operation: "select",
        selectColumns: "id,gear_id,name,category,lifespan_minutes",
        filters: { gear_id: gearId },
        orderBy: { column: "created_at", ascending: true },
      });
      if (error) throw error;
      return (data ?? []) as GearPart[];
    },
    enabled: enabled && !!partsTable,
    staleTime: 30_000,
  });

  const logsQuery = useQuery({
    queryKey: ["gear-card-logs", profile?.id ?? null, gearId],
    queryFn: async (): Promise<{ logs: MaintenanceLog[]; hasMore: boolean }> => {
      const { data, error, count } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "maintenance_logs",
        operation: "select",
        selectColumns: "id,gear_id,user_id,description,cost,performed_on,reset_service_clock",
        filters: { gear_id: gearId },
        orderBy: { column: "performed_on", ascending: false },
        pagination: { index: 0, size: CARD_LOG_PAGE_SIZE },
      });
      if (error) throw error;
      const logs = (data ?? []) as MaintenanceLog[];
      return { logs, hasMore: (count ?? logs.length) > CARD_LOG_PAGE_SIZE };
    },
    enabled: enabled && gearType !== "battery",
    staleTime: 30_000,
  });

  return {
    parts: partsQuery.data ?? [],
    logs: logsQuery.data?.logs ?? [],
    logsHaveMore: logsQuery.data?.hasMore ?? false,
    isLoading: partsQuery.isLoading || logsQuery.isLoading,
  };
}

/** Per-gear-type parts tables (quad hardware lives in the master inventory;
 * batteries have pack counts/IR readings, not parts). */
const GEAR_PARTS_TABLES: Record<string, string | null> = {
  quad: "drone_parts",
  battery: null,
  transmitter: "transmitter_parts",
  goggles: "goggles_parts",
  other: "other_parts",
};
