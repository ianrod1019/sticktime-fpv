import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS is locked to the app origin (env-configured) instead of "*".
const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    // check_is_admin() takes no arguments and evaluates the caller's own
    // role from the JWT — the previous p_user_id call failed closed.
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
    const userId = url.searchParams.get("userId");

    if (!userId || !UUID_RE.test(userId)) {
      return new Response(
        JSON.stringify({ error: "userId parameter must be a UUID" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("email")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const emails = data?.map((log: { email: string | null }) => log.email) || [];

    return new Response(JSON.stringify({ emails }), {
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
