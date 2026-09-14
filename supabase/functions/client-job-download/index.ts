// Client deliverables download — edge function, service-role backend.
//
// The public /client/$token page calls this with the job's link token
// (no Supabase session exists for clients). verify_jwt is disabled for
// this function — the token IS the credential, validated against
// ent_scheduling.client_jobs before anything streams.
//
//   GET /functions/v1/client-job-download?token=<uuid>&file=<uuid optional>
//
//   * token only            → every deliverable as a single zip (the
//                             client-facing "download everything" button;
//                             one request, one attachment).
//   * token + file=<uuid>   → that single deliverable, streaming.
//
// Both paths 404 unless the job status is exactly 'delivered' — the same
// rule the get_client_job RPC uses to expose the deliverables list, so
// a pending/confirmed job exposes no work product.
//
// Zip: fflate zipSync (esm.sh, Deno-compatible) with DEFLATE — real
// compression, one dependency. Files are pulled from the private
// 'client-deliverables' bucket via the service-role client; the browser
// never receives bucket grants or signed URLs.
import { zipSync, type Zippable } from "https://esm.sh/fflate@0.8.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  checkRateLimit,
  jsonResponse,
  preflightResponse,
} from "../_shared/http.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOTAL_ZIP_BUDGET = 900 * 1024 * 1024; // 900 MB across the archive
const BUCKET = "client-deliverables";

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

    if (!UUID_RE.test(token)) {
      return jsonResponse({ error: "A valid job link is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Rate limit keyed on the link token itself — shared by everyone who
    // holds the link, which is exactly the blast radius we want to cap.
    const rls = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rateLimited = await checkRateLimit(
      rls,
      "client-job-download",
      token,
      30,
      60,
    );
    if (rateLimited) return rateLimited;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: job, error: jobError } = await admin
      .schema("ent_scheduling")
      .from("client_jobs")
      .select("id, job_number, title, status, organization_id")
      .eq("client_token", token)
      .maybeSingle();

    if (jobError) {
      return jsonResponse({ error: jobError.message }, 500);
    }
    if (!job) {
      return jsonResponse({ error: "This job link is not valid" }, 404);
    }
    if (job.status !== "delivered") {
      return jsonResponse(
        { error: "Deliverables are not available yet" },
        409,
      );
    }

    const { data: deliverables, error: delError } = await admin
      .schema("ent_scheduling")
      .from("job_deliverables")
      .select("id, file_name, storage_path, mime_type, size_bytes")
      .eq("job_id", job.id);

    if (delError) {
      return jsonResponse({ error: delError.message }, 500);
    }
    const files = deliverables ?? [];
    if (files.length === 0) {
      return jsonResponse({ error: "No deliverables on this job" }, 404);
    }

    // Single-file mode: stream that one object.
    if (fileParam) {
      if (!UUID_RE.test(fileParam)) {
        return jsonResponse({ error: "Invalid file id" }, 400);
      }
      const one = files.find((f) => f.id === fileParam);
      if (!one) {
        return jsonResponse({ error: "File not part of this job" }, 404);
      }
      const { data, error } = await admin.storage
        .from(BUCKET)
        .download(one.storage_path);
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
          "content-type": one.mime_type || "application/octet-stream",
          "content-length": String(data.size),
          "content-disposition": `attachment; filename="${sanitizeFilename(one.file_name)}"`,
          "cache-control": "no-store",
        },
      });
    }

    // Archive mode: zip every deliverable under sanitized names.
    const total = files.reduce((acc, f) => acc + Number(f.size_bytes), 0);
    if (total > TOTAL_ZIP_BUDGET) {
      return jsonResponse(
        {
          error:
            "This job's deliverables exceed the archive size limit — download files individually.",
        },
        413,
      );
    }

    const archive: Zippable = {};
    const used = new Set<string>();
    for (const f of files) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .download(f.storage_path);
      if (error || !data) {
        return jsonResponse(
          { error: error?.message ?? `File missing: ${f.file_name}` },
          500,
        );
      }
      let name = sanitizeFilename(f.file_name);
      let n = 2;
      while (used.has(name)) name = `${name.replace(/(\.[^.]*)?$/, "")} (${n++})${f.file_name.match(/\.[^.]*$/)?.[0] ?? ""}`;
      used.add(name);
      archive[name] = new Uint8Array(await data.arrayBuffer());
    }

    const zipped = zipSync(archive, { level: 6 });
    const zipName = sanitizeFilename(
      `job-${job.job_number}-${job.title}.zip`,
    );

    return new Response(zipped, {
      status: 200,
      headers: {
        ...cors,
        "content-type": "application/zip",
        "content-length": String(zipped.byteLength),
        "content-disposition": `attachment; filename="${zipName}"`,
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
