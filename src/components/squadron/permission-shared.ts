/**
 * Shared types + labels for the squadron permission surfaces
 * (member panel, batch bar, role templates).
 */
export type PermissionKey = "can_edit_gear" | "can_view_analytics" | "can_view_ledger";

export const PERMISSION_LABELS: Record<
  PermissionKey,
  { short: string; hint: string }
> = {
  can_edit_gear: { short: "Gear", hint: "Add, edit and remove squadron gear" },
  can_view_analytics: { short: "Analytics", hint: "Open squadron failure analytics" },
  can_view_ledger: { short: "Ledger", hint: "View the squadron fleet cost ledger" },
};

export const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

export interface TeamRole {
  id: string;
  name: string;
  can_edit_gear: boolean;
  can_view_analytics: boolean;
  can_view_ledger: boolean;
}
