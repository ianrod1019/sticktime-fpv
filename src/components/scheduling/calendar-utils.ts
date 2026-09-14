/**
 * Shared calendar metrics + date helpers for the dispatch views.
 */

export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 22;
export const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, i) => DAY_START_HOUR + i,
);
export const GRID_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * 60 * 0.9;

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7)); // Monday-first
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
