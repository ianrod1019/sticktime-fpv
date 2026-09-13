import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db_request } from "@/lib/db_request";
import { useGearScopeContext } from "@/lib/gear-scope";
import {
  INSTALLS_TABLE,
  type PartInstall,
  type RemovalReason,
} from "@/lib/inventory";
import { useOrgDroneOptions } from "./use-org-drone-options";
import type { DroneOption } from "./use-drone-options";

/**
 * Install-history sync for org_gear.drone_part_installs — the squadron twin
 * of usePartInstalls. Installs land on the SQUADRON's airframes (org_gear
 * drones); every read/write is pinned to the team and scoped by RLS
 * (org_member_*). Gated by canWrite from GearScope instead of the personal
 * Pro gate — shared-fleet installs are a membership feature.
 */

const ORG_INSTALLS_KEY = "org-part-installs";

export interface UseOrgPartInstallsResult {
  installs: PartInstall[];
  drones: DroneOption[];
  isLoading: boolean;
  canWrite: boolean;
  installPart: (
    droneId: string,
    quantity: number,
    notes?: string,
  ) => Promise<boolean>;
  /** Ends an open install. reason='broken' marks the part dead. */
  uninstallPart: (installId: string, reason: RemovalReason) => Promise<boolean>;
  isMutating: boolean;
}

export function useOrgPartInstalls(
  teamId: string,
  partId: string,
): UseOrgPartInstallsResult {
  const queryClient = useQueryClient();
  const { resolution } = useGearScopeContext();
  const { canWrite } = resolution;

  const installsQuery = useQuery({
    queryKey: [ORG_INSTALLS_KEY, teamId, partId],
    queryFn: async (): Promise<PartInstall[]> => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "org_gear",
        table: INSTALLS_TABLE,
        operation: "select",
        selectColumns:
          "id, team_id, user_id, drone_id, part_id, quantity, installed_at, uninstalled_at, removal_reason, notes",
        filters: { part_id: partId, team_id: teamId },
        orderBy: { column: "installed_at", ascending: true },
      });
      if (error) throw error;
      return (data ?? []) as PartInstall[];
    },
    enabled: !!teamId && !!partId && resolution.isMember,
    staleTime: 30_000,
  });

  const dronesQuery = useOrgDroneOptions(
    teamId,
    !!partId && resolution.isMember,
  );

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: [ORG_INSTALLS_KEY, teamId, partId],
    });
    queryClient.invalidateQueries({
      queryKey: ["squadron-inventory", teamId],
    });
  };

  const installMutation = useMutation({
    mutationFn: async ({
      droneId,
      quantity,
      notes,
    }: {
      droneId: string;
      quantity: number;
      notes?: string;
    }) => {
      const { error } = await db_request({
        mode: "query",
        schema: "org_gear",
        table: INSTALLS_TABLE,
        operation: "insert",
        data: {
          team_id: teamId,
          drone_id: droneId,
          part_id: partId,
          quantity: Math.max(1, Math.floor(quantity) || 1),
          ...(notes?.trim() ? { notes: notes.trim() } : {}),
        },
        single: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Part installed on squadron airframe");
    },
    onError: (e: Error) => toast.error(e.message || "Install failed"),
  });

  const uninstallMutation = useMutation({
    mutationFn: async ({
      installId,
      reason,
    }: {
      installId: string;
      reason: RemovalReason;
    }) => {
      const { error } = await db_request({
        mode: "query",
        schema: "org_gear",
        table: INSTALLS_TABLE,
        operation: "update",
        data: {
          uninstalled_at: new Date().toISOString(),
          removal_reason: reason,
        },
        filters: { id: installId, team_id: teamId },
        single: true,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { reason }) => {
      invalidate();
      toast.success(
        reason === "broken"
          ? "Marked as dead — part is out of service"
          : "Part returned to the squadron bench",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Uninstall failed"),
  });

  return {
    installs: installsQuery.data ?? [],
    drones: dronesQuery.data ?? [],
    isLoading: installsQuery.isLoading || dronesQuery.isLoading,
    canWrite,
    installPart: async (droneId, quantity, notes) => {
      if (!canWrite || !droneId) return false;
      await installMutation.mutateAsync({
        droneId,
        quantity,
        ...(notes ? { notes } : {}),
      });
      return true;
    },
    uninstallPart: async (installId, reason) => {
      if (!canWrite || !installId) return false;
      await uninstallMutation.mutateAsync({ installId, reason });
      return true;
    },
    isMutating: installMutation.isPending || uninstallMutation.isPending,
  };
}
