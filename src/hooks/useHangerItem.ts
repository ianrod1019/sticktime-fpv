import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import { supabase } from "@/integrations/supabase/client";
import { usePilot } from "@/hooks/use-pilot";
import type { Database } from "@/integrations/supabase/types";

const GEAR_TYPE_MAP: Record<string, { table: string; schema: string }> = {
  drone: { table: "drones", schema: "personal_gear" },
  battery: { table: "batteries", schema: "personal_gear" },
  goggles: { table: "goggles", schema: "personal_gear" },
  transmitter: { table: "transmitters", schema: "personal_gear" },
  other: { table: "other_gear", schema: "personal_gear" },
};

type GearType = keyof typeof GEAR_TYPE_MAP;

export interface HangerItem {
  id: string;
  user_id: string;
  name: string;
  brand?: string | null;
  cells?: number | null;
  connector_type?: string | null;
  crash_count: number;
  minutes_since_service: number;
  pack_count: number;
  purchase_cost: number;
  service_interval_minutes: number;
  total_minutes: number;
  created_at: string;
  updated_at: string;
  gear_type: string;
  notes?: string | null;
  // Drone-specific fields (optional for other gear types)
  frame?: string | null;
  motor_size?: string | null;
  motor_kv?: number | null;
  esc?: string | null;
  fc?: string | null;
  vtx?: string | null;
  receiver?: string | null;
}

export interface HangerItemResult {
  item: HangerItem | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  canEdit: boolean;
  canDelete: boolean;
}

export function useHangerItem(
  type: string,
  uuid: string,
): HangerItemResult {
  const { profile, isAdminOrDev } = usePilot();

  const { data, error, isLoading } = useQuery<HangerItem | null>({
    queryKey: ["hanger-item", type, uuid],
    queryFn: async () => {
      if (!type || !uuid) {
        return null;
      }

      const mapping = GEAR_TYPE_MAP[type as GearType];
      if (!mapping) {
        return null;
      }

      const { data: result, error: fetchError } = await db_request({
        mode: "query",
        schema: mapping.schema,
        table: mapping.table,
        operation: "select",
        selectColumns: "*",
        filters: { id: uuid },
        single: true,
      });

      if (fetchError || !result) {
        return null;
      }

      const userId = profile?.id ?? null;

      let isAdmin = false;
      if (userId) {
        const { data: profileData, error: profileError } = await db_request({
          mode: "query",
          table: "profiles",
          operation: "select",
          selectColumns: "role",
          filters: { id: userId },
          head: true,
        });

        if (!profileError && profileData) {
          const role = (profileData as { role?: string })?.role?.toLowerCase();
          isAdmin = role === "admin" || role === "dev";
        }
      }

      if (!isAdmin && userId && result.user_id !== userId) {
        return null;
      }

      return {
        ...result,
        gear_type: type,
      } as HangerItem;
    },
    enabled: !!type && !!uuid,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const canEdit = data !== null && data !== undefined && !!profile?.id && profile.id === data.user_id;
  const canDelete = data !== null && data !== undefined && (isAdminOrDev || false);

  return {
    item: data ?? null,
    isLoading,
    isError: !!error,
    error: error ?? null,
    canEdit,
    canDelete,
  };
}

export function getHangerTypeLabel(type: string): string {
  const labels: Record<GearType, string> = {
    drone: "Drone / Quad",
    battery: "Battery Set",
    goggles: "FPV Goggles",
    transmitter: "Controller / Radio",
    other: "Other Gear",
  };
  return labels[type as GearType] ?? type;
}

export function getHangerTypeColor(type: string): string {
  const colors: Record<GearType, string> = {
    drone: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    battery: "bg-green-500/20 text-green-400 border-green-500/30",
    goggles: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    transmitter: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    other: "bg-muted text-muted-foreground border-muted",
  };
  return (colors[type as GearType] ?? colors["other"]) as string;
}

export function getGearTypeDbTable(
  type: string,
): { table: string; schema: string } | null {
  return GEAR_TYPE_MAP[type as GearType] ?? null;
}