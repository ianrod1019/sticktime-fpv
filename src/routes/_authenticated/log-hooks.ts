import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db_request, type DbRequestResult } from "@/lib/db_request";
import { type GearItem } from "@/components/gear-card/types";
import { type SessionRow } from "@/lib/fpv";

export function useLogData() {
  const queryClient = useQueryClient();

  const dataQuery = useQuery({
    queryKey: ["log-data"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user?.id;

      if (!user) {
        return { sessions: [], gear: [] as GearItem[] };
      }

      const [
        sessions,
        batteriesRes,
        dronesRes,
        transmittersRes,
        gogglesRes,
        otherRes,
      ]: [
        { data: SessionRow[] | null; error: Error | null },
        DbRequestResult<GearItem[]>,
        DbRequestResult<GearItem[]>,
        DbRequestResult<GearItem[]>,
        DbRequestResult<GearItem[]>,
        DbRequestResult<GearItem[]>,
      ] = await Promise.all([
        db_request({
          mode: "query",
          schema: "public",
          table: "sessions",
          operation: "select",
          selectColumns: "*",
          orderBy: { column: "flown_on", ascending: false },
          limit: 400,
          filters: { user_id: user },
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "batteries",
          operation: "select",
          selectColumns:
            "id,user_id,name,brand,service_interval_minutes,total_minutes,minutes_since_service,pack_count,crash_count",
          filters: { user_id: user },
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "drones",
          operation: "select",
          selectColumns:
            "id,user_id,name,brand,service_interval_minutes,total_minutes,minutes_since_service,pack_count,crash_count",
          filters: { user_id: user },
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "transmitters",
          operation: "select",
          selectColumns:
            "id,user_id,name,brand,service_interval_minutes,total_minutes,minutes_since_service,pack_count,crash_count",
          filters: { user_id: user },
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "goggles",
          operation: "select",
          selectColumns:
            "id,user_id,name,brand,service_interval_minutes,total_minutes,minutes_since_service,pack_count,crash_count",
          filters: { user_id: user },
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "other_gear",
          operation: "select",
          selectColumns:
            "id,user_id,name,brand,service_interval_minutes,total_minutes,minutes_since_service,pack_count,crash_count",
          filters: { user_id: user },
        }),
      ]);

      const gear = [
        ...(batteriesRes.data ?? []).map((g) => ({
          ...g,
          gear_type: "battery" as const,
          cells: null,
          connector_type: null,
          purchase_cost: undefined,
          created_at: undefined,
          last_service_notes: null,
        })),
        ...(dronesRes.data ?? []).map((g) => ({
          ...g,
          gear_type: "quad" as const,
          cells: null,
          connector_type: null,
          purchase_cost: undefined,
          created_at: undefined,
          last_service_notes: null,
        })),
        ...(transmittersRes.data ?? []).map((g) => ({
          ...g,
          gear_type: "transmitter" as const,
          cells: null,
          connector_type: null,
          purchase_cost: undefined,
          created_at: undefined,
          last_service_notes: null,
        })),
        ...(gogglesRes.data ?? []).map((g) => ({
          ...g,
          gear_type: "goggles" as const,
          cells: null,
          connector_type: null,
          purchase_cost: undefined,
          created_at: undefined,
          last_service_notes: null,
        })),
        ...(otherRes.data ?? []).map((g) => ({
          ...g,
          gear_type: "other" as const,
          cells: null,
          connector_type: null,
          purchase_cost: undefined,
          created_at: undefined,
          last_service_notes: null,
        })),
      ];

      return {
        sessions: (sessions.data ?? []) as unknown as SessionRow[],
        gear,
      };
    },
  });

  const removeSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const currentList = dataQuery.data?.sessions ?? [];
      const sessionToDelete = currentList.find((s) => s.id === id);

      // Optimistically update
      queryClient.setQueryData<{ sessions: SessionRow[]; gear: GearItem[] } | undefined>(
        ["log-data"],
        (old) => {
          if (!old) return undefined;
          return {
            sessions: old.sessions.filter((s) => s.id !== id),
            gear: old.gear,
          };
        }
      );

      if (sessionToDelete && !id.startsWith("local-")) {
        const dur = sessionToDelete.duration_minutes;
        const packsFlown = sessionToDelete.packs_flown || 0;
        const crashesCount = sessionToDelete.crashes || 0;

        // We need gear to update stats, but we don't have it here.
        // We'll fetch it again or get it from queryClient.
        const gearData = queryClient.getQueryData<{ gear: GearItem[] }>(["log-data"])?.gear ?? [];

        if (sessionToDelete.gear_id) {
          const rig = gearData.find((g) => g.id === sessionToDelete.gear_id);
          if (rig) {
            await updateGearById(sessionToDelete.gear_id, {
              total_minutes: Math.max(0, rig.total_minutes - dur),
              minutes_since_service: Math.max(0, rig.minutes_since_service - dur),
              pack_count: Math.max(0, rig.pack_count - packsFlown),
              crash_count: Math.max(0, rig.crash_count - crashesCount),
            });
          }
        }

        if (sessionToDelete.controller_id) {
          const ctrl = gearData.find((g) => g.id === sessionToDelete.controller_id);
          if (ctrl) {
            await updateGearById(sessionToDelete.controller_id, {
              total_minutes: Math.max(0, ctrl.total_minutes - dur),
            });
          }
        }

        if (sessionToDelete.goggles_id) {
          const gog = gearData.find((g) => g.id === sessionToDelete.goggles_id);
          if (gog) {
            await updateGearById(sessionToDelete.goggles_id, {
              total_minutes: Math.max(0, gog.total_minutes - dur),
            });
          }
        }

        const { error } = await db_request({
          mode: "query",
          schema: "public",
          table: "sessions",
          operation: "delete",
          filters: { id },
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["log-data"] });
    },
    onError: (e: Error) => {
      // Rollback optimistic update
      queryClient.invalidateQueries({ queryKey: ["log-data"] });
      import("sonner").then(({ toast }) => toast.error(e.message));
    },
  });

  return {
    sessions: dataQuery.data?.sessions ?? [],
    gear: dataQuery.data?.gear ?? [],
    isLoading: dataQuery.isLoading,
    isError: dataQuery.isError,
    removeSession: removeSessionMutation,
  };
}

async function updateGearById(
  gearId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const tables = [
    "batteries",
    "drones",
    "transmitters",
    "goggles",
    "other_gear",
  ];
  for (const table of tables) {
    const result: DbRequestResult<GearItem[]> = await db_request({
      mode: "query",
      schema: "personal_gear",
      table,
      operation: "select",
      selectColumns: "id",
      filters: { id: gearId },
    });
    if (result.error) throw result.error;
    if (result.data) {
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: table,
        operation: "update",
        data: updates,
        filters: { id: gearId },
      });
      if (error) throw error;
      return;
    }
  }
  throw new Error("Gear not found");
}