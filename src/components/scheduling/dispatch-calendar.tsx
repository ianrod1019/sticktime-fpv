/**
 * DispatchCalendar — the week/day/month dispatch board.
 *
 * Week/day share one grid engine: a time gutter, a column per day,
 * absolutely positioned booking cards. Drag-to-move is dnd-kit: the
 * drop column resolves the target day, the vertical delta snaps the
 * start time to 15-minute steps — a drag re-dates AND re-times a
 * booking, Outlook style. Empty-column clicks open the create dialog
 * pre-filled with a snapped 30-minute slot. Month view is a compact
 * chip grid (click a day → day view).
 */

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { ScheduleEvent } from "@/lib/scheduling/types";
import {
  BookingCard,
  BookingCardDraggable,
  PX_PER_MINUTE,
  SNAP_MINUTES,
} from "./event-card";
import { MonthGrid } from "./month-grid";
import {
  DAY_END_HOUR,
  DAY_NAMES,
  DAY_START_HOUR,
  GRID_HEIGHT,
  HOURS,
  dateKey,
  addDays,
  sameDay,
  startOfWeek,
} from "./calendar-utils";

export type CalendarView = "week" | "day" | "month";

/** One day column: a drop target for drags + a click target for creates. */
function DayColumn({
  date,
  colIndex,
  events,
  canManage,
  onSelect,
  onCreateAt,
  onMove,
  isToday,
}: {
  date: Date;
  colIndex: number;
  events: ScheduleEvent[];
  canManage: boolean;
  onSelect: (e: ScheduleEvent) => void;
  onCreateAt: (date: Date, startMinute: number) => void;
  onMove: (id: string, startIso: string, endIso: string) => void;
  isToday: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-col-${colIndex}`,
    data: { dateISO: date.toISOString() },
  });

  const handleColumnClick = (e: React.MouseEvent) => {
    if (!canManage) return;
    // Clicks on a booking card are handled by the card itself (stopPropagation);
    // ignore any that still bubble up so a card click never opens a create dialog.
    if ((e.target as HTMLElement).closest("[data-booking-card]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetMin = (e.clientY - rect.top) / PX_PER_MINUTE;
    const snapped = Math.floor(offsetMin / 30) * 30 + DAY_START_HOUR * 60;
    onCreateAt(
      date,
      Math.min(Math.max(snapped, DAY_START_HOUR * 60), (DAY_END_HOUR - 1) * 60),
    );
  };

  return (
    <div
      ref={setNodeRef}
      onClick={handleColumnClick}
      className={cn(
        "relative min-w-0 flex-1 border-l border-white/5",
        isOver && "bg-primary/[0.04]",
      )}
      style={{ height: GRID_HEIGHT }}
    >
      {HOURS.map((h) => (
        <div
          key={h}
          className="border-b border-white/5"
          style={{ height: 60 * PX_PER_MINUTE }}
        />
      ))}

      {events.map((ev) => {
        const start = new Date(ev.start_time);
        if (!sameDay(start, date)) return null;
        const startMin = start.getHours() * 60 + start.getMinutes();
        const top = (startMin - DAY_START_HOUR * 60) * PX_PER_MINUTE;
        if (startMin < DAY_START_HOUR * 60 - 30) return null;
        return (
          <div
            key={ev.id}
            className="absolute inset-x-0.5"
            style={{ top: Math.max(top, 0) }}
          >
            <BookingCardDraggable
              event={ev}
              disabled={!canManage}
              onSelect={onSelect}
              onResize={(id, endIso) => {
                const orig = events.find((x) => x.id === id);
                if (orig) onMove(id, orig.start_time, endIso);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function DispatchCalendar({
  view,
  selectedDate,
  events,
  canManage,
  isLoading,
  onSelectEvent,
  onCreateAt,
  onMove,
  onNavigate,
}: {
  view: CalendarView;
  selectedDate: Date;
  events: ScheduleEvent[];
  canManage: boolean;
  isLoading: boolean;
  onSelectEvent: (e: ScheduleEvent) => void;
  onCreateAt: (date: Date, startMinute: number) => void;
  onMove: (id: string, startIso: string, endIso: string) => void;
  onNavigate: (next: Date) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [dragEvent, setDragEvent] = useState<ScheduleEvent | null>(null);
  // A completed drag must not cascade into the click that follows it.
  const lastDragEnd = useRef(0);
  const clicksSuppressed = () => Date.now() - lastDragEnd.current < 200;

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const today = new Date();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const ev of events) {
      const key = dateKey(new Date(ev.start_time));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [events]);

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setDragEvent(events.find((ev) => ev.id === id) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    lastDragEnd.current = Date.now();
    setDragEvent(null);

    const id = String(e.active.id);
    const ev = events.find((x) => x.id === id);
    if (!ev || !e.over) return;

    const dayMatch = String(e.over.id).match(/^day-col-(\d+)$/);
    if (!dayMatch) return;

    const targetDate =
      view === "day"
        ? selectedDate
        : (weekDays[Number(dayMatch[1])] ?? selectedDate);

    const origStart = new Date(ev.start_time);
    const durationMs = new Date(ev.end_time).getTime() - origStart.getTime();

    // Vertical delta → snapped minutes-from-midnight of the new start.
    const shifted =
      origStart.getHours() * 60 +
      origStart.getMinutes() +
      e.delta.y / PX_PER_MINUTE;
    const snapped = Math.round(shifted / SNAP_MINUTES) * SNAP_MINUTES;

    const newStart = new Date(targetDate);
    newStart.setHours(0, 0, 0, 0);
    newStart.setMinutes(
      Math.min(Math.max(snapped, DAY_START_HOUR * 60), (DAY_END_HOUR - 1) * 60),
    );
    const newEnd = new Date(newStart.getTime() + durationMs);

    if (
      sameDay(newStart, origStart) &&
      newStart.getTime() === origStart.getTime()
    ) {
      return; // dropped where it started
    }
    onMove(id, newStart.toISOString(), newEnd.toISOString());
  };

  const guardSelect = (e: ScheduleEvent) => {
    if (clicksSuppressed()) return;
    onSelectEvent(e);
  };
  const guardCreate = (d: Date, minute: number) => {
    if (clicksSuppressed()) return;
    onCreateAt(d, minute);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragEvent(null)}
    >
      {view === "week" && (
        <div className="flex">
          <div className="w-12 shrink-0 border-b border-white/5" />
          {weekDays.map((d, i) => (
            <div
              key={i}
              className={cn(
                "min-w-0 flex-1 border-b border-l border-white/5 px-2 py-1.5 text-center",
                sameDay(d, today) && "bg-primary/[0.06]",
              )}
            >
              <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                {DAY_NAMES[i]}
              </div>
              <div
                className={cn(
                  "font-display text-sm font-semibold",
                  sameDay(d, today) ? "text-primary" : "text-zinc-300",
                )}
              >
                {d.getDate()}
              </div>
            </div>
          ))}
        </div>
      )}

      {view !== "month" && (
        <div className="relative flex overflow-hidden rounded-b-lg border-x border-b border-white/5">
          <div className="w-12 shrink-0">
            {HOURS.map((h) => (
              <div
                key={h}
                className="pr-1 text-right font-mono text-[9px] text-zinc-600"
                style={{ height: 60 * PX_PER_MINUTE }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 overflow-y-auto">
            {view === "week" ? (
              weekDays.map((d, i) => (
                <DayColumn
                  key={i}
                  date={d}
                  colIndex={i}
                  events={eventsByDay.get(dateKey(d)) ?? []}
                  canManage={canManage}
                  onSelect={guardSelect}
                  onCreateAt={guardCreate}
                  onMove={onMove}
                  isToday={sameDay(d, today)}
                />
              ))
            ) : (
              <DayColumn
                date={selectedDate}
                colIndex={0}
                events={eventsByDay.get(dateKey(selectedDate)) ?? []}
                canManage={canManage}
                onSelect={guardSelect}
                onCreateAt={guardCreate}
                onMove={onMove}
                isToday={sameDay(selectedDate, today)}
              />
            )}
          </div>
        </div>
      )}

      {view === "month" && (
        <MonthGrid
          selectedDate={selectedDate}
          events={events}
          onPickDay={(d) => onNavigate(d)}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {dragEvent ? (
          <div
            className="w-44 opacity-90"
            style={{
              height:
                ((new Date(dragEvent.end_time).getTime() -
                  new Date(dragEvent.start_time).getTime()) /
                  60_000) *
                PX_PER_MINUTE,
            }}
          >
            <BookingCard event={dragEvent} isOverlay className="h-full" />
          </div>
        ) : null}
      </DragOverlay>

      {isLoading && (
        <div className="absolute inset-0 grid place-items-center bg-background/40 backdrop-blur-[1px]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </DndContext>
  );
}
