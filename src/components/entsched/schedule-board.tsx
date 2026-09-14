/**
 * schedule-board — the per-person week view for client jobs.
 *
 * Rows = people (roster via entsched_roster RPC), columns = days of the
 * selected week. Each job renders as a block positioned by time-of-day
 * inside its person/day cell; the geometry (no overlap, conflicts pack
 * side-by-side) lives in board-layout.ts and the rendered pieces in
 * board-pieces.tsx. Dragging a block onto any person/day cell reassigns
 * and re-dates it, preserving time-of-day and duration, via
 * useMoveClientJob.
 */
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrgRoster } from "@/hooks/entsched/use-org-roster";
import { useMoveClientJob } from "@/hooks/entsched/use-client-jobs";
import type { ClientJob } from "@/types/entsched";
import { dayKey, weekDayKeys, weekStart } from "./board-layout";
import {
  BlockFace,
  BoardEmptyRoster,
  BoardSkeleton,
  DAY_COL_PX,
  DayHeaderRow,
  JobsLoadError,
  PersonRow,
  PERSON_COL_PX,
  UNASSIGNED,
  cellKey,
  markDragEnd,
  withDayStart,
} from "./board-pieces";

export function ScheduleBoard({
  orgId,
  jobs,
  isLoading,
  error,
  onOpenJob,
}: {
  orgId: string;
  jobs: ClientJob[];
  isLoading: boolean;
  error: unknown;
  onOpenJob: (id: string) => void;
}) {
  const { data: roster } = useOrgRoster(orgId);
  const move = useMoveClientJob(orgId);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const ws = useMemo(() => weekStart(weekAnchor), [weekAnchor]);
  const days = useMemo(() => weekDayKeys(ws), [ws]);
  const [dragId, setDragId] = useState<string | null>(null);

  const people = roster ?? [];

  const byCell = useMemo(() => {
    const m = new Map<string, ClientJob[]>();
    for (const j of jobs) {
      const k = cellKey(j.assigned_to ?? UNASSIGNED, dayKey(j.scheduled_start));
      const list = m.get(k);
      if (list) list.push(j);
      else m.set(k, [j]);
    }
    return m;
  }, [jobs]);

  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setDragId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    markDragEnd();
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || overId === activeId) return;
    // Only cell drops carry a person|day id.
    const [person, day] = overId.includes("|")
      ? overId.split("|")
      : [null, null];
    const job = byId.get(activeId);
    if (!person || !day || !job) return;

    const nextAssignee = person === UNASSIGNED ? null : person;
    if (dayKey(job.scheduled_start) === day && job.assigned_to === nextAssignee)
      return; // dropped where it already lives

    const start = withDayStart(job.scheduled_start, day);
    const end = new Date(
      start.getTime() +
        (new Date(job.scheduled_end).getTime() -
          new Date(job.scheduled_start).getTime()),
    );
    move.mutate({
      jobId: job.id,
      assigned_to: nextAssignee,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
    });
  }

  if (error) {
    return <JobsLoadError error={error} />;
  }

  const shiftWeek = (delta: number) =>
    setWeekAnchor(
      new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + delta),
    );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => shiftWeek(-7)}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => shiftWeek(7)}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 font-mono text-[11px] uppercase tracking-wider text-zinc-400"
            onClick={() => setWeekAnchor(new Date())}
          >
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
            {ws.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}{" "}
            –{" "}
            {new Date(
              ws.getFullYear(),
              ws.getMonth(),
              ws.getDate() + 6,
            ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </Button>
        </div>
        <p className="hidden font-mono text-[10px] uppercase tracking-wider text-zinc-600 sm:block">
          drag jobs between people
        </p>
      </div>

      {isLoading ? (
        <BoardSkeleton />
      ) : people.length === 0 ? (
        <BoardEmptyRoster />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <div style={{ minWidth: PERSON_COL_PX + 7 * DAY_COL_PX }}>
              <DayHeaderRow days={days} />
              {people.map((p) => (
                <PersonRow
                  key={p.user_id}
                  callsign={p.callsign}
                  role={p.org_role}
                  personKey={p.user_id}
                  days={days}
                  jobsByDay={(day) => byCell.get(cellKey(p.user_id, day)) ?? []}
                  onOpenJob={onOpenJob}
                />
              ))}
              <PersonRow
                callsign="Unassigned"
                role="lane"
                personKey={UNASSIGNED}
                days={days}
                muted
                jobsByDay={(day) => byCell.get(cellKey(UNASSIGNED, day)) ?? []}
                onOpenJob={onOpenJob}
              />
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragId && byId.get(dragId) ? (
              <BlockFace job={byId.get(dragId)!} width={130} dragging />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {move.isError && (
        <p className="mt-2 text-xs text-destructive">
          Move failed: {(move.error as { message?: string }).message} — the
          board reverts on reload.
        </p>
      )}
    </div>
  );
}
