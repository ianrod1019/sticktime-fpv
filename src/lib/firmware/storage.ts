/**
 * firmware storage — private 'firmware-configs' bucket (certs-vault
 * pattern). Path contract, enforced server-side by
 * firmware.storage_access: <team_id>/<airframe_id>/<uuid>-<safe-name>.
 * The client computes the same path the RPC validates against.
 */
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "firmware-configs";

export function firmwareConfigObjectPath(
  teamId: string,
  airframeId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${teamId}/${airframeId}/${crypto.randomUUID()}-${safe}`;
}

export async function uploadFirmwareConfig(
  path: string,
  contents: string,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, contents, {
    contentType: "text/plain; charset=utf-8",
    upsert: false,
  });
  if (error) throw error;
}

/** Short-lived signed URL for viewing one dump (safety audits). */
export async function getFirmwareConfigUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
