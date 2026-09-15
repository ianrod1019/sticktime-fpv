/**
 * jha — the typed client contract for the Job Hazard Analysis
 * pre-flight checklist module. Mirrors
 * supabase/migrations/20261001000000_jha_schema.sql.
 */

// -------------------------------------------------------------------
// Checklist item structure (stored as JSONB in jha.templates.items)
// -------------------------------------------------------------------

export interface JhaChecklistItem {
  /** Stable id within the template, e.g. "env-1". */
  id: string;
  /** Human-readable question, e.g. "Wind speed < 25 mph". */
  label: string;
  /** If true, a failed answer auto-fails the entire submission. */
  critical: boolean;
}

export interface JhaChecklistSection {
  section: string;
  items: JhaChecklistItem[];
}

// -------------------------------------------------------------------
// Template
// -------------------------------------------------------------------

export interface JhaTemplate {
  template_id: string;
  organization_id: string;
  title: string;
  items: JhaChecklistSection[];
  created_at: string;
  updated_at: string;
}

export interface JhaTemplateDraft {
  title: string;
  items: JhaChecklistSection[];
}

// -------------------------------------------------------------------
// Submission
// -------------------------------------------------------------------

export type JhaSubmissionStatus = "passed" | "failed";

export const JHA_SUBMISSION_STATUSES = ["passed", "failed"] as const;

export const JHA_STATUS_LABELS: Record<JhaSubmissionStatus, string> = {
  passed: "Passed",
  failed: "Failed",
};

export interface JhaItemResponse {
  passed: boolean;
  note?: string;
}

/**
 * Shape of jha.submissions.responses JSONB column.
 * Keys are checklist item IDs (e.g. "env-1").
 */
export type JhaResponses = Record<string, JhaItemResponse>;

export interface JhaSubmission {
  submission_id: string;
  organization_id: string;
  user_id: string;
  template_id: string | null;
  airframe_id: string | null;
  dispatch_id: string | null;
  responses: JhaResponses;
  status: JhaSubmissionStatus;
  created_at: string;
}

// -------------------------------------------------------------------
// Gate check result (from jha.check_flight_gate RPC)
// -------------------------------------------------------------------

export interface JhaGateResult {
  valid: boolean;
  submission_id: string | null;
  reason: string | null;
}

// -------------------------------------------------------------------
// Wizard step definitions
// -------------------------------------------------------------------

export const JHA_WIZARD_STEPS = [
  "Environmental",
  "Hardware",
  "Battery",
  "Crew & Comms",
] as const;

export type JhaWizardStep = (typeof JHA_WIZARD_STEPS)[number];
