// Delivery portal download — edge function, service-role backend.
//
// The public /portal/$token page calls this with the delivery's access
// token (no Supabase session exists for clients). verify_jwt is
// disabled for this function — the token IS the credential, validated
// against portals.deliveries (existence + expiration) before anything
// streams.
//
//   GET /functions/v1/portal-download?token=<uuid>&file=<uuid>
//
// Files are pulled from the private 'delivery-files' bucket via the
// service-role client; the browser never receives bucket grants or
// signed URLs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  checkRateLimit,
  jsonResponse,
  preflightResponse,
} from "../_shared/http.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "delivery-files";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120);
}

Deno.serve(async (req) => {
  const preflight = preflightResponse(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(Deno.env.get("APP_ORIGIN"));

  try {
    if (req.method !== "GET") {
      return jsonResponse({ error: "GET only" }, 405);
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    const fileParam = url.searchParams.get("file") ?? "";

    if (!UUID_RE.test(token) || !UUID_RE.test(fileParam)) {
      return jsonResponse({ error: "A valid delivery link and file are required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Rate limit keyed on the link token itself — shared by everyone
    // who holds the link, which is exactly the blast radius we want to cap.
    const rls = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rateLimited = await checkRateLimit(
      rls,
      "portal-download",
      token,
      30,
      60,
    );
    if (rateLimited) return rateLimited;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: delivery, error: deliveryError } = await admin
      .schema("portals")
      .from("deliveries")
      .select("delivery_id, expires_at")
      .eq("access_token", token)
      .maybeSingle();

    if (deliveryError) {
      return jsonResponse({ error: deliveryError.message }, 500);
    }
    if (!delivery) {
      return jsonResponse({ error: "This delivery link is not valid" }, 404);
    }
    if (new Date(delivery.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "This delivery link has expired" }, 410);
    }

    const { data: file, error: fileError } = await admin
      .schema("portals")
      .from("delivery_files")
      .select("file_name, storage_path")
      .eq("file_id", fileParam)
      .eq("delivery_id", delivery.delivery_id)
      .maybeSingle();

    if (fileError) {
      return jsonResponse({ error: fileError.message }, 500);
    }
    if (!file) {
      return jsonResponse({ error: "File not part of this delivery" }, 404);
    }

    const { data, error } = await admin.storage
      .from(BUCKET)
      .download(file.storage_path);
    if (error || !data) {
      return jsonResponse(
        { error: error?.message ?? "File missing from storage" },
        500,
      );
    }

    return new Response(data, {
      status: 200,
      headers: {
        ...cors,
        "content-type": data.type || "application/octet-stream",
        "content-length": String(data.size),
        "content-disposition": `attachment; filename="${sanitizeFilename(file.file_name)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  }
});
