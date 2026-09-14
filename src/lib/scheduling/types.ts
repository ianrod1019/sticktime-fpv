/**
 * Scheduling types — the client contract for the edu scheduling module.
 *
 * Mirrors supabase/migrations/20260914120000 (edu.get_schedule_events,
 * edu.get_scheduling_access, edu.find_person_conflicts). The server is
 * the source of truth for authorization; these types only shape it.
 */

/** A booking status. Active statuses are `scheduled` and `checked_in`. */
export type ScheduleStatus =
  "scheduled" | "checked_in" | "completed" | "cancelled" | "no_show";

export const SCHEDULE_STATUSES: ScheduleStatus[] = [
  "scheduled",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
];

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  scheduled: "Scheduled",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const ACTIVE_STATUSES: ScheduleStatus[] = ["scheduled", "checked_in"];

export function isActiveStatus(s: ScheduleStatus): boolean {
  return s === "scheduled" || s === "checked_in";
}

/** One row of `edu.get_schedule_events`. */
export interface ScheduleEvent {
  id: string;
  organization_id: string;
  event_title: string;
  description: string | null;
  assigned_user_id: string;
  assigned_callsign: string;
  airframe_id: string | null;
  airframe_name: string | null;
  battery_id: string | null;
  battery_name: string | null;
  start_time: string;
  end_time: string;
  status: ScheduleStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** One row of `edu.get_scheduling_access`. */
export interface SchedulingAccess {
  enabled: boolean;
  tier_ok: boolean;
  addon_purchased: boolean;
  can_manage: boolean;
  org_role: string | null;
}

/** One row of `edu.get_org_roster`. */
export interface RosterMember {
  user_id: string;
  callsign: string;
  org_role: string;
}

/** One row of `edu.find_person_conflicts`. */
export interface PersonConflict {
  id: string;
  event_title: string;
  start_time: string;
  end_time: string;
  status: ScheduleStatus;
}

/** An org airframe for the gear pickers (mirrors DroneOption). */
export interface GearOption {
  id: string;
  name: string;
}

/** Payload for create / edit mutations. */
export interface BookingPayload {
  event_title: string;
  description: string | null;
  assigned_user_id: string;
  airframe_id: string | null;
  battery_id: string | null;
  start_time: string;
  end_time: string;
  status: ScheduleStatus;
}

/** Drag/resize intents from the calendar grid. */
export interface MoveIntent {
  id: string;
  start_time: string;
  end_time: string;
}
