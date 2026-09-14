import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatHours, toDateKey, type SessionRow } from "@/lib/fpv";

const LEVEL_STYLE = [
  "bg-white/[0.035] border border-white/[0.08]",
  "bg-primary/15 border border-primary/20",
  "bg-primary/30 border border-primary/35",
  "bg-primary/55 border border-primary/60 shadow-[0_0_8px_-2px_var(--color-primary)]",
  "bg-primary border border-primary/80 shadow-[0_0_14px_-3px_var(--color-primary)]",
];

type Day = { date: string; minutes: number; sessions: SessionRow[] };
type Month = { key: string; label: string; days: Day[]; total: number };

function buildMonths(sessions: SessionRow[], count = 12): Month[] {
  const byDate = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const list = byDate.get(session.flown_on) ?? [];
    list.push(session);
    byDate.set(session.flown_on, list);
  }
  const now = new Date();
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth() - (count - 1 - offset),
      1,
    );
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: last }, (_, index) => {
      const current = new Date(date.getFullYear(), date.getMonth(), index + 1);
      const dateKey = toDateKey(current);
      const daySessions = byDate.get(dateKey) ?? [];
      return {
        date: dateKey,
        minutes: daySessions.reduce(
          (sum, item) => sum + item.duration_minutes,
          0,
        ),
        sessions: daySessions,
      };
    });
    return {
      key,
      label: date.toLocaleString("en-US", { month: "short", year: "numeric" }),
      days,
      total: days.reduce((sum, day) => sum + day.minutes, 0),
    };
  });
}

function levelFor(minutes: number, max: number) {
  if (minutes <= 0 || max <= 0) return 0;
  return Math.min(4, Math.ceil((minutes / max) * 4));
}

export function Heatmap({ sessions }: { sessions: SessionRow[] }) {
  const months = useMemo(() => buildMonths(sessions), [sessions]);
  const [activeMonth, setActiveMonth] = useState(
    months[months.length - 1]?.key ?? "",
  );
  const [hoveredDay, setHoveredDay] = useState<Day | null>(null);
  const maxMinutes = Math.max(
    0,
    ...months.flatMap((month) => month.days.map((day) => day.minutes)),
  );
  const selected =
    months.find((month) => month.key === activeMonth) ??
    months[months.length - 1];
  return (
    <div className="space-y-4">
      <div className="min-w-0 overflow-x-auto pb-1">
        <div className="flex min-w-[700px] items-stretch gap-1.5">
          {months.map((month) => {
            const isActive = month.key === activeMonth;
            return (
              <motion.button
                key={month.key}
                type="button"
                onMouseEnter={() => setActiveMonth(month.key)}
                onFocus={() => setActiveMonth(month.key)}
                onClick={() => setActiveMonth(month.key)}
                animate={{
                  flexGrow: isActive ? 5 : 1,
                  flexBasis: isActive ? "150px" : "50px",
                }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className={`group relative min-w-[50px] overflow-hidden rounded-lg border p-2 text-left ${isActive ? "z-10 -translate-y-1 border-primary/45 bg-primary/[0.08] shadow-[0_16px_28px_-18px_var(--primary)]" : "border-white/[0.07] bg-white/[0.015] hover:-translate-y-0.5 hover:border-primary/25"}`}
                aria-label={`Inspect ${month.label}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`block truncate font-mono text-[9px] tracking-[0.08em] ${isActive ? "text-primary" : "text-zinc-600"}`}
                  >
                    {month.label.split(" ")[0]}
                  </span>
                  <span className="shrink-0 font-mono text-[8px] text-zinc-700">
                    {Math.round(month.total / 60)}h
                  </span>
                </div>
                <div
                  className={`mt-2 grid gap-0.5 ${isActive ? "grid-cols-7" : "grid-cols-2"}`}
                >
                  {month.days.map((day) => (
                    <span
                      key={day.date}
                      onMouseEnter={() => isActive && setHoveredDay(day)}
                      className={`relative flex rounded-[1px] ${isActive ? "h-7 cursor-help items-center justify-center text-[8px]" : "h-1.5"} ${LEVEL_STYLE[levelFor(day.minutes, maxMinutes)]}`}
                      title={
                        isActive
                          ? `${day.date}: ${formatHours(day.minutes)}`
                          : undefined
                      }
                    >
                      {isActive && (
                        <span className="font-mono text-zinc-400">
                          {Number(day.date.slice(-2))}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="mt-2 flex items-center justify-between border-t border-primary/15 pt-2 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-500"
                    >
                      <span>
                        {month.days.filter((day) => day.minutes > 0).length}{" "}
                        active days
                      </span>
                      <span className="text-primary">
                        {formatHours(month.total)}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="label-mono">less</span>
          {LEVEL_STYLE.map((style, index) => (
            <span
              key={index}
              className={`h-2.5 w-2.5 rounded-[2px] ${style}`}
            />
          ))}
          <span className="label-mono">more</span>
          <span className="ml-auto font-mono text-[9px] text-zinc-600">
            Hover a month to expand it; move across to compare
          </span>
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {selected && (
          <motion.div
            key={selected.key}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-xl border border-white/[0.09] bg-[#0f0f12] p-4 shadow-[0_18px_42px_-30px_rgba(249,115,22,0.8)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="label-mono text-primary">
                  {selected.label} // HOVERED DAY DETAIL
                </div>
                <div className="mt-1 font-display text-xl font-semibold tracking-[-0.03em] text-zinc-100">
                  {formatHours(selected.total)}
                </div>
              </div>
              <div className="font-mono text-[9px] text-zinc-600">
                {selected.days.filter((day) => day.minutes > 0).length} ACTIVE
                DAYS
              </div>
            </div>
            <div className="mt-4 min-h-16 border-t border-white/[0.08] pt-3">
              {hoveredDay ? (
                <div>
                  <div className="flex justify-between font-mono text-[9px] tracking-[0.12em] text-zinc-500">
                    <span>{hoveredDay.date}</span>
                    <span className="text-primary">
                      {formatHours(hoveredDay.minutes)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {hoveredDay.sessions.length === 0 ? (
                      <span className="font-mono text-[9px] text-zinc-700">
                        NO FLIGHT LOGGED
                      </span>
                    ) : (
                      hoveredDay.sessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex justify-between font-mono text-[9px] text-zinc-400"
                        >
                          <span>
                            {session.session_type.toUpperCase()} //{" "}
                            {session.packs_flown || 0} PACKS
                          </span>
                          <span>{formatHours(session.duration_minutes)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <span className="font-mono text-[9px] tracking-[0.1em] text-zinc-700">
                  HOVER A DAY FOR SESSION DETAIL
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
