/**
 * MonthGrid — compact month chip view. Click a day to jump into the
 * day view of the dispatch board.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ScheduleEvent } from "@/lib/scheduling/types";
import {
  DAY_NAMES,
  addDays,
  dateKey,
  sameDay,
  startOfWeek,
} from "./calendar-utils";

export function MonthGrid({
  selectedDate,
  events,
  onPickDay,
}: {
  selectedDate: Date;
  events: ScheduleEvent[];
  onPickDay: (d: Date) => void;
}) {
  const monthCells = useMemo(() => {
    const first = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      1,
    );
    return Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(first), i));
  }, [selectedDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const ev of events) {
      const key = dateKey(new Date(ev.start_time));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const today = new Date();

  return (
    <div className="rounded-b-lg border border-white/5">
      <div className="grid grid-cols-7 border-b border-white/5">
        {DAY_NAMES.map((n) => (
          <div
            key={n}
            className="px-1 py-1 text-center font-mono text-[9px] uppercase tracking-wider text-zinc-500"
          >
            {n}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {monthCells.map((d) => {
          const inMonth = d.getMonth() === selectedDate.getMonth();
          const dayEvents = eventsByDay.get(dateKey(d)) ?? [];
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPickDay(d)}
              className={cn(
                "min-h-[72px] border-b border-r border-white/5 p-1 text-left transition-colors hover:bg-white/[0.03]",
                !inMonth && "opacity-40",
                sameDay(d, today) && "bg-primary/[0.05]",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[10px]",
                  sameDay(d, today) ? "text-primary" : "text-zinc-500",
                )}
              >
                {d.getDate()}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, 2).map((ev) => (
                  <div
                    key={ev.id}
                    className="truncate rounded-sm border border-primary/25 bg-primary/10 px-1 py-0.5 text-[9px] text-zinc-200"
                  >
                    {ev.event_title}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[9px] text-zinc-500">
                    +{dayEvents.length - 2} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
