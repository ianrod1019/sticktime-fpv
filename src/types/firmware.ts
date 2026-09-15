/**
 * firmware — typed client contract for the Firmware, Configuration &
 * Electronic Component Version Control module. Mirrors
 * supabase/migrations/2026093000*.sql — every mutation goes through the
 * public.firmware_* RPCs; the client only reads tables and renders.
 */

export const LIFECYCLE_STATUSES = [
  "active",
  "maintenance",
  "grounded",
  "decommissioned",
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const COMPONENT_CLASSES = [
  "flight_controller",
  "esc",
  "vtx_digital_video",
  "radio_receiver",
  "motor",
  "gps_module",
  "other",
] as const;
export type ComponentClass = (typeof COMPONENT_CLASSES)[number];

export const COMPONENT_CLASS_LABELS: Record<ComponentClass, string> = {
  flight_controller: "Flight controller",
  esc: "ESC",
  vtx_digital_video: "VTX / digital video",
  radio_receiver: "Radio receiver",
  motor: "Motor",
  gps_module: "GPS module",
  other: "Other",
};

export const RELEASE_STATUSES = [
  "approved",
  "provisional",
  "restricted",
  "blacklisted",
] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const SNAPSHOT_KINDS = [
  "golden",
  "baseline_candidate",
  "observed",
  "rollback_reference",
] as const;
export type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

export const DRIFT_SEVERITIES = [
  "critical_safety",
  "operational",
  "informational",
] as const;
export type DriftSeverity = (typeof DRIFT_SEVERITIES)[number];

export const DRIFT_STATUSES = [
  "open",
  "acknowledged",
  "cleared",
  "suppressed",
] as const;
export type DriftStatus = (typeof DRIFT_STATUSES)[number];

export const INGEST_SOURCES = [
  "cli_export",
  "gcs_params",
  "api_sync",
  "bench_flash",
  "manual_edit",
] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export const INGEST_FORMATS = ["betaflight_cli", "ardupilot_params", "json"] as const;
export type IngestFormat = (typeof INGEST_FORMATS)[number];

export const WORK_ORDER_KINDS = [
  "firmware_flash",
  "component_replacement",
  "config_change",
  "rollback",
] as const;
export type WorkOrderKind = (typeof WORK_ORDER_KINDS)[number];

export const WORK_ORDER_STATUSES = [
  "open",
  "in_progress",
  "awaiting_safety_review",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_STEP_KINDS = [
  "technician_attest",
  "evidence_upload",
  "safety_audit",
  "final_release",
] as const;
export type WorkOrderStepKind = (typeof WORK_ORDER_STEP_KINDS)[number];

/* ------------------------------------------------------------------ rows */

export interface FirmwareRelease {
  id: string;
  target_id: string;
  version: string;
  release_status: ReleaseStatus;
  certified: boolean;
  notes: string | null;
}

export interface HardwareTarget {
  id: string;
  family_id: string;
  target_key: string;
}

export interface FirmwareFamily {
  id: string;
  manufacturer_id: string;
  name: string;
}

/** Airframe row (RLS-scoped to the caller's orgs). */
export interface FirmwareAirframe {
  id: string;
  org_id: string;
  team_id: string;
  name: string;
  chassis_type: string | null;
  manufacturer_serial: string | null;
  registration_id: string | null;
  lifecycle_status: LifecycleStatus;
  grounded_reason: string | null;
  created_at: string;
}

export interface AirframeComponent {
  id: string;
  airframe_id: string;
  component_class: ComponentClass;
  slot_label: string | null;
  manufacturer: string | null;
  model: string | null;
  hardware_serial: string | null;
  installed_release_id: string | null;
  lifecycle_status: "active" | "spare" | "removed" | "failed";
}

export interface DriftEvent {
  id: string;
  airframe_id: string;
  component_id: string | null;
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  severity: DriftSeverity;
  drift_status: DriftStatus;
  baseline_snapshot_id: string | null;
  config_snapshot_id: string;
  resolution_note: string | null;
  detected_at: string;
}

export interface ConfigSnapshot {
  id: string;
  airframe_id: string;
  component_id: string | null;
  source: IngestSource;
  format: IngestFormat;
  snapshot_kind: SnapshotKind;
  raw_object_path: string;
  raw_sha256: string;
  field_count: number;
  ingested_by: string;
  captured_at: string;
}

export interface WorkOrderStep {
  id: string;
  work_order_id: string;
  step_no: number;
  step_kind: WorkOrderStepKind;
  required_role: "technician" | "safety_manager";
  status: "pending" | "satisfied" | "rejected";
  acted_by: string | null;
  acted_at: string | null;
  notes: string | null;
  evidence_snapshot_id: string | null;
}

export interface WorkOrder {
  id: string;
  org_id: string;
  airframe_id: string;
  component_id: string | null;
  work_order_kind: WorkOrderKind;
  status: WorkOrderStatus;
  justification: string;
  assigned_technician: string | null;
  created_at: string;
  closed_at: string | null;
  steps?: WorkOrderStep[];
}

export interface AirworthinessDirective {
  id: string;
  org_id: string | null;
  directive_ref: string;
  title: string;
  body: string;
  is_active: boolean;
  effective_at: string;
  source_url: string | null;
}

/* ------------------------------------------------------- RPC result shapes */

/** firmware_ingest_config_snapshot returns the diff + grounding decision. */
export interface IngestResult {
  snapshot_id: string;
  revision_no: number;
  field_count: number;
  diff: {
    added: number;
    removed: number;
    changed: number;
    critical: number;
    operational: number;
    informational: number;
  };
  grounded: boolean;
  drift_event_ids: string[];
}

/** firmware_verify_audit_chain result. */
export interface AuditChainStatus {
  ok: boolean;
  events: number;
  broken_at_seq?: number;
  reason?: string;
}
