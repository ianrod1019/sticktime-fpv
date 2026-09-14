// Provision a queued roster member — edge function, service-role backend.
//
// The browser never holds the service-role key. Flow:
//   1. Caller's JWT is verified (RLS-scoped client) — must be a school
//      admin of THIS school or the district admin of its district, and
//      the queued email must be on the school's pending roster.
//   2. The auth account is matched by email via edu_find_auth_user_by_email
//      (or created with email_confirm: true). NO email is ever sent by
//      this path — AGENTS.md forbids auth emails to test domains, and
//      account-setup links belong to the school's own process.
//   3. edu_provision_member links the membership and clears the staged
//      email — service-role-only, so the web client cannot call it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkBodySize,
  checkRateLimit,
  jsonResponse,
  preflightResponse,
} from "../_shared/http.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDU_ROLES = new Set(["student", "instructor", "school_admin"]);

Deno.serve(async (req) => {
  const preflight = preflightResponse(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "POST only" }, 405);
    }
    const sizeRejection = await checkBodySize(req);
    if (sizeRejection) return sizeRejection;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // RLS-scoped client for caller identity + authorization checks.
    const authed = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } =
      await authed.auth.getUser(token);
    if (authError || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const callerId = userData.user.id;

    const rateLimited = await checkRateLimit(
      authed,
      "edu-provision-member",
      callerId,
      60,
      60,
    );
    if (rateLimited) return rateLimited;

    const body = (await req.json()) as {
      schoolId?: string;
      email?: string;
      displayName?: string;
    };
    const schoolId = body.schoolId ?? "";
    const email = (body.email ?? "").trim().toLowerCase();
    const displayName = (body.displayName ?? "").trim();

    if (!UUID_RE.test(schoolId) || !EMAIL_RE.test(email)) {
      return jsonResponse({ error: "schoolId and email are required" }, 400);
    }

    // The school's district — and whether the caller can act on it.
    const { data: school } = await authed
      .schema("edu")
      .from("schools")
      .select("district_id")
      .eq("id", schoolId)
      .single();
    if (!school) return jsonResponse({ error: "School not found" }, 404);

    const { data: memberships } = await authed
      .schema("edu")
      .from("memberships")
      .select("edu_role, school_id, district_id, status")
      .eq("user_id", callerId)
      .eq("status", "active")
      .in("edu_role", ["school_admin", "district_admin"]);

    const authorized = (memberships ?? []).some((m) =>
      m.edu_role === "school_admin"
        ? m.school_id === schoolId
        : m.district_id === school.district_id,
    );
    if (!authorized) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // The email must be on this school's pending roster (queued via
    // edu_queue_enrollment — provisioning never bypasses the queue).
    const { data: pending, error: pendingError } = await authed
      .schema("edu")
      .from("pending_roster")
      .select("id, edu_role, display_name")
      .eq("school_id", schoolId)
      .eq("school_email", email)
      .maybeSingle();
    if (pendingError || !pending) {
      return jsonResponse(
        { error: "Email is not on this school's pending roster" },
        400,
      );
    }

    // Match or create the auth account — silently, never by email.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: found, error: findError } = await admin.rpc(
      "edu_find_auth_user_by_email",
      { p_email: email },
    );
    if (findError) {
      return jsonResponse({ error: findError.message }, 500);
    }

    let userId = (found ?? null) as string | null;
    let created = false;
    if (!userId) {
      const { data: createdUser, error: createError } =
        await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            callsign: displayName || "student",
          },
        });
      if (createError || !createdUser?.user) {
        return jsonResponse(
          { error: createError?.message ?? "create_user_failed" },
          500,
        );
      }
      userId = createdUser.user.id;
      created = true;
    }

    // Link the membership (service-role-only RPC, also clears the email).
    const { data: provisioned, error: provisionError } = await admin.rpc(
      "edu_provision_member",
      { _school_id: schoolId, _email: email, _user_id: userId },
    );
    if (provisionError) {
      return jsonResponse({ error: provisionError.message }, 500);
    }
    const result = provisioned as { provisioned: boolean; reason?: string };
    if (!result?.provisioned) {
      return jsonResponse({ error: result?.reason ?? "provision_failed" }, 409);
    }

    return jsonResponse(
      { provisioned: true, userId, created, edu_role: pending.edu_role },
      200,
    );
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  }
});
