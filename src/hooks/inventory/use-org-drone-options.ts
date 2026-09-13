import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import type { DroneOption } from "./use-drone-options";

export type { DroneOption };

/**
 * Every airframe the SQUADRON owns (org_gear.drones), for org install
 * pickers. Pinned to the team — a pilot in several squads must only ever
 * see the current squad's quads here.
 */
export function useOrgDroneOptions(teamId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["org-drone-options", teamId],
    queryFn: async (): Promise<DroneOption[]> => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "org_gear",
        table: "drones",
        operation: "select",
        selectColumns: "id, name",
        filters: { team_id: teamId },
        orderBy: { column: "name", ascending: true },
      });
      if (error) throw error;
      return (data ?? []) as DroneOption[];
    },
    enabled: enabled && !!teamId,
    staleTime: 60_000,
  });
}
