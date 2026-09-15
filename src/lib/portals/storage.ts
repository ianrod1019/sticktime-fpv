/**
 * Delivery file storage — today this is a private Supabase Storage
 * bucket ('delivery-files'), the same local/mock seam as the certs
 * vault (src/lib/certs/storage.ts) and ent_scheduling's deliverables.
 *
 * ponytail: swap-to-B2 seam. `storage_path` is stored as an opaque
 * object key, so moving to the real Backblaze B2 API later means
 * rewriting only the three functions below (presigned PUT/DELETE
 * against B2 instead of supabase.storage) — no schema or RLS change
 * needed. Client downloads already route through the portal-download
 * edge function, so that seam moves with them.
 */
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "delivery-files";

export function deliveryObjectPath(
  deliveryId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${deliveryId}/${crypto.randomUUID()}-${safe}`;
}

export async function uploadDeliveryFile(
  path: string,
  file: File,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
}

export async function removeDeliveryFile(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Short-lived signed URL for internal preview — the org's own dashboard only. */
export async function getDeliveryFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
