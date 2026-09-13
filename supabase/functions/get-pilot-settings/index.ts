import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkBodySize,
  checkRateLimit,
  preflightResponse,
} from "../_shared/http.ts";

Deno.serve(async (req) => {
  const preflight = preflightResponse(req);
  if (preflight) return preflight;

  try {
    const sizeRejection = await checkBodySize(req);
    if (sizeRejection) return sizeRejection;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Forward the caller's JWT so RLS sees the real user for every query.
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") ?? "",
        },
      },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const rateLimited = await checkRateLimit(supabase, "get-pilot-settings", user.id, 60, 60);
    if (rateLimited) return rateLimited;

    const { data, error } = await supabase
      .from("pilot_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
