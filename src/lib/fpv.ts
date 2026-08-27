export type SessionRow = {
  id: string;
  session_type: "sim" | "real";
  flown_on: string;
  duration_minutes: number;
  gear_id: string | null;
  location_id: string | null;
  track_id: string | null;
  sim_platform: string | null;
  packs_flown: number;
  battery_notes: string | null;
  weather: unknown;
  rating: number | null;
  crashes: number;
  notes: string | null;
};

export const ACCENTS = ["ember", "lime", "cyan", "magenta", "amber"] as const;
export type Accent = (typeof ACCENTS)[number];

export const SIM_PLATFORMS = [
  "VelociDrone",
  "Liftoff",
  "Uncrashed",
  "DRL Simulator",
  "TRYP FPV",
  "FPV SkyDive",
];

export const DURATION_BLOCKS = Array.from({ length: 48 }, (_, i) => (i + 1) * 5);

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Consecutive days (ending today or yesterday) with at least one logged session. */
export function computeStreak(sessions: Pick<SessionRow, "flown_on">[]): number {
  const days = new Set(sessions.map((s) => s.flown_on));
  if (days.size === 0) return 0;
  const cursor = new Date();
  if (!days.has(toDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function heatmapDays(sessions: SessionRow[], weeks = 53) {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    totals.set(s.flown_on, (totals.get(s.flown_on) ?? 0) + s.duration_minutes);
  }
  const end = new Date();
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));

  const cells: { date: string; minutes: number }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = toDateKey(d);
    cells.push({ date: key, minutes: totals.get(key) ?? 0 });
  }
  return cells;
}

export function monthlyVolume(sessions: SessionRow[], months = 12) {
  const buckets: { month: string; sim: number; real: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      month: d.toLocaleString("en-US", { month: "short" }),
      sim: 0,
      real: 0,
    });
  }
  const firstKey = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  for (const s of sessions) {
    const d = new Date(`${s.flown_on}T00:00:00`);
    if (d < firstKey) continue;
    const idx = (d.getFullYear() - firstKey.getFullYear()) * 12 + (d.getMonth() - firstKey.getMonth());
    const bucket = buckets[idx];
    if (!bucket) continue;
    bucket[s.session_type] += Math.round((s.duration_minutes / 60) * 100) / 100;
  }
  return buckets;
}

export function partHealth(minutesUsed: number, lifespan: number) {
  const pct = lifespan > 0 ? Math.min(100, Math.round((minutesUsed / lifespan) * 100)) : 0;
  const status = pct >= 100 ? "replace" : pct >= 80 ? "worn" : "healthy";
  return { pct, status } as const;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export function toSqlInserts(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `-- no rows in ${table}\n`;
  const headers = Object.keys(rows[0]!);
  const lit = (v: unknown) => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `'${s.replace(/'/g, "''")}'`;
  };
  return rows
    .map(
      (r) =>
        `INSERT INTO ${table} (${headers.join(", ")}) VALUES (${headers.map((h) => lit(r[h])).join(", ")});`,
    )
    .join("\n");
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchWeather(lat: number, lon: number) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,weather_code`,
  );
  if (!res.ok) throw new Error("Weather lookup failed");
  const json = (await res.json()) as {
    current?: {
      temperature_2m: number;
      wind_speed_10m: number;
      wind_gusts_10m: number;
      weather_code: number;
    };
  };
  return json.current ?? null;
}
