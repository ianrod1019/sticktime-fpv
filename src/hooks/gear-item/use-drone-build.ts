import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";
import type { RemovalReason } from "@/lib/inventory";
import type { DbGearItem } from "./use-gear-item";

export interface DronePart {
  id: string;
  user_id: string | null;
  category: string;
  name: string;
  brand: string | null;
  status: string | null;
  specs: Record<string, string> | null;
}

export interface InstalledPart {
  link_id: string;
  quantity: number;
  installed_at: string;
  part: DronePart;
}

export interface BuildSummary {
  totalParts: number;
  byCategory: Record<string, number>;
}

export function summarizeBuild(parts: InstalledPart[]): BuildSummary {
  const byCategory: Record<string, number> = {};
  for (const { part, quantity } of parts) {
    byCategory[part.category] = (byCategory[part.category] ?? 0) + quantity;
  }
  return { totalParts: parts.length, byCategory };
}

// drone_part_installs carries user_id; inserts/updates run through db_request
// for automatic ownership injection. Read-only embeds use PostgREST directly.
const INSTALLS = supabase
  .schema("personal_gear")
  .from("drone_part_installs");

async function fetchItem(uuid: string): Promise<DbGearItem | null> {
  const { data, error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: "drones",
    operation: "select",
    selectColumns: "*",
    filters: { id: uuid },
    single: true,
  });
  return error || !data ? null : (data as DbGearItem);
}

async function fetchInstalledParts(uuid: string): Promise<InstalledPart[]> {
  // Only OPEN installs (uninstalled_at IS NULL) belong on the build sheet.
  const { data, error } = await INSTALLS.select(
    "id, quantity, installed_at, part:drone_parts(*)",
  )
    .eq("drone_id", uuid)
    .is("uninstalled_at", null)
    .order("installed_at", { ascending: false });

  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    link_id: String(row["id"]),
    quantity: Number(row["quantity"] ?? 1),
    installed_at: String(row["installed_at"] ?? ""),
    part: row["part"] as DronePart,
  }));
}

export interface DroneBuildResult {
  item: DbGearItem | null;
  installedParts: InstalledPart[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useDroneBuild(uuid: string): DroneBuildResult {
  const { profile } = usePilot();
  const query = useQuery<{
    item: DbGearItem;
    installedParts: InstalledPart[];
  } | null>({
    queryKey: ["drone-build", profile?.id ?? null, uuid],
    queryFn: async () => {
      if (!uuid) return null;
      const item = await fetchItem(uuid);
      if (!item) return null;
      const installedParts = await fetchInstalledParts(uuid);
      return { item, installedParts };
    },
    enabled: !!uuid && !!profile?.id,
    staleTime: 30_000,
  });

  return {
    item: query.data?.item ?? null,
    installedParts: query.data?.installedParts ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
  };
}

export interface LinkPartInput {
  droneId: string;
  partId: string;
  quantity: number;
}

export async function createPart(input: {
  category: string;
  name: string;
  brand?: string | null;
  purchase_cost?: number | null;
  purchase_date?: string | null;
  vendor?: string | null;
}): Promise<{ part: DronePart | null; error: string | null }> {
  // user_id is injected automatically by db_request (admins included).
  const { data, error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: "drone_parts",
    operation: "insert",
    data: {
      category: input.category,
      name: input.name,
      brand: input.brand ?? null,
      purchase_cost: input.purchase_cost ?? null,
      purchase_date: input.purchase_date ?? null,
      vendor: input.vendor ?? null,
      status: "shelf",
    },
    single: true,
  });
  return {
    part: error ? null : (data as DronePart),
    error: error?.message ?? null,
  };
}

export async function linkPartToDrone(input: LinkPartInput): Promise<boolean> {
  // db_request injects user_id (drone_part_installs requires it for RLS).
  const { error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: "drone_part_installs",
    operation: "insert",
    data: {
      drone_id: input.droneId,
      part_id: input.partId,
      quantity: Math.max(1, input.quantity),
    },
    single: true,
  });
  return !error;
}

export async function unlinkPartFromDrone(
  linkId: string,
  reason: RemovalReason = "maintenance",
): Promise<boolean> {
  // Update keeps the history row (sets uninstalled_at) and the status-sync
  // trigger restores the part's shelf/broken status.
  const { error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: "drone_part_installs",
    operation: "update",
    data: {
      uninstalled_at: new Date().toISOString(),
      removal_reason: reason,
    },
    filters: { id: linkId },
    single: true,
  });
  return !error;
}
