import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkBodySize,
  checkRateLimit,
  preflightResponse,
} from "../_shared/http.ts";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

Deno.serve(async (req) => {
  const preflight = preflightResponse(req);
  if (preflight) return preflight;

  try {
    const sizeRejection = await checkBodySize(req);
    if (sizeRejection) return sizeRejection;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Forward the caller's Authorization header so RLS and check_is_admin()
    // run as the actual user. Without this the client is anonymous and the
    // admin check can never pass.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const rateLimited = await checkRateLimit(supabase, "get-security-logs", user.id, 60, 60);
    if (rateLimited) return rateLimited;

    // Admin-only: security logs must never be readable by regular users,
    // even though RLS already restricts SELECTs to admins (defense in depth).
    const { data: isAdmin, error: adminError } = await supabase.rpc(
      "check_is_admin",
    );

    if (adminError || isAdmin !== true) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: corsHeaders },
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const offsetParam = parseInt(url.searchParams.get("offset") ?? "", 10);

    let query = supabase.from("security_logs").select("*", { count: "exact" });

    if (action) {
      // security_logs has no event_type column; the action column is the
      // event discriminator.
      query = query.eq("action", action);
    }

    query = query.limit(
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_LIMIT)
        : DEFAULT_LIMIT,
    );

    if (Number.isFinite(offsetParam) && offsetParam > 0) {
      query = query.range(
        offsetParam,
        offsetParam +
          (Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(limitParam, MAX_LIMIT)
            : DEFAULT_LIMIT) -
          1,
      );
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error, count } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ data, count }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
});
