import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";
import type { Database } from "@/integrations/supabase/types";

export interface DronePart {
  id: string;
  name: string;
  category: string;
  minutes_used: number;
  lifespan_minutes: number;
  spare_count: number;
  installed_on: string;
  notes: string | null;
}

export interface DroneMaintenanceLog {
  id: string;
  description: string;
  cost: number | null;
  performed_on: string;
  reset_service_clock: boolean;
  created_at: string;
}

export interface DroneFlight {
  id: string;
  flown_on: string;
  duration_minutes: number;
  packs_flown: number;
  crashes: number;
  rating: number | null;
  battery_notes: string | null;
}

export interface DroneDetailData {
  item: Database["public"]["Tables"]["drones"]["Row"];
  parts: DronePart[];
  maintenanceLogs: DroneMaintenanceLog[];
  flights: DroneFlight[];
}

export interface UseDroneDetailResult {
  data: DroneDetailData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  canEdit: boolean;
  canDelete: boolean;
}

export function useDroneDetail(uuid: string): UseDroneDetailResult {
  const { profile, isAdminOrDev } = usePilot();

  const { data, error, isLoading } = useQuery<DroneDetailData | null>({
    queryKey: ["drone-detail", uuid],
    queryFn: async () => {
      if (!uuid) {
        return null;
      }

      const userId = profile?.id ?? null;
      if (!userId) {
        return null;
      }

      const { data: droneData, error: droneError } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "drones",
        operation: "select",
        selectColumns: "*",
        filters: { id: uuid },
        single: true,
      });

      if (droneError || !droneData) {
        return null;
      }

      let isAdmin = isAdminOrDev;
      if (!isAdmin && userId) {
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

      if (!isAdmin && userId && droneData.user_id !== userId) {
        return null;
      }

      const { data: partsData, error: partsError } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "drone_parts",
        operation: "select",
        selectColumns: "*",
        filters: { gear_id: uuid },
      });

      const parts: DronePart[] = partsError ? [] : (partsData || []);

      const { data: logsData, error: logsError } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "maintenance_logs",
        operation: "select",
        selectColumns: "*",
        filters: { gear_id: uuid },
        orderBy: { column: "performed_on", ascending: false },
      });

      const maintenanceLogs: DroneMaintenanceLog[] = logsError ? [] : (logsData || []);

      const { data: sessionsData, error: sessionsError } = await db_request({
        mode: "query",
        table: "sessions",
        operation: "select",
        selectColumns: "*",
        filters: { drone_id: uuid },
        orderBy: { column: "flown_on", ascending: false },
      });

      const flights: DroneFlight[] = sessionsError ? [] : (sessionsData || []);

      return {
        item: droneData,
        parts,
        maintenanceLogs,
        flights,
      };
    },
    enabled: !!uuid,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const canEdit = !!data && (profile?.id === data.item.user_id || false);
  const canDelete = !!data && (isAdminOrDev || false);

  return {
    data: data ?? null,
    isLoading,
    isError: !!error,
    error: error ?? null,
    canEdit,
    canDelete,
  };
}