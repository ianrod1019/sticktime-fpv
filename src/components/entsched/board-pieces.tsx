/**
 * board-pieces — the presentational parts of the per-person week board:
 * day headers, person rows, time-grid cells, draggable job blocks, and
 * the shared job-load error. Pure rendering + dndkit node wiring; week
 * state and move logic live in schedule-board.tsx.
 */
import { useMemo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorPanel } from "@/components/state-panels";
import { JOB_STATUS_META, type ClientJob } from "@/types/entsched";
import { BOARD_DAY, dayKey, layoutDay } from "./board-layout";

export const HOUR_PX = 40;
export const GRID_H = (BOARD_DAY.end - BOARD_DAY.start) * HOUR_PX;
export const UNASSIGNED = "unassigned";
export const PERSON_COL_PX = 150;
export const DAY_COL_PX = 148;
const BLOCK_GUTTER = 6; // px padding a block keeps inside its cell

export function cellKey(person: string, day: string) {
  return `${person}|${day}`;
}

// A click event fires right after mouseup on a dragged block; these two
// functions let JobBlock ignore the click that is really the drop.
let lastDragEndAt = 0;
export function markDragEnd() {
  lastDragEndAt = Date.now();
}
export function isJustDropped() {
  return Date.now() - lastDragEndAt < 200;
}

/** New Date at `day` (local yyyy-mm-dd) with the original clock time. */
export function withDayStart(iso: string, day: string): Date {
  const d = new Date(iso);
  const [y, m, dd] = day.split("-").map(Number);
  if (y === undefined || m === undefined || dd === undefined)
    return new Date(iso);
  return new Date(y, m - 1, dd, d.getHours(), d.getMinutes());
}

/**
 * Shared job-load error for the plane: names the un-migrated-backend
 * case explicitly (the schema simply isn't there yet) instead of a
 * bare "could not load".
 */
export function JobsLoadError({ error }: { error: unknown }) {
  // Supabase rejects are plain PostgrestError objects ({ code, message,
  // details }), not Error instances — pull the message off either shape.
  const e = error as { message?: string; code?: string } | null;
  const msg =
    (error instanceof Error ? error.message : undefined) ??
    e?.message ??
    String(error);
  const unmigrated =
    /schema|relation|does not exist/i.test(msg) ||
    /^(42P01|PGRST20[23])/.test(e?.code ?? "");
  return (
    <ErrorPanel
      message="Could not load client jobs."
      detail={
        unmigrated
          ? "The ent_scheduling schema isn't on this backend yet — run the 20260927106* migrations, then reload."
          : msg
      }
    />
  );
}

export function BoardSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  );
}

export function BoardEmptyRoster() {
  return (
    <EmptyState
      icon={CalendarDays}
      title="No one to schedule yet"
      description="The board lists your org's members. Add members to the squadron team, then drag jobs onto their week."
    />
  );
}

export function DayHeaderRow({ days }: { days: string[] }) {
  const today = dayKey(new Date().toISOString());
  return (
    <div className="flex border-b border-border/60">
      <div
        className="shrink-0 border-r border-border/60"
        style={{ width: PERSON_COL_PX }}
      />
      {days.map((d) => {
        const date = new Date(`${d}T00:00:00`);
        const isToday = d === today;
        return (
          <div
            key={d}
            className={`shrink-0 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
              isToday ? "text-primary" : "text-zinc-500"
            }`}
            style={{ width: DAY_COL_PX }}
          >
            {date.toLocaleDateString(undefined, { weekday: "short" })}{" "}
            {date.getDate()}
            {isToday && <span className="ml-1 text-primary">•</span>}
          </div>
        );
      })}
    </div>
  );
}

export function PersonRow({
  callsign,
  role,
  personKey,
  days,
  jobsByDay,
  onOpenJob,
  muted = false,
}: {
  callsign: string;
  role: string;
  personKey: string;
  days: string[];
  jobsByDay: (day: string) => ClientJob[];
  onOpenJob: (id: string) => void;
  muted?: boolean;
}) {
  return (
    <div className="flex border-b border-border/40 last:border-b-0">
      <div
        className={`shrink-0 border-r border-border/60 px-3 py-2 ${
          muted ? "opacity-60" : ""
        }`}
        style={{ width: PERSON_COL_PX }}
      >
        <p className="truncate text-xs font-medium text-zinc-200">{callsign}</p>
        <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          {role}
        </p>
      </div>
      {days.map((d) => (
        <PersonDayCell
          key={d}
          person={personKey}
          day={d}
          jobs={jobsByDay(d)}
          onOpenJob={onOpenJob}
        />
      ))}
    </div>
  );
}

