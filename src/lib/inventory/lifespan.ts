import type { DronePart, PartInstall } from "./types";

/**
 * Component lifespan analytics (Pro feature).
 *
 * "Lifespan" is derived from the install history (personal_gear.
 * drone_part_installs): parts accumulate time across completed install
 * periods plus the running period of still-open installs. Broken/retired
 * parts freeze their totals — an open install on a part no longer mounted
 * nowhere contributes time after its uninstall timestamp.
 */

const MS_PER_MINUTE = 60_000;

export interface LifespanBreakdown {
  /** Minutes accumulated across completed + running install periods. */
  minutesInstalled: number;
  /** Number of airframes this part has ever been installed on. */
  airframesUsed: number;
  /** Currently mounted on an airframe (true) or free on the bench (false). */
  isInstalled: boolean;
}

export function computeLifespan(
  part: Pick<DronePart, "created_at" | "status">,
  installs: Pick<
    PartInstall,
    "drone_id" | "installed_at" | "uninstalled_at"
  >[],
  now: Date = new Date(),
): LifespanBreakdown {
  if (installs.length === 0) {
    return {
      minutesInstalled: 0,
      airframesUsed: 0,
      isInstalled: false,
    };
  }

  const sorted = [...installs].sort(
    (a, b) => Date.parse(a.installed_at) - Date.parse(b.installed_at),
  );

  let minutes = 0;
  const airframes = new Set<string>();
  let currentlyMounted = false;

  for (const install of sorted) {
    const start = Date.parse(install.installed_at);
    const safeStart = Number.isNaN(start) ? now.getTime() : start;
    const endRaw = install.uninstalled_at
      ? Date.parse(install.uninstalled_at)
      : Number.NaN;
    const end = Number.isNaN(endRaw) ? now.getTime() : endRaw;
    const safeEnd = end < safeStart ? safeStart : end;
    minutes += (safeEnd - safeStart) / MS_PER_MINUTE;
    airframes.add(install.drone_id);
    if (!install.uninstalled_at) currentlyMounted = true;
  }

  return {
    minutesInstalled: Math.max(0, Math.round(minutes)),
    airframesUsed: airframes.size,
    isInstalled: currentlyMounted,
  };
}

/** Human formatting: 90 -> "1h 30m". */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Bench health snapshot used by the dashboard stats bar (free for everyone —
 * only the deep per-part analytics and install flows are Pro-gated).
 */
export interface BenchStats {
  total: number;
  byStatus: Record<string, number>;
  sparesAvailable: number;
}

export function computeBenchStats(parts: DronePart[]): BenchStats {
  const byStatus: Record<string, number> = {};
  let sparesAvailable = 0;
  for (const part of parts) {
    const status = part.status ?? "shelf";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status === "shelf") sparesAvailable += 1;
  }
  return { total: parts.length, byStatus, sparesAvailable };
}
