/**
 * ScheduleToolbar — view switching, date navigation, the person filter
 * ("filter by individual user"), the New-booking action, the status
 * legend, and the "active bookings" panel (next 7 days).
 */

import { useMemo } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RosterMember, ScheduleEvent } from "@/lib/scheduling/types";
import { STATUS_LABEL } from "@/lib/scheduling/types";
import type { CalendarView } from "./dispatch-calendar";
import { formatTimeRange } from "./event-card";

export function ScheduleToolbar({
  view,
  onViewChange,
  selectedDate,
  onDateShift,
  onToday,
  roster,
  personFilter,
  onPersonFilterChange,
  canManage,
  onNewBooking,
  events,
  onSelectEvent,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  selectedDate: Date;
  onDateShift: (dir: -1 | 1) => void;
  onToday: () => void;
  roster: RosterMember[];
  personFilter: string | null;
  onPersonFilterChange: (userId: string | null) => void;
  canManage: boolean;
  onNewBooking: () => void;
  /** Full org window (unfiltered) for the active-bookings panel. */
  events: ScheduleEvent[];
  onSelectEvent: (e: ScheduleEvent) => void;
}) {
  const periodLabel = useMemo(() => {
    const fmt = (d: Date) =>
      d.toLocaleDateString([], { month: "short", day: "numeric" });
    if (view === "day") {
      return selectedDate.toLocaleDateString([], {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    }
    if (view === "week") {
      const end = new Date(selectedDate);
      end.setDate(end.getDate() + 6);
      return `${fmt(selectedDate)} – ${fmt(end)}`;
    }
    return selectedDate.toLocaleDateString([], {
      month: "long",
      year: "numeric",
    });
  }, [view, selectedDate]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    const horizon = now + 7 * 86_400_000;
    return events
      .filter(
        (e) =>
          (e.status === "scheduled" || e.status === "checked_in") &&
          new Date(e.end_time).getTime() > now &&
          new Date(e.start_time).getTime() < horizon,
      )
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .slice(0, 6);
  }, [events]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-white/10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-r-none"
            onClick={() => onDateShift(-1)}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            onClick={onToday}
            className="h-8 border-x border-white/10 px-3 font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:text-foreground"
          >
            Today
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-l-none"
            onClick={() => onDateShift(1)}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <span className="font-display text-sm font-semibold text-foreground">
          {periodLabel}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-white/10 p-0.5">
            {(
              [
                ["day", "Day"],
                ["week", "Week"],
                ["month", "Month"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                className={cn(
                  "rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  view === v
                    ? "bg-primary/15 text-primary"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Select
            value={personFilter ?? ALL}
            onValueChange={(v) => onPersonFilterChange(v === ALL ? null : v)}
          >
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <Users className="mr-1.5 h-3.5 w-3.5 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" /> Everyone
                </span>
              </SelectItem>
              {roster.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.callsign}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canManage && (
            <Button size="sm" onClick={onNewBooking}>
              <CalendarRange className="mr-1.5 h-3.5 w-3.5" /> New booking
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
        {(
          [
            ["scheduled", "Scheduled"],
            ["checked_in", "Checked in"],
            ["completed", "Completed"],
            ["no_show", "No-show"],
            ["cancelled", "Cancelled"],
          ] as const
        ).map(([s, label]) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", LEGEND_DOT[s])} />
            {label}
          </span>
        ))}
      </div>

      <UpcomingPanel events={upcoming} onSelect={onSelectEvent} />
    </div>
  );
}

/** "Active bookings" — the next 7 days at a glance. */
function UpcomingPanel({
  events,
  onSelect,
}: {
  events: ScheduleEvent[];
  onSelect: (e: ScheduleEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="hud-panel px-4 py-3 text-xs text-zinc-500">
        No active bookings in the next 7 days.
      </div>
    );
  }
  return (
    <div className="hud-panel divide-y divide-white/5 overflow-hidden">
      {events.map((e) => (
        <button
          key={e.id}
          onClick={() => onSelect(e)}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
        >
          <span className="w-24 shrink-0 font-mono text-[10px] text-zinc-400">
            {new Date(e.start_time).toLocaleDateString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
          <span className="w-28 shrink-0 font-mono text-[10px] text-zinc-500">
            {formatTimeRange(e.start_time, e.end_time)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {e.event_title}
          </span>
          <span className="hidden shrink-0 items-center gap-1 text-[10px] text-zinc-400 sm:flex">
            <Users className="h-3 w-3" /> {e.assigned_callsign}
          </span>
          {e.airframe_name && (
            <span className="hidden shrink-0 font-mono text-[10px] text-zinc-500 md:block">
              {e.airframe_name}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

const ALL = "__everyone__";

const LEGEND_DOT: Record<string, string> = {
  scheduled: "bg-primary",
  checked_in: "bg-emerald-400",
  completed: "bg-zinc-500",
  cancelled: "bg-red-400/70",
  no_show: "bg-amber-400/70",
};
