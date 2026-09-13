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
    // Forward the caller's JWT so RLS / check_is_admin() see the real user.
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

    const rateLimited = await checkRateLimit(supabase, "get-admin-directory", user.id, 60, 60);
    if (rateLimited) return rateLimited;

    // check_is_admin() takes no arguments and evaluates the caller's own
    // role from the JWT — passing p_user_id made every call fail closed.
    const { data: isAdmin, error: adminError } = await supabase.rpc(
      "check_is_admin",
    );

    if (adminError || isAdmin !== true) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: corsHeaders },
      );
    }

    // Preferred source is the admin_directory view (if provisioned); fall
    // back to the RLS-guarded admin_get_admin_directory() RPC.
    const { data, error } = await supabase
      .from("admin_directory")
      .select("*");

    if (error) {
      if (error.code === "42P01" || /does not exist/i.test(error.message)) {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "admin_get_admin_directory",
        );
        if (rpcError) {
          return new Response(JSON.stringify({ error: rpcError.message }), {
            status: 500,
            headers: corsHeaders,
          });
        }
        return new Response(JSON.stringify({ data: rpcData }), {
          status: 200,
          headers: corsHeaders,
        });
      }
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
