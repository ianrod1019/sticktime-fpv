import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS is locked to the app origin (env-configured) instead of "*".
const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-apikey, content-type",
};

// Only these profile fields may ever be updated through this endpoint.
// role/tier are privilege fields: they are managed exclusively by
// server-side/admin code and the DB trigger guard — never by callers.
const ALLOWED_FIELDS = new Set(["display_name", "accent_color", "avatar_url"]);

const MAX_LENGTHS: Record<string, number> = {
  display_name: 80,
  accent_color: 32,
  avatar_url: 2048,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    const body = await req.json();

    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Allow-list + validate: silently ignores privilege fields like tier/role
    // so a caller can never smuggle them through.
    const update: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(key)) continue;
      if (typeof value !== "string") {
        return new Response(
          JSON.stringify({ error: `${key} must be a string` }),
          { status: 400, headers: corsHeaders },
        );
      }
      if (value.length > MAX_LENGTHS[key]) {
        return new Response(JSON.stringify({ error: `${key} too long` }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      update[key] = value;
    }

    if (Object.keys(update).length === 0) {
      return new Response(
        JSON.stringify({ error: "No updatable fields provided" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Ownership is enforced by eq("id", user.id) — a caller can only ever
    // update their own profile row.
    const { data, error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", user.id)
      .select()
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
