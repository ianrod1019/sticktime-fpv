/**
 * Scheduling API — typed calls to the edu scheduling module.
 *
 * Two transport shapes:
 *  - RPCs via supabase.rpc() → the public.edu_scheduling_* wrappers
 *    (supabase-js rpc only addresses the public schema).
 *  - Table writes via supabase.schema("edu").from("schedules") → guarded
 *    by RLS + the scheduling-gate/assignee/validator triggers, so the
 *    client never needs permission logic of its own.
 *
 * The fleet pickers reuse the delta-sync db_request transport for
 * org_gear, exactly like the squadron hanger pickers.
 */

import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import type {
  BookingPayload,
  GearOption,
  PersonConflict,
  RosterMember,
  ScheduleEvent,
  SchedulingAccess,
} from "./types";

/* -------------------------------------------------------------------------
 * Error classification — maps Postgres rejections to UI intent.
 * ---------------------------------------------------------------------- */

export type SchedulingErrorKind =
  | "gear_conflict" // 23P01 exclusion: hardware double-booked
  | "tier" // hobbyist/pro writing
  | "addon" // school org without the add-on
  | "forbidden" // RLS / membership / manage-rights denial
  | "unknown";

export interface ClassifiedError {
  kind: SchedulingErrorKind;
  message: string;
}

const GEAR_CONSTRAINTS = [
  "schedules_no_airframe_overlap",
  "schedules_no_battery_overlap",
] as const;

export function classifySchedulingError(error: unknown): ClassifiedError {
  const err = error as { code?: string; message?: string; hint?: string };
  const code = err?.code ?? "";
  const message = err?.message ?? "Something went wrong saving this booking.";

  if (code === "23P01" || GEAR_CONSTRAINTS.some((c) => message.includes(c))) {
    const isBattery = message.includes("battery");
    return {
      kind: "gear_conflict",
      message: isBattery
        ? "That battery is already booked for an overlapping slot."
        : "That airframe is already booked for an overlapping slot.",
    };
  }
  if (message.includes("Solo Commercial, School, or Enterprise tier")) {
    return {
      kind: "tier",
      message:
        "Scheduling requires a Solo Commercial, School, or Enterprise tier.",
    };
  }
  if (message.includes("Scheduling Add-On not purchased")) {
    return {
      kind: "addon",
      message: "Your organization hasn't purchased the Scheduling Add-On yet.",
    };
  }
  if (
    (code === "42501" && message.includes("row-level security")) ||
    message.includes("not a member of this organization") ||
    message.includes("does not belong to this organization") ||
    message.includes("access denied")
  ) {
    return {
      kind: "forbidden",
      message:
        "The server rejected this change — the assigned person may no longer be on this org's roster, or your manage rights changed. Reload the board and try again.",
    };
  }
  if (code === "42501" || code === "23503") {
    return { kind: "forbidden", message };
  }
  return { kind: "unknown", message };
}

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

export async function getSchedulingAccess(
  teamId: string,
): Promise<SchedulingAccess> {
  const { data, error } = await supabase.rpc("edu_scheduling_access", {
    _team_id: teamId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (
    row ?? {
      enabled: false,
      tier_ok: false,
      addon_purchased: false,
      can_manage: false,
      org_role: null,
    }
  );
}

export async function getScheduleEvents(params: {
  teamId: string;
  from: string;
  to: string;
  assignedUserFilter?: string | null;
}): Promise<ScheduleEvent[]> {
  const { data, error } = await supabase.rpc("edu_schedule_events", {
    _team_id: params.teamId,
    _from: params.from,
    _to: params.to,
    _assigned_user_filter: params.assignedUserFilter ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ScheduleEvent[];
}

export async function getOrgRoster(teamId: string): Promise<RosterMember[]> {
  const { data, error } = await supabase.rpc("edu_org_roster", {
    _team_id: teamId,
  });
  if (error) throw error;
  return (data ?? []) as RosterMember[];
}

export async function getPersonConflicts(params: {
  userId: string;
  start: string;
  end: string;
  excludeId?: string | null;
}): Promise<PersonConflict[]> {
  const { data, error } = await supabase.rpc("edu_person_conflicts", {
    _user_id: params.userId,
    _start: params.start,
    _end: params.end,
    _exclude_id: params.excludeId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as PersonConflict[];
}

/** Org airframes for the picker (org_gear.drones via db_request). */
export async function getOrgAirframes(teamId: string): Promise<GearOption[]> {
  const { data, error } = await db_request({
    mode: "query",
    schema: "org_gear",
    table: "drones",
    operation: "select",
    selectColumns: "id, name",
    filters: { team_id: teamId },
    orderBy: { column: "name", ascending: true },
  });
  if (error) throw error;
  return (data ?? []) as GearOption[];
}

/** Org battery sets for the picker (org_gear.batteries via db_request). */
export async function getOrgBatteries(teamId: string): Promise<GearOption[]> {
  const { data, error } = await db_request({
    mode: "query",
    schema: "org_gear",
    table: "batteries",
    operation: "select",
    selectColumns: "id, name",
    filters: { team_id: teamId },
    orderBy: { column: "name", ascending: true },
  });
  if (error) throw error;
  return (data ?? []) as GearOption[];
}

/* -------------------------------------------------------------------------
 * Writes — every mutation is enforced server-side (RLS + triggers).
 * ---------------------------------------------------------------------- */

function schedulesTable() {
  return supabase.schema("edu").from("schedules");
}

/**
 * Create a booking. The caller must supply organization_id — the INSERT
 * RLS policy evaluates can_manage_schedule(organization_id), so a row
 * without it is rejected as a policy violation rather than created.
 */
export async function insertBooking(
  payload: BookingPayload & { organization_id: string },
): Promise<void> {
  const { error } = await schedulesTable().insert(payload);
  if (error) throw error;
}

export async function updateBooking(
  id: string,
  patch: Partial<BookingPayload>,
): Promise<void> {
  const { error } = await schedulesTable().update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteBooking(id: string): Promise<void> {
  const { error } = await schedulesTable().delete().eq("id", id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------
 * Realtime — repaint the grid when a teammate moves a booking.
 * ---------------------------------------------------------------------- */

export function subscribeToScheduleEvents(
  teamId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`edu-schedules-${teamId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "edu",
        table: "schedules",
        filter: `organization_id=eq.${teamId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
