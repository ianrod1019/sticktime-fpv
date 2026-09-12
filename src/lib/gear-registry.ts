/**
 * Canonical gear registry: one map from UI gear type -> DB tables and labels.
 * The legacy per-component maps in useHangerItem.ts / use-gear-item.ts remain
 * for their callers; this is the shared reference other code imports.
 * Keep this dependency-free so hooks, cards, routes and pages can import it.
 */

export const GEAR_TYPES = [
  "quad",
  "battery",
  "transmitter",
  "goggles",
  "other",
] as const;

export type GearTypeUi = (typeof GEAR_TYPES)[number];

export interface GearTableEntry {
  /** personal_gear table holding the gear row. */
  table: string;
  /** Per-gear parts table (null when the type has none). */
  partsTable: string | null;
  label: string;
  /** Types with a service clock (batteries don't). */
  hasServiceClock: boolean;
}

export const GEAR_REGISTRY: Record<GearTypeUi, GearTableEntry> = {
  quad: {
    table: "drones",
    partsTable: "drone_parts",
    label: "Drone / Quad",
    hasServiceClock: true,
  },
  battery: {
    table: "batteries",
    partsTable: null,
    label: "Battery Set",
    hasServiceClock: false,
  },
  transmitter: {
    table: "transmitters",
    partsTable: "transmitter_parts",
    label: "Controller / Radio",
    hasServiceClock: true,
  },
  goggles: {
    table: "goggles",
    partsTable: "goggles_parts",
    label: "Goggles",
    hasServiceClock: true,
  },
  other: {
    table: "other_gear",
    partsTable: "other_parts",
    label: "Other Gear",
    hasServiceClock: true,
  },
};

/** Alternate spellings accepted in URLs / legacy code. */
const ALIASES: Record<string, GearTypeUi> = {
  drone: "quad",
  goggle: "goggles",
};

export function isGearTypeUi(value: string): value is GearTypeUi {
  return value in GEAR_REGISTRY;
}

/** Normalizes 'drone' -> 'quad', 'goggle' -> 'goggles', else passes through. */
export function normalizeGearType(value: string): GearTypeUi | null {
  const canonical = ALIASES[value] ?? value;
  return isGearTypeUi(canonical) ? canonical : null;
}

export function getGearTableName(type: string): string {
  return GEAR_REGISTRY[type as GearTypeUi]?.table ?? "";
}

export function getGearPartsTable(type: string): string | null {
  return GEAR_REGISTRY[type as GearTypeUi]?.partsTable ?? null;
}

export function getGearLabel(type: string): string {
  return GEAR_REGISTRY[type as GearTypeUi]?.label ?? type;
}
