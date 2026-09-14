/**
 * board-layout — the pure geometry for the per-person week board.
 *
 * Given one person's jobs for one day, assign each block an x-offset and
 * width (fractions of the day column) such that:
 *   * blocks never overlap,
 *   * a free block sits exactly at its time-of-day position,
 *   * conflicting jobs pack side-by-side into lanes, scaled to share the
 *     cluster's horizontal span fairly (calendar column packing),
 *   * clusters far apart each get their own horizontal span.
 *
 * This is a pure function over [0, 1]; rendering maps it to pixels.
 */

export interface PositionedJob {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  left: number;
  width: number;
}

export interface LayoutInput {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
}

const DAY_START_H = 7; // 07:00 local
const DAY_END_H = 21; // 21:00 local
const SPAN = DAY_END_H - DAY_START_H;

interface Interval {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  start: number;
  end: number;
}

/** Hours since local midnight of the job's start day. */
function hourOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Clamp into the visible window; null if fully outside 07:00–21:00. */
function clampToDay(job: LayoutInput): Interval | null {
  const start = hourOf(job.scheduled_start);
  // Overnight jobs (end after midnight) wrap: hourOf(end) is small, so
  // lift it a day before clamping or the visible tail collapses.
  let rawEnd = hourOf(job.scheduled_end);
  if (rawEnd < start) rawEnd += 24;
  const end = Math.max(rawEnd, start + 0.25);
  const s = Math.max(DAY_START_H, start);
  const e = Math.min(DAY_END_H, end);
  return e > s
    ? {
        id: job.id,
        scheduled_start: job.scheduled_start,
        scheduled_end: job.scheduled_end,
        start: s,
        end: e,
      }
    : null;
}

/**
 * Maximal overlap clusters: sort by start; a new cluster begins when the
 * next interval starts at/after the current cluster's max end.
 */
function clusters(intervals: Interval[]): Interval[][] {
  const sorted = [...intervals].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const out: Interval[][] = [];
  let current: Interval[] = [];
  let maxEnd = -Infinity;
  for (const it of sorted) {
    if (current.length > 0 && it.start >= maxEnd) {
      out.push(current);
      current = [];
      maxEnd = -Infinity;
    }
    current.push(it);
    maxEnd = Math.max(maxEnd, it.end);
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Greedy lane assignment within a cluster: first lane whose last block
 * ends before this block starts; else a new lane. Returns lane index per
 * interval and the lane count for the cluster.
 */
function assignLanes(
  cluster: Interval[],
): Array<{ interval: Interval; lane: number; laneCount: number }> {
  const laneEnds: number[] = [];
  const lanes: number[] = [];
  for (const it of cluster) {
    let lane = laneEnds.findIndex((end) => end <= it.start + 1e-9);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = Math.max(laneEnds[lane] ?? it.end, it.end);
    }
    lanes.push(lane);
  }
  const laneCount = laneEnds.length;
  return cluster.map((interval, i) => ({
    interval,
    lane: lanes[i] ?? 0,
    laneCount,
  }));
}

/**
 * Lay out one person's jobs for one day. Blocks never overlap; free
 * blocks sit at their true time-of-day position; conflicted clusters
 * divide their own horizontal span into equal lanes.
 */
export function layoutDay(jobs: LayoutInput[]): PositionedJob[] {
  const clamped = jobs.map(clampToDay).filter((j): j is Interval => j !== null);
  if (clamped.length === 0) return [];

  const out: PositionedJob[] = [];
  for (const cluster of clusters(clamped)) {
    const placed = assignLanes(cluster);
    const count = placed[0]?.laneCount ?? 1;
    const clusterStartH = Math.min(...cluster.map((c) => c.start));
    const clusterEndH = Math.max(...cluster.map((c) => c.end));
    const clusterLeft = (clusterStartH - DAY_START_H) / SPAN;
    const clusterSpan = (clusterEndH - clusterStartH) / SPAN;

    for (const p of placed) {
      if (count === 1) {
        // Free block: exact time position.
        out.push({
          id: p.interval.id,
          scheduled_start: p.interval.scheduled_start,
          scheduled_end: p.interval.scheduled_end,
          left: (p.interval.start - DAY_START_H) / SPAN,
          width: (p.interval.end - p.interval.start) / SPAN,
        });
      } else {
        // Conflicted cluster: equal lanes across the cluster's span.
        out.push({
          id: p.interval.id,
          scheduled_start: p.interval.scheduled_start,
          scheduled_end: p.interval.scheduled_end,
          left: clusterLeft + (p.lane * clusterSpan) / count,
          width: clusterSpan / count,
        });
      }
    }
  }
  return out;
}

/** The board's day window (hours), exported for the grid ruler. */
export const BOARD_DAY = { start: DAY_START_H, end: DAY_END_H } as const;

/** Local yyyy-mm-dd key for a timestamp. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday 00:00 local of the week containing `ref`. */
export function weekStart(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d;
}

/** Array of 7 local day keys starting at `start`. */
export function weekDayKeys(start: Date): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    keys.push(dayKey(d.toISOString()));
  }
  return keys;
}
