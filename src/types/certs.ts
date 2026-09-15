/**
 * certs — the typed client contract for the Certification & Waiver
 * Vault. Mirrors supabase/migrations/20260928010000_certs_vault_schema.sql.
 */

export const VAULT_DOCUMENT_TYPES = [
  "part_107",
  "trust",
  "parental_waiver",
  "liability_waiver",
] as const;

export type VaultDocumentType = (typeof VAULT_DOCUMENT_TYPES)[number];

export const VAULT_DOCUMENT_TYPE_LABELS: Record<VaultDocumentType, string> = {
  part_107: "Part 107 Certificate",
  trust: "Trust Document",
  parental_waiver: "Parental Waiver",
  liability_waiver: "Liability Waiver",
};

/**
 * Informational only — drives badge color/copy. NEVER used to gate
 * booking, scheduling, or any other action.
 */
export type VaultDocumentStatus = "active" | "expiring_soon" | "expired";

export interface VaultDocument {
  id: string;
  organization_id: string;
  user_id: string;
  document_type: VaultDocumentType;
  file_name: string;
  mime_type: string;
  file_path: string;
  issue_date: string | null;
  expiration_date: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultDocumentWithStatus extends VaultDocument {
  status: VaultDocumentStatus;
}

export interface VaultDocumentDraft {
  document_type: VaultDocumentType;
  issue_date: string | null;
  expiration_date: string | null;
}
