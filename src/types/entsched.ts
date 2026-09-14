/**
 * Client-job CRM plane — typed contract for the ent_scheduling schema.
 * Mirrors 20260927106000/20260927106100. Keep in sync.
 */

export type ClientJobStatus =
  | "draft"
  | "pending_confirmation"
  | "confirmed"
  | "in_progress"
  | "delivered"
  | "archived"
  | "cancelled";

/** Internal row shape (RLS-gated reads via the ent_scheduling schema). */
export interface ClientJob {
  id: string;
  organization_id: string;
  job_number: number;
  client_token: string;
  title: string;
  description: string | null;
  location: string | null;
  scheduled_start: string;
  scheduled_end: string;
  client_name: string;
  client_email: string | null;
  /** Pilot the job belongs to; null renders in the Unassigned lane. */
  assigned_to: string | null;
  status: ClientJobStatus;
  confirmed_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface JobDeliverable {
  id: string;
  job_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

/** Draft for ent_scheduling.client_jobs inserts (create flow). */
export interface ClientJobDraft {
  title: string;
  description: string;
  location: string;
  /** Local datetime strings from <input type="datetime-local">. */
  scheduled_start: string;
  scheduled_end: string;
  client_name: string;
  client_email: string;
  status: "draft" | "pending_confirmation";
}

/**
 * What the public /client/$token page renders — the RPC response for
 * ent_scheduling.get_client_job / public.entsched_client_job.
 */
export interface ClientJobView {
  error?: "not_found";
  job_number: number;
  title: string;
  description: string | null;
  location: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: ClientJobStatus;
  client_name: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  org_name: string | null;
  deliverables: Array<{
    file_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: string;
  }>;
}

/** Confirm RPC result: ok, invalid_state, or not_found. */
export type ClientConfirmResult =
  | { ok: true; status: "confirmed" }
  | { error: "not_found" }
  | { error: "invalid_state"; status: ClientJobStatus };

/** Display label + tailwind class per status (internal board). */
export const JOB_STATUS_META: Record<
  ClientJobStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "text-zinc-500 border-white/10" },
  pending_confirmation: {
    label: "Awaiting client",
    className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  confirmed: {
    label: "Confirmed",
    className: "text-primary border-primary/30 bg-primary/10",
  },
  in_progress: {
    label: "In progress",
    className: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  },
  delivered: {
    label: "Delivered",
    className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  },
  archived: { label: "Archived", className: "text-zinc-600 border-white/5" },
  cancelled: {
    label: "Cancelled",
    className: "text-destructive border-destructive/30 bg-destructive/10",
  },
};

/** Statuses a job may legally move to from its current one (mirrors the trigger). */
export function nextStatuses(status: ClientJobStatus): ClientJobStatus[] {
  switch (status) {
    case "draft":
      return ["pending_confirmation", "confirmed", "cancelled"];
    case "pending_confirmation":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["in_progress", "cancelled"];
    case "in_progress":
      return ["delivered", "cancelled"];
    case "delivered":
      return ["archived"];
    default:
      return [];
  }
}

/** Uploads land only after the client (or admin) confirms — mirrors the trigger. */
export function canUploadDeliverables(status: ClientJobStatus): boolean {
  return (
    status === "confirmed" || status === "in_progress" || status === "delivered"
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
