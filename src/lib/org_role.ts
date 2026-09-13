/**
 * org_role — the typed squadron-role contract, mirroring the server.
 *
 * `org_gear.org_role` is a Postgres enum ('owner' | 'manager' | 'member')
 * and `get_my_org_role(team_id)` returns the caller's role plus the
 * resolved permission flags (RLS policies and the money-lock triggers
 * enforce the same matrix server-side). This module is the client-side
 * face of that contract: the union, the permission matrix, and helpers.
 * Keep in sync with supabase/migrations/20260926000000_org_role_typed_rbac.sql.
 */

export const ORG_ROLES = ["owner", "manager", "member"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

/** Parse an untrusted role string; null when it is not a valid role. */
export function parseOrgRole(value: unknown): OrgRole | null {
  return isOrgRole(value) ? value : null;
}

/** Permission flags as returned by get_my_org_role (plus its role). */
export interface OrgRoleGrant {
  role: OrgRole;
  /** May add/edit/delete squadron gear (owner/manager, or granted
   *  member — per-member switch or custom role template). */
  canWrite: boolean;
  /** Owner/manager (or platform staff): may set purchase costs etc. */
  canEditMoney: boolean;
  /** Owner only (or platform staff): member management actions. */
  canManageMembers: boolean;
  /** Owner/manager, granted members, or platform staff. */
  canViewLedger: boolean;
  /** May open squadron failure analytics (owner/manager, granted member,
   *  or platform staff). */
  canViewAnalytics: boolean;
}

/**
 * The full matrix, derived the same way the server derives it. Use for
 * optimistic UI or when no team id is known yet; prefer get_my_org_role
 * (via useOrgRole) whenever a team id exists. Member-level gear-edit and
 * analytics grants are per-member/per-role on the server and cannot be
 * derived from the role alone — this returns the documented defaults
 * (NULL switch = default access).
 */
export function permissionsForRole(role: OrgRole, isSiteAdmin = false): Omit<OrgRoleGrant, "role"> {
  return {
    canWrite: true,
    canEditMoney: isSiteAdmin || role === "owner" || role === "manager",
    canManageMembers: isSiteAdmin || role === "owner",
    canViewLedger: isSiteAdmin || role === "owner" || role === "manager",
    canViewAnalytics: true,
  };
}

/** Rank for sorting member lists (owner first, then manager, then member). */
export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  owner: 0,
  manager: 1,
  member: 2,
};
