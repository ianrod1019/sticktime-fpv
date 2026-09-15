/**
 * Vault file storage — today this is a private Supabase Storage bucket
 * ('cert-vault'), uploaded straight from the browser like ent_scheduling's
 * deliverables (src/hooks/entsched/use-client-jobs.ts).
 *
 * ponytail: swap-to-B2 seam. `file_path` is stored as an opaque object
 * key, so moving to the real Backblaze B2 API later means rewriting only
 * the four functions below (presigned PUT/GET against B2 instead of
 * supabase.storage) — no schema or RLS change needed.
 */
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "cert-vault";

export function vaultObjectPath(
  organizationId: string,
  userId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${organizationId}/${userId}/${crypto.randomUUID()}-${safe}`;
}

export async function uploadVaultFile(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
}

export async function removeVaultFile(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Short-lived signed URL for viewing/downloading one document. */
export async function getVaultFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
