import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";
import {
  GEAR_REGISTRY,
  normalizeGearType,
  type GearTypeUi,
} from "@/lib/gear-registry";

export type GearType = GearTypeUi;

export const GEAR_TABLE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(GEAR_REGISTRY).map(([key, entry]) => [key, entry.table]),
) as Record<string, string>;

/**
 * Matches the LIVE personal_gear tables. Fields some tables lack are
 * optional: transmitters have no cells/connector/pack_count/crash_count,
 * goggles have no crash_count/pack_count/connector_type, and none of the
 * tables have a specs column (notes live in last_service_notes).
 */
export type DbGearItem = {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  service_interval_minutes: number;
  minutes_since_service: number;
  total_minutes: number;
  pack_count?: number;
  crash_count?: number;
  purchase_cost: number;
  purchase_date?: string | null;
  current_value?: number;
  cells?: number;
  connector_type?: string | null;
  /** Optional per-cell charging voltages (batteries only; NULL = assumed default). */
  storage_voltage_per_cell?: number | null;
  full_voltage_per_cell?: number | null;
  empty_voltage_per_cell?: number | null;
  last_service_notes?: string | null;
  retired?: boolean;
  created_at: string;
  updated_at: string;
};

export type GearItem = DbGearItem & { type: GearType };

export function isGearType(value: string): value is GearType {
  return value in GEAR_TABLE_MAP;
}

export function getGearTable(type: string): string {
  return GEAR_TABLE_MAP[type] ?? "";
}

const EMPTY_SPEC: Record<string, string> = {};

/** No specs column exists in the live schema; this always yields empty. */
export function normalizeSpecs(
  specs: Record<string, string> | null | undefined,
): Record<string, string> {
  if (!specs || typeof specs !== "object") return EMPTY_SPEC;
  return Object.fromEntries(
    Object.entries(specs)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
}

async function verifyAdminRole(userId: string): Promise<boolean> {
  const { data } = await db_request({
    mode: "query",
    table: "profiles",
    operation: "select",
    selectColumns: "role",
    filters: { id: userId },
    head: true,
  });
  const role = (data as { role?: string } | null)?.role?.toLowerCase();
  return role === "admin" || role === "dev";
}

async function fetchGearItem(
  type: GearType,
  uuid: string,
  userId: string | undefined,
  isAdminOrDev: boolean,
): Promise<GearItem | null> {
  const { data, error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: getGearTable(type),
    operation: "select",
    selectColumns: "*",
    filters: { id: uuid },
    single: true,
  });

  if (error || !data) return null;

  // Session-permission check: owner or elevated role only. RLS already
  // prevents cross-user reads at the database level; this guards the client.
  if (!isAdminOrDev && userId && data.user_id !== userId) {
    return null;
  }

  return { ...(data as DbGearItem), type };
}

export interface UseGearItemResult {
  item: GearItem | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  canEdit: boolean;
  canDelete: boolean;
}

export function useGearItem(type: string, uuid: string): UseGearItemResult {
  const { profile, isAdminOrDev } = usePilot();
  const validType = normalizeGearType(type);

  const query = useQuery<GearItem | null>({
    queryKey: ["gear-item", profile?.id ?? null, validType, uuid],
    queryFn: async () => {
      if (!validType || !uuid || !profile?.id) return null;
      return fetchGearItem(validType, uuid, profile.id, isAdminOrDev);
    },
    enabled: !!validType && !!uuid && !!profile?.id,
    staleTime: 30_000,
  });

  const item = query.data ?? null;
  const userId = profile?.id;

  return {
    item,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    canEdit: !!item && !!userId && item.user_id === userId,
    canDelete: !!item && !!userId && (item.user_id === userId || isAdminOrDev),
  };
}
