/**
 * portals — the typed client contract for white-labeled delivery
 * portals. Mirrors supabase/migrations/20260928030000_portals_schema.sql
 * and 20260928030100_portals_rpcs_storage.sql.
 */

export interface BrandingConfig {
  logo_url?: string;
  brand_color?: string;
  agency_name?: string;
}

/** Internal row shape (RLS-gated reads via the portals schema). */
export interface Delivery {
  delivery_id: string;
  organization_id: string;
  client_name: string;
  project_title: string;
  access_token: string;
  expires_at: string;
  branding_config: BrandingConfig;
  created_at: string;
  updated_at: string;
}

export interface DeliveryFile {
  file_id: string;
  delivery_id: string;
  file_name: string;
  file_size: number;
  storage_path: string;
  created_at: string;
}

export const DELIVERY_EXPIRATION_DAYS = [7, 14, 30] as const;
export type DeliveryExpirationDays = (typeof DELIVERY_EXPIRATION_DAYS)[number];

/** Draft for portals.deliveries inserts (create flow). */
export interface DeliveryDraft {
  client_name: string;
  project_title: string;
  expires_in_days: DeliveryExpirationDays;
  branding_config: BrandingConfig;
}

/**
 * What the public /portal/$token page renders — the RPC response for
 * portals.get_delivery / public.portals_get_delivery. An unknown or
 * expired token never reaches this shape; it surfaces as a thrown
 * PostgREST error (404 / 410) — see fetchDeliveryView.
 */
export interface DeliveryView {
  client_name: string;
  project_title: string;
  branding_config: BrandingConfig;
  expires_at: string;
  created_at: string;
  files: Array<{
    file_id: string;
    file_name: string;
    file_size: number;
    uploaded_at: string;
  }>;
}

export type DeliveryViewResult =
  | { status: "ok"; view: DeliveryView }
  | { status: "not_found" }
  | { status: "expired" };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
