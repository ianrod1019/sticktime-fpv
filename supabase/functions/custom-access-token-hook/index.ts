// ============================================================
// Custom Access Token Hook — embeds role/tier in the JWT
//
// Wire up (one-time, Supabase Dashboard → Auth → Hooks):
//   Type: Custom Access Token
//   Function: custom-access-token-hook
//   Secrets: APP_ORIGIN (optional), none else needed
//
// After enabling, every access token carries `role` and `tier` in
// app_metadata, signed by the server. The client reads these claims via
// supabase.auth.getSession() — no profile round-trips needed for UI gating.
// The database remains the enforcement authority (RLS + SECURITY DEFINER
// RPCs); these claims are for fast, spoof-resistant UI decisions only.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    // The hook payload contains the token's standard claims.
    const claims = payload?.claims;
    const userId = claims?.sub;
    if (!userId) {
      return Response.json({ error: "missing user id in claims" }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // Hooks run server-side with the service role key (never shipped to the
    // client; the role/tier WRITE path is server-only by design).
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return Response.json({ error: "service role key not configured" }, { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin
      .from("profiles")
      .select("role, tier")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("custom-access-token-hook profile lookup failed:", error);
      // Fail open to plain defaults rather than blocking token issuance.
    }

    const role = (data?.role ?? "user").toLowerCase();
    const tier = (data?.tier ?? "free").toLowerCase();

    return Response.json({
      claims: {
        ...claims,
        app_metadata: {
          ...(claims?.app_metadata ?? {}),
          role,
          tier,
        },
      },
    });
  } catch (err) {
    console.error("custom-access-token-hook error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
});
