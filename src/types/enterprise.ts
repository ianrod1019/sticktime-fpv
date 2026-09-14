/**
 * enterprise — the typed client contract for the consumer enterprise
 * plane (districts, org lockdowns, meetups). Mirrors the RPCs in
 * supabase/migrations/20260927100300_enterprise_rpcs.sql. Keep in sync.
 */

export const POLICY_KEYS = [
  "lock_profile_settings",
  "require_preflight_checklist",
  "enforce_firmware_version",
  "lock_inventory",
] as const;

export type PolicyKey = (typeof POLICY_KEYS)[number];

export const POLICY_META: Record<
  PolicyKey,
  { label: string; short: string; description: string }
> = {
  lock_profile_settings: {
    label: "Lock profile settings",
    short: "PROFILES",
    description:
      "Pilots cannot edit their callsign, bio, or weekly goal. Squadron and district admins keep edit rights.",
  },
  require_preflight_checklist: {
    label: "Require pre-flight checklist",
    short: "PREFLIGHT",
    description:
      "Flight logs stay locked until the pilot completes the pre-flight checklist for the session.",
  },
  enforce_firmware_version: {
    label: "Enforce minimum firmware",
    short: "FIRMWARE",
    description:
      "Sessions require the hull's firmware to be at or above the squadron minimum.",
  },
  lock_inventory: {
    label: "Lock team inventory",
    short: "FLEET",
    description:
      "Pilots cannot add, edit, or remove team hangar gear. Admins keep full fleet control.",
  },
};

export type EnterpriseRole = "district_admin" | "squadron_admin" | "pilot";

export interface EnterprisePlan {
  code: "standard_squadron" | "multi_district";
  name: string;
  annual_price_floor: number;
  max_orgs: number | null;
  max_seats_per_org: number | null;
  district_features: boolean;
  description: string | null;
}

export interface MyEnterpriseMembership {
  enterprise_id: string;
  enterprise_name: string;
  plan_code: EnterprisePlan["code"];
  plan_name: string;
  annual_price_floor: number;
  district_features: boolean;
  /** The caller's resolved role in this org. */
  my_role: EnterpriseRole;
  organization_id: string;
  organization_name: string;
  team_id: string;
  is_school: boolean;
}

export interface EnterpriseTotals {
  org_count: number;
  active_pilots: number;
  squadron_admins: number;
  fleet_size: number;
  flight_hours_30d: number;
  active_enforcements: number;
}

export interface EnterprisePerOrgStats {
  organization_id: string;
  name: string;
  is_school: boolean;
  team_id: string;
  active_pilots: number;
  squadron_admins: number;
  fleet_size: number;
  flight_hours_30d: number;
  active_policies: number;
}

export interface EnterpriseMetrics {
  enterprise_id: string;
  generated_at: string;
  totals: EnterpriseTotals;
  per_org: EnterprisePerOrgStats[];
}

export interface ResolvedPolicy {
  policy_key: PolicyKey;
  enabled: boolean;
  min_firmware_version: string | null;
  /** 'org' = set at this org; 'enterprise' = inherited district default. */
  scope: "org" | "enterprise";
  updated_at: string;
  updated_by: string | null;
}

/** Payload for set_org_policies: one entry per policy the UI manages. */
export interface PolicyPatch {
  key: PolicyKey;
  enabled: boolean;
  min_firmware_version?: string | null;
}

export type MeetupResponse = "attending" | "declined";

export interface SquadronMeetup {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  created_by: string;
  session_id: string | null;
  attending_count: number;
  declined_count: number;
  my_response: MeetupResponse | null;
}

export interface MeetupDraft {
  title: string;
  description: string;
  location: string;
  /** Local datetime strings for <input type="datetime-local">. */
  start_time: string;
  end_time: string;
}

/** True when the role may configure policies / schedule meetups. */
export function canManageOrg(role: EnterpriseRole): boolean {
  return role === "district_admin" || role === "squadron_admin";
}
