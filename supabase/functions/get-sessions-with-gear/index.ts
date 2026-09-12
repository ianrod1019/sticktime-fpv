import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS is locked to the app origin (env-configured) instead of "*".
const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-apikey, content-type",
};

interface SessionGearData {
  id: string;
  user_id: string;
  session_type: string;
  flown_on: string;
  duration_minutes: number;
  drone_id: string | null;
  controller_id: string | null;
  location_id: string | null;
  track_id: string | null;
  sim_platform: string | null;
  packs_flown: number;
  crashes: number;
  battery_notes: string | null;
  weather: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
  transmitter: string | null;
  drone: string | null;
  goggles: string | null;
}

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
    const sessionIds = body.sessionIds;

    if (!sessionIds || !Array.isArray(sessionIds)) {
      return new Response(
        JSON.stringify({ error: "sessionIds array is required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (sessionIds.length > 100) {
      return new Response(
        JSON.stringify({ error: "Maximum 100 session IDs allowed" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Only well-formed UUIDs may pass through to the query.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validIds = sessionIds.filter(
      (id: unknown) => typeof id === "string" && UUID_RE.test(id),
    );
    if (validIds.length !== sessionIds.length) {
      return new Response(
        JSON.stringify({ error: "sessionIds must be UUID strings" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: sessions, error: sessionError } = await supabase
      .from("sessions")
      .select(
        `
        id,
        user_id,
        session_type,
        flown_on,
        duration_minutes,
        drone_id,
        controller_id,
        location_id,
        track_id,
        sim_platform,
        packs_flown,
        crashes,
        battery_notes,
        weather,
        notes,
        created_at,
        updated_at,
        goggles_id
      `,
      )
      // Defense in depth: enforce ownership in the WHERE clause, not just via
      // the token client (RLS may not apply to edge-function queries).
      .eq("user_id", user.id)
      .in("id", validIds)
      .order("id");

    if (sessionError) {
      return new Response(JSON.stringify({ error: sessionError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const transmitterIds = new Set<string>();
    const droneIds = new Set<string>();
    const gogglesIds = new Set<string>();

    for (const session of sessions) {
      if (session.controller_id) transmitterIds.add(session.controller_id);
      if (session.drone_id) droneIds.add(session.drone_id);
      if (session.goggles_id) gogglesIds.add(session.goggles_id);
    }

    const { data: transmitters, error: transmitterError } = await supabase
      .from("personal_gear.transmitters")
      .select("id, name")
      .in("id", Array.from(transmitterIds));

    if (transmitterError) {
      return new Response(JSON.stringify({ error: transmitterError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const { data: drones, error: droneError } = await supabase
      .from("personal_gear.drones")
      .select("id, name")
      .in("id", Array.from(droneIds));

    if (droneError) {
      return new Response(JSON.stringify({ error: droneError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const { data: goggles, error: gogglesError } = await supabase
      .from("personal_gear.goggles")
      .select("id, name")
      .in("id", Array.from(gogglesIds));

    if (gogglesError) {
      return new Response(JSON.stringify({ error: gogglesError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const transmitterMap = new Map<string, string>();
    for (const t of transmitters ?? []) {
      transmitterMap.set(t.id, t.name);
    }

    const droneMap = new Map<string, string>();
    for (const d of drones ?? []) {
      droneMap.set(d.id, d.name);
    }

    const gogglesMap = new Map<string, string>();
    for (const g of goggles ?? []) {
      gogglesMap.set(g.id, g.name);
    }

    const enrichedSessions: SessionGearData[] = sessions.map((session) => ({
      ...session,
      transmitter: session.controller_id
        ? (transmitterMap.get(session.controller_id) ?? null)
        : null,
      drone: session.drone_id ? (droneMap.get(session.drone_id) ?? null) : null,
      goggles: session.goggles_id
        ? (gogglesMap.get(session.goggles_id) ?? null)
        : null,
    }));

    return new Response(JSON.stringify({ data: enrichedSessions }), {
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
