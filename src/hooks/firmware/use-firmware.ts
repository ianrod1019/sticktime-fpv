/**
 * use-firmware — data layer for the firmware/config version-control
 * module. Table reads go to the firmware schema under RLS (RLS decides
 * which rows the caller sees); every mutation goes through the
 * public.firmware_* RPCs so it lands with an audit row.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AirframeComponent,
  AirworthinessDirective,
  AuditChainStatus,
  ConfigSnapshot,
  DriftEvent,
  FirmwareAirframe,
  FirmwareRelease,
  HardwareTarget,
  FirmwareFamily,
  IngestResult,
  IngestFormat,
  IngestSource,
  SnapshotKind,
  WorkOrder,
  WorkOrderStep,
} from "@/types/firmware";
import {
  firmwareConfigObjectPath,
  uploadFirmwareConfig,
} from "@/lib/firmware/storage";

const FIRMWARE_SCHEMA = "firmware";

function schemaTable(table: string) {
  return supabase.schema(FIRMWARE_SCHEMA).from(table);
}

const orgKey = (orgId: string | null) => ["firmware", "org", orgId] as const;

/* ------------------------------------------------------------------ reads */

export function useFirmwareAirframes(orgId: string | null) {
  return useQuery({
    queryKey: [...orgKey(orgId), "airframes"],
    enabled: !!orgId,
    queryFn: async (): Promise<FirmwareAirframe[]> => {
      const { data, error } = await schemaTable("airframes")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as FirmwareAirframe[];
    },
  });
}

export function useAirframeComponents(airframeIds: string[]) {
  return useQuery({
    queryKey: [...orgKey(airframeIds.join(",")), "components"],
    enabled: airframeIds.length > 0,
    queryFn: async (): Promise<AirframeComponent[]> => {
      const { data, error } = await schemaTable("airframe_components")
        .select("*")
        .in("airframe_id", airframeIds)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as AirframeComponent[];
    },
  });
}

export function useDriftEvents(orgId: string | null) {
  return useQuery({
    queryKey: [...orgKey(orgId), "drift"],
    enabled: !!orgId,
    queryFn: async (): Promise<DriftEvent[]> => {
      const { data, error } = await schemaTable("drift_events")
        .select("*")
        .eq("org_id", orgId!)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DriftEvent[];
    },
  });
}

export function useConfigSnapshots(airframeIds: string[]) {
  return useQuery({
    queryKey: [...orgKey(airframeIds.join(",")), "snapshots"],
    enabled: airframeIds.length > 0,
    queryFn: async (): Promise<ConfigSnapshot[]> => {
      const { data, error } = await schemaTable("config_snapshots")
        .select("*")
        .in("airframe_id", airframeIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as ConfigSnapshot[];
    },
  });
}

export function useWorkOrders(orgId: string | null) {
  return useQuery({
    queryKey: [...orgKey(orgId), "work-orders"],
    enabled: !!orgId,
    queryFn: async (): Promise<WorkOrder[]> => {
      const { data, error } = await schemaTable("work_orders")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as WorkOrder[];
    },
  });
}

export function useWorkOrderSteps(workOrderIds: string[]) {
  return useQuery({
    queryKey: [...orgKey(workOrderIds.join(",")), "wo-steps"],
    enabled: workOrderIds.length > 0,
    queryFn: async (): Promise<WorkOrderStep[]> => {
      const { data, error } = await schemaTable("work_order_steps")
        .select("*")
        .in("work_order_id", workOrderIds)
        .order("step_no");
      if (error) throw error;
      return (data ?? []) as unknown as WorkOrderStep[];
    },
  });
}

export function useDirectives(orgId: string | null) {
  return useQuery({
    queryKey: [...orgKey(orgId), "directives"],
    enabled: !!orgId,
    queryFn: async (): Promise<AirworthinessDirective[]> => {
      const { data, error } = await schemaTable("airworthiness_directives")
        .select("*")
        .order("effective_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as AirworthinessDirective[];
    },
  });
}

/** Registry pickers for the flash dialog (families -> targets -> releases). */
export function useFirmwareRegistry() {
  return useQuery({
    queryKey: ["firmware", "registry"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [famRes, tgtRes, relRes] = await Promise.all([
        schemaTable("families").select("id,manufacturer_id,name").order("name"),
        schemaTable("hardware_targets")
          .select("id,family_id,target_key")
          .order("target_key"),
        schemaTable("firmware_releases")
          .select("id,target_id,version,release_status,certified,notes")
          .order("version_sort_key", { ascending: false }),
      ]);
      if (famRes.error) throw famRes.error;
      if (tgtRes.error) throw tgtRes.error;
      if (relRes.error) throw relRes.error;
      return {
        families: famRes.data as unknown as FirmwareFamily[],
        targets: tgtRes.data as unknown as HardwareTarget[],
        releases: relRes.data as unknown as FirmwareRelease[],
      };
    },
  });
}

/* ----------------------------------------------------------------- RPCs */

export interface IngestPayload {
  orgId: string;
  teamId: string;
  airframeId: string;
  componentId: string | null;
  source: IngestSource;
  format: IngestFormat;
  raw: string;
  kind: SnapshotKind;
  fileName?: string;
}

/** Upload the raw dump to storage, then run the diff/grounding RPC. */
export function useIngestConfigSnapshot(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: IngestPayload): Promise<IngestResult> => {
      const path = firmwareConfigObjectPath(
        payload.teamId,
        payload.airframeId,
        payload.fileName ?? "config-dump.txt",
      );
      await uploadFirmwareConfig(path, payload.raw);
      const { data, error } = await supabase.rpc(
        "firmware_ingest_config_snapshot",
        {
          p_org: payload.orgId,
          p_airframe: payload.airframeId,
          p_component: payload.componentId,
          p_source: payload.source,
          p_format: payload.format,
          p_raw: payload.raw,
          p_object_path: path,
          p_kind: payload.kind,
        },
      );
      if (error) throw error;
      return data as IngestResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["firmware"] });
    },
  });
}

