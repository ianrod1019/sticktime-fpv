/**
 * Schedule events data layer: the calendar window query plus the four
 * mutations the grid needs (create, move/resize, status, delete). All
 * mutations are optimistic with rollback — a drag that the server
 * rejects (gear double-book 23P01) snaps the card back to where it was
 * and toasts why.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  classifySchedulingError,
  deleteBooking,
  getScheduleEvents,
  insertBooking,
  updateBooking,
} from "@/lib/scheduling/api";
import type {
  BookingPayload,
  ScheduleEvent,
  ScheduleStatus,
} from "@/lib/scheduling/types";

export function useScheduleEvents(params: {
  teamId: string | null;
  from: string;
  to: string;
  assignedUserFilter?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      "schedule-events",
      params.teamId,
      params.from,
      params.to,
      params.assignedUserFilter ?? null,
    ],
    queryFn: () =>
      getScheduleEvents({
        teamId: params.teamId as string,
        from: params.from,
        to: params.to,
        assignedUserFilter: params.assignedUserFilter ?? null,
      }),
    enabled: !!params.teamId && (params.enabled ?? true),
    staleTime: 30_000,
  });
}

/* -------------------------------------------------------------------------
 * Shared optimistic plumbing: snapshot → apply → rollback on error.
 * ---------------------------------------------------------------------- */

type RollbackCtx = { previous: ScheduleEvent[] };

function useRollbackableEvents(teamId: string | null) {
  const qc = useQueryClient();
  const queryKey = ["schedule-events", teamId] as const;

  const onMutate = async (
    apply: (list: ScheduleEvent[]) => ScheduleEvent[],
  ): Promise<RollbackCtx> => {
    await qc.cancelQueries({ queryKey });
    const previous = qc.getQueryData<ScheduleEvent[]>(queryKey) ?? [];
    qc.setQueryData<ScheduleEvent[]>(queryKey, apply(previous));
    return { previous };
  };

  const rollback = (ctx: RollbackCtx | undefined) => {
    if (ctx) qc.setQueryData<ScheduleEvent[]>(queryKey, ctx.previous);
  };

  const onError = (error: unknown) => {
    toast.error(classifySchedulingError(error).message);
  };

  const onSettled = () => {
    void qc.invalidateQueries({ queryKey });
  };

  return { qc, queryKey, onMutate, rollback, onError, onSettled };
}

/* -------------------------------------------------------------------------
 * Create (dialog save) — not optimistic; the dialog owns its submit UX.
 * ---------------------------------------------------------------------- */

export function useInsertBooking(teamId: string | null) {
  const { qc, onError, onSettled } = useRollbackableEvents(teamId);
  return useMutation({
    mutationFn: (payload: BookingPayload) =>
      // The INSERT policy gates on organization_id; never persist a row
      // without it (an empty id would be rejected server-side anyway).
      insertBooking({ ...payload, organization_id: teamId as string }),
    onError,
    onSettled,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["schedule-events", teamId] });
    },
  });
}

/* -------------------------------------------------------------------------
 * Move / resize (drag & drop + edge handles)
 * ---------------------------------------------------------------------- */

export function useMoveBooking(teamId: string | null) {
  const { onMutate, rollback, onError, onSettled } =
    useRollbackableEvents(teamId);
  return useMutation({
    mutationFn: ({
      id,
      start_time,
      end_time,
    }: {
      id: string;
      start_time: string;
      end_time: string;
    }) => updateBooking(id, { start_time, end_time }),
    onMutate: ({ id, start_time, end_time }) =>
      onMutate((list) =>
        list.map((e) => (e.id === id ? { ...e, start_time, end_time } : e)),
      ),
    onError: (error, _vars, ctx) => {
      rollback(ctx);
      onError(error);
    },
    onSettled,
  });
}

/* -------------------------------------------------------------------------
 * Status flips (toolbar quick-actions + assignee duty roster)
 * ---------------------------------------------------------------------- */

export function useSetBookingStatus(teamId: string | null) {
  const { onMutate, rollback, onError, onSettled } =
    useRollbackableEvents(teamId);
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ScheduleStatus }) =>
      updateBooking(id, { status }),
    onMutate: ({ id, status }) =>
      onMutate((list) => list.map((e) => (e.id === id ? { ...e, status } : e))),
    onError: (error, _vars, ctx) => {
      rollback(ctx);
      onError(error);
    },
    onSettled,
  });
}

/* -------------------------------------------------------------------------
 * Delete
 * ---------------------------------------------------------------------- */

export function useDeleteBooking(teamId: string | null) {
  const { onMutate, rollback, onError, onSettled } =
    useRollbackableEvents(teamId);
  return useMutation({
    mutationFn: (id: string) => deleteBooking(id),
    onMutate: (id) => onMutate((list) => list.filter((e) => e.id !== id)),
    onError: (error, _id, ctx) => {
      rollback(ctx);
      onError(error);
    },
    onSettled,
  });
}
