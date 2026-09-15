/**
 * sms — the typed client contract for the Safety Management System
 * incident log. Mirrors supabase/migrations/20260929000000_sms_incident_schema.sql.
 */

export const INCIDENT_SEVERITY_LEVELS = [
  "low",
  "medium",
  "high",
  "catastrophic",
] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITY_LEVELS)[number];

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  catastrophic: "Catastrophic",
};

export const INCIDENT_TYPES = [
  "crash",
  "flyaway",
  "near_miss",
  "property_damage",
  "airspace_violation",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  crash: "Crash",
  flyaway: "Flyaway",
  near_miss: "Near miss",
  property_damage: "Property damage",
  airspace_violation: "Airspace violation",
};

export const INCIDENT_STATUSES = ["open", "under_review", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  under_review: "Under review",
  closed: "Closed",
};

export interface Incident {
  incident_id: string;
  organization_id: string;
  user_id: string;
  airframe_id: string | null;
  incident_date: string;
  severity_level: IncidentSeverity;
  incident_type: IncidentType;
  description: string;
  corrective_action: string | null;
  status: IncidentStatus;
  attachment_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentDraft {
  airframe_id: string | null;
  incident_date: string;
  severity_level: IncidentSeverity;
  incident_type: IncidentType;
  description: string;
}

/** Safety-officer review action: closing requires a corrective_action (DB-enforced). */
export interface IncidentReview {
  status: IncidentStatus;
  corrective_action: string | null;
}
