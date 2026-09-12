import type { PartCategory, PartStatus } from "./constants";

/** Canonical shape of a personal_gear.drone_parts row. */
export interface DronePart {
  id: string;
  user_id: string;
  category: PartCategory | string;
  name: string;
  brand: string | null;
  status: string | null;
  specs: Record<string, unknown> | null;
  created_at: string;
  /** Ledger fields (20260919010000 migration). */
  purchase_cost: number | string | null;
  purchase_date: string | null;
  vendor: string | null;
}

/** Input payload accepted by the insert/update mutations. */
export interface PartInput {
  category: PartCategory;
  name: string;
  brand?: string | null;
  status: PartStatus;
  specs?: Record<string, string>;
  purchase_cost?: number | null;
  purchase_date?: string | null;
  vendor?: string | null;
}

/** Canonical shape of a personal_gear.drone_part_installs row. */
export interface PartInstall {
  id: string;
  user_id: string;
  drone_id: string;
  part_id: string;
  quantity: number;
  installed_at: string;
  /** NULL while the part is still mounted. */
  uninstalled_at: string | null;
  /** Set together with uninstalled_at; 'broken' means the part died. */
  removal_reason:
    | "broken"
    | "upgrade"
    | "maintenance"
    | "transfer"
    | "other"
    | null;
  notes: string | null;
}

export function isPartStatus(value: string | null): value is PartStatus {
  return (
    value === "shelf" ||
    value === "installed" ||
    value === "broken" ||
    value === "retired"
  );
}

export function isPartCategory(value: string): value is PartCategory {
  return [
    "motor",
    "vtx",
    "aio",
    "frame",
    "fc",
    "esc",
    "rx",
    "camera",
    "battery",
    "other",
  ].includes(value);
}

export function normalizeSpecs(specs: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!specs || typeof specs !== "object") return out;
  for (const [key, value] of Object.entries(specs as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}