/** Resolve (acknowledge / clear / suppress) one drift event. */
export function useResolveDrift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      driftId: string;
      status: "acknowledged" | "cleared" | "suppressed";
      note?: string | null;
    }) => {
      const { error } = await supabase.rpc("firmware_resolve_drift", {
        p_drift: input.driftId,
        p_status: input.status,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["firmware"] });
    },
  });
}

export interface FlashPayload {
  orgId: string;
  airframeId: string;
  componentId: string;
  toReleaseId: string;
  flashStatus: "succeeded" | "failed" | "bricked" | "rolled_back";
  notes?: string | null;
}

export function useRecordFlash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FlashPayload) => {
      const { data, error } = await supabase.rpc("firmware_record_flash", {
        p_org: input.orgId,
        p_airframe: input.airframeId,
        p_component: input.componentId,
        p_to_release: input.toReleaseId,
        p_flash_status: input.flashStatus,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as { work_order_id: string | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["firmware"] });
    },
  });
}

export interface AdvanceInput {
  workOrderId: string;
  stepNo: number;
  action: "satisfy" | "reject" | "cancel";
  notes?: string | null;
  evidenceSnapshotId?: string | null;
}

export function useAdvanceWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdvanceInput) => {
      const { error } = await supabase.rpc("firmware_advance_work_order", {
        p_work_order: input.workOrderId,
        p_step_no: input.stepNo,
        p_action: input.action,
        p_notes: input.notes ?? null,
        p_evidence_snapshot: input.evidenceSnapshotId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["firmware"] });
    },
  });
}

export function usePublishDirective() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orgId: string | null;
      ref: string;
      title: string;
      body: string;
      matches: { scope_type: string; scope_value: string }[];
      sourceUrl?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("firmware_publish_directive", {
        p_org: input.orgId,
        p_ref: input.ref,
        p_title: input.title,
        p_body: input.body,
        p_matches: input.matches,
        p_source_url: input.sourceUrl ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["firmware"] });
    },
  });
}

/** Tamper-evidence check — recomputes the org's whole audit chain. */
export function useVerifyAuditChain(orgId: string | null) {
  return useQuery({
    queryKey: [...orgKey(orgId), "audit-chain"],
    enabled: !!orgId,
    queryFn: async (): Promise<AuditChainStatus> => {
      const { data, error } = await supabase.rpc("firmware_verify_audit_chain", {
        p_org: orgId!,
      });
      if (error) throw error;
      return data as AuditChainStatus;
    },
  });
}
