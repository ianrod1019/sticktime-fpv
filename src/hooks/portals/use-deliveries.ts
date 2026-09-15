/**
 * use-deliveries — the data layer for white-labeled delivery portals.
 *
 * Reads/writes go straight to portals tables under RLS (same shape as
 * ent_scheduling/certs); the public token view goes through the
 * SECURITY DEFINER RPC, the only reader anon ever touches.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  Delivery,
  DeliveryDraft,
  DeliveryFile,
  DeliveryView,
  DeliveryViewResult,
} from "@/types/portals";
import {
  deliveryObjectPath,
  removeDeliveryFile,
  uploadDeliveryFile,
} from "@/lib/portals/storage";
import { useQaMode } from "@/hooks/use-qa-mode";
import {
  QA_DELIVERIES,
  QA_DELIVERY_FILES,
  QaWriteBlockedError,
  qaDeliveryFromDraft,
} from "@/lib/qa-fixtures";

function deliveriesTable() {
  return supabase.schema("portals").from("deliveries");
}
function filesTable() {
  return supabase.schema("portals").from("delivery_files");
}

/** All delivery portals for one org (the internal dashboard). QA mode: fixtures. */
export function useOrgDeliveries(orgId: string | null) {
  const qaMode = useQaMode();
  return useQuery({
    queryKey: ["portals", "deliveries", orgId, qaMode ? "qa" : "live"],
    enabled: !!orgId,
    queryFn: async (): Promise<Delivery[]> => {
      if (qaMode) {
        return QA_DELIVERIES.filter((d) => d.organization_id === orgId);
      }
      const { data, error } = await deliveriesTable()
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Delivery[];
    },
  });
}

/** Files attached to one delivery. QA mode: fixtures. */
export function useDeliveryFiles(deliveryId: string | null) {
  const qaMode = useQaMode();
  return useQuery({
    queryKey: ["portals", "files", deliveryId, qaMode ? "qa" : "live"],
    enabled: !!deliveryId,
    queryFn: async (): Promise<DeliveryFile[]> => {
      if (qaMode) {
        return QA_DELIVERY_FILES.filter((f) => f.delivery_id === deliveryId);
      }
      const { data, error } = await filesTable()
        .select("*")
        .eq("delivery_id", deliveryId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DeliveryFile[];
    },
  });
}

export function useCreateDelivery(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (draft: DeliveryDraft): Promise<Delivery> => {
      if (qaMode) return qaDeliveryFromDraft(orgId, draft);
      const expires_at = new Date(
        Date.now() + draft.expires_in_days * 86_400_000,
      ).toISOString();
      const { data, error } = await deliveriesTable()
        .insert({
          organization_id: orgId,
          client_name: draft.client_name,
          project_title: draft.project_title,
          expires_at,
          branding_config: draft.branding_config,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Delivery;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["portals", "deliveries", orgId],
      });
    },
  });
}

export function useDeleteDelivery(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (deliveryId: string) => {
      if (qaMode) throw new QaWriteBlockedError();
      const { error } = await deliveriesTable()
        .delete()
        .eq("delivery_id", deliveryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["portals", "deliveries", orgId],
      });
    },
  });
}

/** Rotate the client link — old link dies, new token returned. */
export function useRotateAccessToken(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (deliveryId: string): Promise<string> => {
      if (qaMode) throw new QaWriteBlockedError();
      const { data, error } = await supabase.rpc("portals_rotate_token", {
        _delivery: deliveryId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["portals", "deliveries", orgId],
      });
    },
  });
}

/**
 * Upload a delivery file: storage object first (private bucket, path
 * contract <delivery_id>/<uuid>-name), then the catalog row. The
 * storage policy (storage_delivery_access) enforces the same rule
 * server-side.
 */
export function useUploadDeliveryFile(delivery: Delivery) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (file: File): Promise<DeliveryFile> => {
      if (qaMode) throw new QaWriteBlockedError();
      const path = deliveryObjectPath(delivery.delivery_id, file.name);
      await uploadDeliveryFile(path, file);
      const { data, error } = await filesTable()
        .insert({
          delivery_id: delivery.delivery_id,
          file_name: file.name,
          file_size: file.size,
          storage_path: path,
        })
        .select()
        .single();
      if (error) {
        await removeDeliveryFile(path);
        throw error;
      }
      return data as DeliveryFile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["portals", "files", delivery.delivery_id],
      });
    },
  });
}

export function useDeleteDeliveryFile(delivery: Delivery) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (f: DeliveryFile) => {
      if (qaMode) throw new QaWriteBlockedError();
      const { error } = await filesTable().delete().eq("file_id", f.file_id);
      if (error) throw error;
      await removeDeliveryFile(f.storage_path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["portals", "files", delivery.delivery_id],
      });
    },
  });
}

/* -----------------------------------------------------------------------
 * Public (anon) surface — the /portal/$token page. No session exists.
 * -------------------------------------------------------------------- */

/**
 * The get_delivery RPC raises PT404/PT410 on an invalid or expired
 * token (see the migration) — PostgREST surfaces those as a thrown
 * error here, distinguished by message text since both are terminal,
 * neutral states the UI renders identically either way.
 */
export async function fetchDeliveryView(
  token: string,
): Promise<DeliveryViewResult> {
  const { data, error } = await supabase.rpc("portals_get_delivery", {
    _token: token,
  });
  if (error) {
    return error.message.toLowerCase().includes("expired")
      ? { status: "expired" }
      : { status: "not_found" };
  }
  return { status: "ok", view: data as DeliveryView };
}

/** Build the portal-link URL for the admin to copy/send. */
export function deliveryLinkFor(token: string): string {
  return `${window.location.origin}/portal/${token}`;
}
