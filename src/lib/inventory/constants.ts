/**
 * Master inventory (personal_gear.drone_parts) shared constants.
 * Kept dependency-free so hooks, cards and forms can import safely.
 */

export const PART_CATEGORIES = [
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
] as const;

export type PartCategory = (typeof PART_CATEGORIES)[number];

export const PART_STATUSES = [
  "shelf",
  "installed",
  "broken",
  "retired",
] as const;

export type PartStatus = (typeof PART_STATUSES)[number];

export const CATEGORY_LABELS: Record<PartCategory, string> = {
  motor: "Motor",
  vtx: "VTX",
  aio: "AIO",
  frame: "Frame",
  fc: "Flight Controller",
  esc: "ESC",
  rx: "Receiver",
  camera: "Camera",
  battery: "Battery",
  other: "Other",
};

export const STATUS_LABELS: Record<PartStatus, string> = {
  shelf: "On Shelf",
  installed: "Installed",
  broken: "Broken",
  retired: "Retired",
};

/** Tailwind classes per status, used by badges in the grid. */
export const STATUS_BADGE_CLASSES: Record<PartStatus, string> = {
  shelf: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  installed: "border-primary/40 bg-primary/10 text-primary",
  broken: "border-destructive/40 bg-destructive/10 text-destructive",
  retired: "border-muted-foreground/40 bg-muted/40 text-muted-foreground",
};

export const PARTS_TABLE = "drone_parts" as const;
export const INSTALLS_TABLE = "drone_part_installs" as const;

/** Where a part went when it came off an airframe. */
export const REMOVAL_REASONS = [
  "broken",
  "upgrade",
  "maintenance",
  "transfer",
  "other",
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number];

export const REMOVAL_REASON_LABELS: Record<RemovalReason, string> = {
  broken: "Part died",
  upgrade: "Upgraded",
  maintenance: "Maintenance",
  transfer: "Moved to another quad",
  other: "Other",
};

export const PRO_FEATURE_NAME = "Bench Spare Manager";
export const PRO_FEATURE_BLURB =
  "Relational inventory, airframe installs and component lifespan analytics are Pro-tier features. Upgrade to track every spare against every quad.";
