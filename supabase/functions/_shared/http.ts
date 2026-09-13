// Shared edge-function plumbing: CORS, request-size limit, rate limiting.
//
// Every function in supabase/functions imports this instead of re-declaring
// its own corsHeaders, so CORS policy and bill protection change in one place.
//
// CORS: locked to APP_ORIGIN (env). When APP_ORIGIN is unset the header is
// omitted entirely rather than emitting an empty/invalid origin — a missing
// header is the same "blocked by browser" outcome without the malformed value.
//
// Rate limiting: per-user fixed-window buckets in public.rate_limit_buckets
// via the consume_rate_limit SECURITY DEFINER RPC. Costs one DB round-trip
// per request — acceptable for the low-volume admin/settings functions that
// use this module.

const MAX_BODY_BYTES = 256 * 1024; // 256 KB — requests above this are rejected

export function buildCorsHeaders(origin: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-apikey, content-type",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

const corsHeaders = buildCorsHeaders(Deno.env.get("APP_ORIGIN"));

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function preflightResponse(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response("ok", { headers: corsHeaders });
}

/**
 * Reject requests whose body exceeds the size cap. Returns a 413 response
 * when over the limit, null otherwise.
 */
export async function checkBodySize(req: Request): Promise<Response | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Request body too large" }, 413);
  }
  return null;
}

/**
 * Consume one token from the caller's per-action bucket.
 * Returns a 429 response when the bucket is exhausted, null when allowed.
 *
 * `userSub` should come from a verified token (auth.getUser), never from a
 * client-supplied field.
 */
export async function checkRateLimit(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  scope: string,
  userSub: string,
  maxEvents: number,
  windowSeconds: number,
): Promise<Response | null> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: `${scope}:${userSub}`,
    p_max_events: maxEvents,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Fail closed: an RPC error is a 500 anyway, and letting it through
    // would make the limit advisory only.
    console.error("consume_rate_limit failed:", error.message);
    return jsonResponse({ error: "Rate limiter unavailable" }, 503);
  }
  if (data === false) {
    return jsonResponse({ error: "Too many requests" }, 429);
  }
  return null;
}