function PersonDayCell({
  person,
  day,
  jobs,
  onOpenJob,
}: {
  person: string;
  day: string;
  jobs: ClientJob[];
  onOpenJob: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellKey(person, day) });
  const laidOut = useMemo(() => layoutDay(jobs), [jobs]);
  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  return (
    <div
      ref={setNodeRef}
      className={`relative shrink-0 border-r border-border/40 last:border-r-0 ${
        isOver ? "bg-primary/[0.06]" : ""
      }`}
      style={{ height: GRID_H, width: DAY_COL_PX }}
    >
      {Array.from({ length: BOARD_DAY.end - BOARD_DAY.start }).map((_, i) => (
        <div
          key={i}
          className="pointer-events-none absolute inset-x-0 border-t border-white/[0.03]"
          style={{ top: i * HOUR_PX }}
        />
      ))}
      {laidOut.map((p) => {
        const job = byId.get(p.id)!;
        // Re-derive pixel geometry from the raw times (overnight-aware),
        // clamped to the board window — same clamp layout used for
        // lanes; the pixel ruler needs it too.
        const { s: startH, e: endH } = blockHours(
          p.scheduled_start,
          p.scheduled_end,
        );
        const top = (startH - BOARD_DAY.start) * HOUR_PX;
        const height = Math.max(16, (endH - startH) * HOUR_PX);
        return (
          <JobBlock
            key={p.id}
            job={job}
            left={p.left}
            width={p.width}
            top={top}
            height={height}
            onOpen={() => onOpenJob(job.id)}
          />
        );
      })}
    </div>
  );
}

function hourOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

/** Hours-since-window-start with overnight wrap (end < start → +24h). */
function blockHours(
  startIso: string,
  endIso: string,
): { s: number; e: number } {
  const s = hourOfDay(startIso);
  let e = hourOfDay(endIso);
  if (e < s) e += 24;
  return {
    s: Math.max(s, BOARD_DAY.start),
    e: Math.min(e, BOARD_DAY.end),
  };
}

function JobBlock({
  job,
  left,
  width,
  top,
  height,
  onOpen,
}: {
  job: ClientJob;
  left: number;
  width: number;
  top: number;
  height: number;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
  });
  const span = DAY_COL_PX - BLOCK_GUTTER;
  const pxLeft = left * span;
  const pxWidth = Math.max(28, width * span - 2);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => {
        if (isJustDropped()) return; // this click is the drop
        onOpen();
      }}
      style={{ left: pxLeft + 2, width: pxWidth, top: top + 1, height }}
      className={`absolute cursor-grab touch-none rounded border-l-2 px-1 py-0.5 transition-shadow hover:z-10 hover:shadow-md active:cursor-grabbing ${blockTone(job)} ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <BlockFace job={job} width={pxWidth} />
    </div>
  );
}

/** Shared visual face for in-cell blocks and the drag overlay clone. */
export function BlockFace({
  job,
  width,
  dragging = false,
}: {
  job: ClientJob;
  width: number;
  dragging?: boolean;
}) {
  const meta = JOB_STATUS_META[job.status];
  const start = new Date(job.scheduled_start);
  const end = new Date(job.scheduled_end);
  const time = `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return (
    <div
      className={`rounded-md border bg-card/95 px-1.5 py-1 shadow-sm ${meta.className} ${
        dragging ? "shadow-lg" : ""
      }`}
      style={{ minWidth: width }}
    >
      <p className="truncate text-[11px] font-medium leading-tight text-zinc-100">
        {job.title}
      </p>
      <p className="truncate font-mono text-[9px] leading-tight text-zinc-500">
        #{job.job_number} · {time}
      </p>
    </div>
  );
}

function blockTone(job: ClientJob): string {
  switch (job.status) {
    case "confirmed":
      return "border-l-primary bg-primary/10";
    case "in_progress":
      return "border-l-sky-400 bg-sky-400/10";
    case "delivered":
      return "border-l-emerald-400 bg-emerald-400/10";
    case "pending_confirmation":
      return "border-l-amber-400 bg-amber-400/10";
    case "cancelled":
      return "border-l-destructive/70 bg-destructive/5 opacity-60";
    case "archived":
      return "border-l-zinc-600 bg-white/[0.02] opacity-50";
    default:
      return "border-l-zinc-500 bg-white/[0.04]";
  }
}
