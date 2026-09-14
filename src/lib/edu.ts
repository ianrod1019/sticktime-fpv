/**
 * edu — the client-side face of the institutional (FERPA) plane.
 *
 * Mirrors the server contract from supabase/migrations/20260927000200:
 * every cross-member read and every mutation is a guarded, audited RPC.
 * The UI only decides WHAT to render; the server decides WHAT is allowed.
 */

import { supabase } from "@/integrations/supabase/client";

export const EDU_ROLES = [
  "student",
  "instructor",
  "school_admin",
  "district_admin",
] as const;

export type EduRole = (typeof EDU_ROLES)[number];

export function isEduRole(value: unknown): value is EduRole {
  return (
    typeof value === "string" &&
    (EDU_ROLES as readonly string[]).includes(value)
  );
}

/** Rank for sorting rosters (staff before students). */
export const EDU_ROLE_RANK: Record<EduRole, number> = {
  district_admin: 0,
  school_admin: 1,
  instructor: 2,
  student: 3,
};

export const EDU_ROLE_LABEL: Record<EduRole, string> = {
  student: "Student",
  instructor: "Instructor",
  school_admin: "School Admin",
  district_admin: "District Admin",
};

export interface EduMembership {
  membership_id: string;
  school_id: string;
  district_id: string;
  school_name: string;
  district_name: string;
  edu_role: EduRole;
  status: "active" | "archived";
}

export interface EduStudent {
  user_id: string;
  callsign: string;
  membership_id: string;
  assigned_at: string;
}

export interface EduRosterMember {
  membership_id: string;
  user_id: string;
  edu_role: EduRole;
  status: string;
  callsign: string;
}

export interface EduFlightStats {
  session_count: number;
  total_minutes: number;
  sim_minutes: number;
  real_minutes: number;
  first_session: string | null;
  last_session: string | null;
}

export interface EduRecentSession {
  id: string;
  session_type: "sim" | "real";
  flown_on: string;
  duration_minutes: number;
  sim_platform: string | null;
  packs_flown: number;
  crashes: number;
  created_at: string;
}

export interface EduOpenCheckout {
  gear_id: string;
  checked_out_at: string;
}

export interface EduStudentRecord {
  student_user_id: string;
  district_id: string;
  school_id: string;
  callsign: string;
  via: "self" | "instructor_assignment" | "school_admin" | "district_admin";
  flight_stats: EduFlightStats;
  recent_sessions: EduRecentSession[];
  open_checkouts: EduOpenCheckout[];
}

export interface EduSchoolSummary {
  school_id: string;
  name: string;
  students: number;
  instructors: number;
  open_assignments: number;
}

export interface EduDistrictOverview {
  district_id: string;
  generated_at: string;
  totals: {
    schools: number;
    students: number;
    instructors: number;
    school_admins: number;
    open_assignments: number;
    pending_enrollments: number;
  };
  per_school: EduSchoolSummary[];
  flight_minutes_30d: number;
}

async function rpc<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw error;
  return data as T;
}

/** The caller's institutional memberships (nav + gating source). */
export function getMyMemberships(): Promise<EduMembership[]> {
  return rpc<EduMembership[]>("edu_get_my_memberships", {});
}

/** Instructors: students assigned to them in one school. */
export function listMyStudents(schoolId: string): Promise<EduStudent[]> {
  return rpc<EduStudent[]>("edu_list_my_students", { _school_id: schoolId });
}

/** School/district admins: a school's full roster with callsigns. */
export function listSchoolRoster(schoolId: string): Promise<EduRosterMember[]> {
  return rpc<EduRosterMember[]>("edu_list_school_roster", {
    _school_id: schoolId,
  });
}

/**
 * The audited educational-record read. Works for self too, but the UI
 * uses it only for cross-member access; students have their own pages.
 */
export function getStudentRecord(
  studentUserId: string,
): Promise<EduStudentRecord> {
  return rpc<EduStudentRecord>("edu_get_student_record", {
    _student_user_id: studentUserId,
  });
}

/** District admins: aggregate-only district overview. */
export function getDistrictOverview(
  districtId: string,
): Promise<EduDistrictOverview> {
  return rpc<EduDistrictOverview>("edu_district_overview", {
    _district_id: districtId,
  });
}

/** School admins: stage a roster entry (no email is sent). */
export function queueEnrollment(input: {
  schoolId: string;
  schoolEmail: string;
  eduRole: EduRole;
  displayName?: string;
}): Promise<string> {
  return rpc<string>("edu_queue_enrollment", {
    _school_id: input.schoolId,
    _school_email: input.schoolEmail,
    _edu_role: input.eduRole,
    _display_name: input.displayName ?? null,
  });
}

/** District/school admins: assign an instructor to a student. */
export function assignInstructor(input: {
  schoolId: string;
  instructorUserId: string;
  studentUserId: string;
}): Promise<string> {
  return rpc<string>("edu_assign_instructor", {
    _school_id: input.schoolId,
    _instructor_user_id: input.instructorUserId,
    _student_user_id: input.studentUserId,
  });
}

/** District/school admins: end an assignment (history is kept). */
export function endAssignment(assignmentId: string): Promise<void> {
  return rpc<void>("edu_end_assignment", { _assignment_id: assignmentId });
}

/** District admins: archive a membership (record kept, access ends). */
export function archiveMember(membershipId: string): Promise<void> {
  return rpc<void>("edu_archive_member", { _membership_id: membershipId });
}

/** District admins: reinstate an archived membership. */
export function reinstateMember(membershipId: string): Promise<void> {
  return rpc<void>("edu_reinstate_member", { _membership_id: membershipId });
}

/** District admins: create a school in their district. */
export function createSchool(input: {
  districtId: string;
  name: string;
  siteCode?: string;
}): Promise<string> {
  return rpc<string>("edu_create_school", {
    _district_id: input.districtId,
    _name: input.name,
    _site_code: input.siteCode ?? null,
  });
}

/** Convenience: the caller's highest-privilege active role. */
export function highestRole(memberships: EduMembership[]): EduRole | null {
  const active = memberships.filter((m) => m.status === "active");
  if (active.length === 0) return null;
  return active
    .map((m) => m.edu_role)
    .reduce((best, role) =>
      EDU_ROLE_RANK[role] < EDU_ROLE_RANK[best] ? role : best,
    );
}
