import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";
import type { GearType } from "./use-gear-item";

/**
 * Per-gear parts tables that actually exist in the live schema. Drones use
 * inter_drone/drone_parts (see use-drone-build); batteries have pack counts
 * instead of parts.
 */
const PARTS_TABLE_MAP: Partial<Record<GearType, string>> = {
  transmitter: "transmitter_parts",
  goggles: "goggles_parts",
  other: "other_parts",
};

export interface GearPartRow {
  id: string;
  user_id: string;
  gear_id: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  /** Present on transmitter_parts and other_parts only. */
  lifespan_minutes?: number;
  minutes_used?: number;
  spare_count?: number;
  created_at: string;
  updated_at: string;
}

export function getPartsTable(type: GearType): string | null {
  return PARTS_TABLE_MAP[type] ?? null;
}

export interface GearPartsResult {
  parts: GearPartRow[];
  isLoading: boolean;
  isError: boolean;
}

export function useGearParts(type: string, uuid: string): GearPartsResult {
  const { profile } = usePilot();
  const table = PARTS_TABLE_MAP[type as GearType] ?? null;

  const query = useQuery<GearPartRow[]>({
    queryKey: ["gear-parts", profile?.id ?? null, type, uuid],
    queryFn: async () => {
      if (!table || !uuid) return [];
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table,
        operation: "select",
        selectColumns: "*",
        filters: { gear_id: uuid },
        orderBy: { column: "created_at", ascending: true },
      });
      if (error || !data) return [];
      return data as GearPartRow[];
    },
    enabled: !!table && !!uuid && !!profile?.id,
    staleTime: 30_000,
  });

  return {
    parts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
