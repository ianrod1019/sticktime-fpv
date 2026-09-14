/**
 * BookingCard — one scheduled block on the dispatch grid.
 *
 * Rendered inside a Draggable wrapper by the calendar; owns the
 * bottom-edge resize handle (pointer-captured, 15-minute snap) and the
 * status color language of the board. Non-active bookings (completed,
 * cancelled, no-show) are history: not draggable, visually muted.
 */

import { useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { BatteryCharging, Cpu, GripHorizontal, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleEvent } from "@/lib/scheduling/types";
import { isActiveStatus } from "@/lib/scheduling/types";

/** Grid metrics shared with the calendar (exported single source). */
export const PX_PER_MINUTE = 0.9; // 54 px per hour
export const SNAP_MINUTES = 15;

export const STATUS_STYLE: Record<
  ScheduleEvent["status"],
  { card: string; dot: string; label: string }
> = {
  scheduled: {
    card: "border-primary/40 bg-primary/[0.13] hover:bg-primary/[0.18]",
    dot: "bg-primary",
    label: "text-foreground",
  },
  checked_in: {
    card: "border-emerald-400/40 bg-emerald-500/[0.14] hover:bg-emerald-500/[0.2]",
    dot: "bg-emerald-400",
    label: "text-emerald-100",
  },
  completed: {
    card: "border-white/10 bg-white/[0.05]",
    dot: "bg-zinc-500",
    label: "text-zinc-400",
  },
  cancelled: {
    card: "border-red-400/25 bg-red-500/[0.08]",
    dot: "bg-red-400/70",
    label: "text-red-200/60",
  },
  no_show: {
    card: "border-amber-400/25 bg-amber-500/[0.08]",
    dot: "bg-amber-400/70",
    label: "text-amber-200/70",
  },
};

function minutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

/** Visual card (shared by the grid, overlays and dialogs). */
export function BookingCard({
  event,
  className,
  onPointerDown,
  isOverlay,
  children,
}: {
  event: ScheduleEvent;
  className?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  isOverlay?: boolean;
  children?: React.ReactNode;
}) {
  const style = STATUS_STYLE[event.status];
  const active = isActiveStatus(event.status);
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      className={cn(
        "group/card flex h-full flex-col overflow-hidden rounded-md border px-2 py-1.5 text-left shadow-sm transition-colors",
        style.card,
        isOverlay && "rotate-1 shadow-lg ring-1 ring-primary/40",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
        <span
          className={cn(
            "truncate font-mono text-[9px] uppercase tracking-wider",
            style.label,
          )}
        >
          {formatTimeRange(event.start_time, event.end_time)}
        </span>
        {active && (
          <GripHorizontal className="ml-auto h-3 w-3 shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover/card:opacity-100" />
        )}
      </div>
      <span className="truncate text-xs font-semibold leading-tight text-foreground">
        {event.event_title}
      </span>
      <div className="mt-auto flex items-center gap-2 pt-1 text-[10px] text-zinc-400">
        <span className="flex min-w-0 items-center gap-1">
          <User className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{event.assigned_callsign}</span>
        </span>
        {event.airframe_name && (
          <span className="flex min-w-0 items-center gap-1">
            <Cpu className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{event.airframe_name}</span>
          </span>
        )}
        {event.battery_name && (
          <BatteryCharging className="h-3 w-3 shrink-0" aria-hidden />
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Draggable wrapper + resize handle. The calendar renders
 * `<BookingCardDraggable event={e} … />` inside the absolutely-positioned
 * slot so the drag transform and resize handle stay self-contained.
 */
export function BookingCardDraggable({
  event,
  onSelect,
  onResize,
  disabled,
}: {
  event: ScheduleEvent;
  onSelect: (e: ScheduleEvent) => void;
  /** Called with the snapped new end time (ISO) after a resize gesture. */
  onResize?: (id: string, endIso: string) => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
    data: { eventId: event.id, dayIndex: new Date(event.start_time).getDay() },
    disabled: disabled || !isActiveStatus(event.status),
  });

  const resizeState = useRef<{
    startY: number;
    origEndMs: number;
  } | null>(null);
  const [previewMinutes, setPreviewMinutes] = useState<number | null>(null);

  const durationMin =
    (new Date(event.end_time).getTime() -
      new Date(event.start_time).getTime()) /
    60_000;

  const handleResizePointerDown = (e: React.PointerEvent) => {
    if (disabled || !isActiveStatus(event.status)) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeState.current = {
      startY: e.clientY,
      origEndMs: new Date(event.end_time).getTime(),
    };
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!resizeState.current) return;
    const dy = e.clientY - resizeState.current.startY;
    const raw = durationMin + dy / PX_PER_MINUTE;
    const snapped = Math.max(
      SNAP_MINUTES,
      Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES,
    );
    setPreviewMinutes(snapped);
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (!resizeState.current) return;
    const { startY, origEndMs } = resizeState.current;
    resizeState.current = null;
    const snapped = previewMinutes;
    setPreviewMinutes(null);
    if (snapped == null) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) < 4) return; // a tap, not a resize
    const newEnd = new Date(origEndMs + (snapped - durationMin) * 60_000);
    onResize?.(event.id, newEnd.toISOString());
  };

  // Height: real duration, or the resize preview while dragging the edge.
  const heightMin = previewMinutes ?? durationMin;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-booking-card={event.id}
      onClick={(e) => {
        // A booking click must never also register as an empty-column
        // click: the DayColumn create handler would overwrite the edit
        // draft with a fresh create draft.
        e.stopPropagation();
        onSelect(event);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(event);
      }}
      className={cn(
        "absolute inset-x-0.5 cursor-grab touch-none select-none active:cursor-grabbing",
        isDragging && "z-30 opacity-40",
      )}
      style={{ height: heightMin * PX_PER_MINUTE }}
    >
      <BookingCard event={event} className="h-full">
        {!disabled && isActiveStatus(event.status) && (
          <div
            role="presentation"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize rounded-b-md bg-transparent transition-colors hover:bg-primary/30"
            title="Drag to change duration"
          />
        )}
      </BookingCard>
    </div>
  );
}
