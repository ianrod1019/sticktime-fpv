import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db_request } from "@/lib/db_request";
import { useProAccess } from "./use-pro-access";
import { useDroneOptions, type DroneOption } from "./use-drone-options";
import {
  INSTALLS_TABLE,
  type PartInstall,
  type RemovalReason,
} from "@/lib/inventory";

/**
 * Install-history synchronization for personal_gear.drone_part_installs.
 *
 * The table carries user_id, so db_request's automatic ownership injection
 * applies (no special-casing like the old inter_drone path needed). All
 * mutations are refused client-side without Pro and additionally enforced
 * server-side by the pro-gate triggers.
 */

const INSTALLS_KEY = "part-installs";

async function fetchInstalls(partId: string): Promise<PartInstall[]> {
  const { data, error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: INSTALLS_TABLE,
    operation: "select",
    selectColumns:
      "id, user_id, drone_id, part_id, quantity, installed_at, uninstalled_at, removal_reason, notes",
    filters: { part_id: partId },
    orderBy: { column: "installed_at", ascending: true },
  });

  if (error) throw error;
  return (data ?? []) as PartInstall[];
}

export interface UsePartInstallsResult {
  installs: PartInstall[];
  drones: DroneOption[];
  isLoading: boolean;
  hasProAccess: boolean;
  installPart: (
    droneId: string,
    quantity: number,
    notes?: string,
  ) => Promise<boolean>;
  /** Ends an open install. reason='broken' marks the part dead. */
  uninstallPart: (installId: string, reason: RemovalReason) => Promise<boolean>;
  isMutating: boolean;
}

export function usePartInstalls(partId: string): UsePartInstallsResult {
  const queryClient = useQueryClient();
  const { hasProAccess } = useProAccess();

  const installsQuery = useQuery({
    queryKey: [INSTALLS_KEY, partId],
    queryFn: () => fetchInstalls(partId),
    enabled: !!partId && hasProAccess,
    staleTime: 30_000,
  });

  const dronesQuery = useDroneOptions(!!partId && hasProAccess);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [INSTALLS_KEY, partId] });
    queryClient.invalidateQueries({ queryKey: ["master-inventory"] });
    queryClient.invalidateQueries({ queryKey: ["drone-build"] });
  };

  const guard = () => {
    if (!hasProAccess) {
      toast.error(
        "Airframe installs are a Pro feature. Upgrade to unlock.",
      );
      return false;
    }
    return true;
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
        schema: "personal_gear",
        table: INSTALLS_TABLE,
        operation: "insert",
        data: {
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
      toast.success("Part installed on airframe");
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
        schema: "personal_gear",
        table: INSTALLS_TABLE,
        operation: "update",
        data: {
          uninstalled_at: new Date().toISOString(),
          removal_reason: reason,
        },
        filters: { id: installId },
        single: true,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { reason }) => {
      invalidate();
      toast.success(
        reason === "broken"
          ? "Marked as dead — part is out of service"
          : "Part returned to the bench",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Uninstall failed"),
  });

  return {
    installs: installsQuery.data ?? [],
    drones: dronesQuery.data ?? [],
    isLoading: installsQuery.isLoading || dronesQuery.isLoading,
    hasProAccess,
    installPart: async (droneId, quantity, notes) => {
      if (!guard() || !droneId) return false;
      await installMutation.mutateAsync({
        droneId,
        quantity,
        ...(notes ? { notes } : {}),
      });
      return true;
    },
    uninstallPart: async (installId, reason) => {
      if (!guard() || !installId) return false;
      await uninstallMutation.mutateAsync({ installId, reason });
      return true;
    },
    isMutating: installMutation.isPending || uninstallMutation.isPending,
  };
}
