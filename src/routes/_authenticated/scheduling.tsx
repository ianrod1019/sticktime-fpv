/**
 * /scheduling — the dispatch board route.
 *
 * Server truth for the gate lives in edu.get_scheduling_access (RLS +
 * triggers enforce it regardless of what this UI renders). The page
 * composes: org switcher → gate → toolbar → calendar → booking dialog,
 * with realtime invalidation for multi-manager calendars.
 */

import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import { EmptyState, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchedulingAccess } from "@/hooks/scheduling/use-scheduling-access";
import {
  useDeleteBooking,
  useInsertBooking,
  useMoveBooking,
  useScheduleEvents,
} from "@/hooks/scheduling/use-schedule-events";
import {
  useOrgAirframeOptions,
  useOrgBatteryOptions,
  useOrgRoster,
  useScheduleRealtime,
} from "@/hooks/scheduling/use-schedule-queries";
import { SchedulingGate } from "@/components/scheduling/scheduling-gate";
import {
  DispatchCalendar,
  type CalendarView,
} from "@/components/scheduling/dispatch-calendar";
import {
  BookingDialog,
  draftFromEvent,
  draftFromSlot,
  type BookingDraft,
} from "@/components/scheduling/booking-dialog";
import { ScheduleToolbar } from "@/components/scheduling/schedule-toolbar";
import { getPersonConflicts, updateBooking } from "@/lib/scheduling/api";
import type { BookingPayload } from "@/lib/scheduling/types";
import { addDays, startOfWeek } from "@/components/scheduling/calendar-utils";

export const Route = createFileRoute("/_authenticated/scheduling")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Scheduling & Dispatch — StickTime FPV" },
      {
        name: "description",
        content:
          "Assign pilots, students and staff to airframes, batteries and time slots — with hardware double-booking hard-blocked.",
      },
    ],
  }),
  component: SchedulingPage,
});

interface MembershipRow {
  team_id: string;
  team_name: string;
  team_role: string;
}

/** Week/day navigate by days; month view by calendar months. */
function shiftDate(d: Date, dir: -1 | 1, view: CalendarView): Date {
  if (view === "day") return addDays(d, dir);
  if (view === "week") return addDays(d, dir * 7);
  const out = new Date(d);
  out.setMonth(out.getMonth() + dir);
  return out;
}

function SchedulingPage() {
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
    staleTime: 60_000,
  });

  // Orgs the caller belongs to (same source the ledger hub uses).
  const { data: orgs, isLoading: orgsLoading } = useQuery({
    queryKey: ["scheduling-orgs", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<MembershipRow[]> => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_my_org_memberships",
        rpcParams: {},
      });
      if (error) throw error;
      return (data ?? []) as MembershipRow[];
    },
  });

  const [teamId, setTeamId] = useState<string | null>(null);
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<BookingDraft | null>(null);

  const activeTeamId = teamId ?? orgs?.[0]?.team_id ?? null;

  const {
    access,
    isLoading: accessLoading,
    isError: accessError,
    refetch,
  } = useSchedulingAccess(activeTeamId);
  const canManage = access.can_manage;

  // Fetch window: the visible week for week/day views, the whole month
  // grid (6 weeks) for month view. The toolbar's active-bookings panel
  // filters the next 7 days from the same payload.
  const windowStart = useMemo(() => {
    if (view === "month") {
      const first = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        1,
      );
      return startOfWeek(first).toISOString();
    }
    return startOfWeek(selectedDate).toISOString();
  }, [view, selectedDate]);
  const windowEnd = useMemo(() => {
    if (view === "month") {
      const first = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        1,
      );
      return addDays(startOfWeek(first), 42).toISOString();
    }
    return addDays(startOfWeek(selectedDate), 7).toISOString();
  }, [view, selectedDate]);
  const eventsQuery = useScheduleEvents({
    teamId: activeTeamId,
    from: windowStart,
    to: windowEnd,
    assignedUserFilter: personFilter,
    enabled: access.enabled,
  });

  const rosterQuery = useOrgRoster(activeTeamId, access.enabled);
  const airframesQuery = useOrgAirframeOptions(activeTeamId, access.enabled);
  const batteriesQuery = useOrgBatteryOptions(activeTeamId, access.enabled);

  useScheduleRealtime(activeTeamId);

  const insertMutation = useInsertBooking(activeTeamId);
  const moveMutation = useMoveBooking(activeTeamId);
  const deleteMutation = useDeleteBooking(activeTeamId);

  const openCreate = (date: Date, startMinute: number) => {
    if (!rosterQuery.data?.length) {
      toast.error("No roster members found for this organization yet.");
      return;
    }
    setDraft(draftFromSlot(date, startMinute, rosterQuery.data));
    setDialogOpen(true);
  };

  const openEdit = (e: Parameters<typeof draftFromEvent>[0]) => {
    setDraft(draftFromEvent(e));
    setDialogOpen(true);
  };

  const handleSave = async (
    payload: BookingPayload,
    id: string | null,
  ): Promise<void> => {
    if (id) {
      await updateBooking(id, payload);
    } else {
      await insertMutation.mutateAsync(payload);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync(id);
  };

  if (orgsLoading) return <LoadingPanel label="Loading scheduling…" />;

  if (!orgs || orgs.length === 0) {
    return (
      <>
        <PageHeader
          title="Scheduling & Dispatch"
          subtitle="Assign people to airframes, batteries and time slots."
        />
        <EmptyState
          icon={CalendarClock}
          title="No organization membership"
          description="Scheduling works inside an org — join or create a squadron first."
          action={
            <Button onClick={() => navigate({ to: "/teams" })}>
              Browse squadrons
            </Button>
          }
        />
      </>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="Scheduling & Dispatch"
        subtitle="Assign people to airframes, batteries and time slots — hardware double-booking is hard-blocked."
        action={
          orgs.length > 1 ? (
            <Select
              {...(activeTeamId ? { value: activeTeamId } : {})}
              onValueChange={(v) => {
                setTeamId(v);
                setPersonFilter(null);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Organization" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.team_id} value={o.team_id}>
                    {o.team_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {orgs[0]?.team_name}
              {access.addon_purchased ? " · add-on active" : ""}
            </span>
          )
        }
      />

      <SchedulingGate
        access={access}
        isLoading={accessLoading}
        isError={accessError}
        refetch={() => void refetch()}
      >
        <ScheduleToolbar
          view={view}
          onViewChange={setView}
          selectedDate={selectedDate}
          onDateShift={(dir) => setSelectedDate((d) => shiftDate(d, dir, view))}
          onToday={() => setSelectedDate(new Date())}
          roster={rosterQuery.data ?? []}
          personFilter={personFilter}
          onPersonFilterChange={setPersonFilter}
          canManage={canManage}
          onNewBooking={() => openCreate(selectedDate, 9 * 60)}
          events={eventsQuery.data ?? []}
          onSelectEvent={openEdit}
        />

        <DispatchCalendar
          view={view}
          selectedDate={selectedDate}
          events={eventsQuery.data ?? []}
          canManage={canManage}
          isLoading={eventsQuery.isFetching}
          onSelectEvent={openEdit}
          onCreateAt={openCreate}
          onMove={(id, startIso, endIso) =>
            moveMutation.mutate({
              id,
              start_time: startIso,
              end_time: endIso,
            })
          }
          onNavigate={(d) => {
            setSelectedDate(d);
            setView("day");
          }}
        />
      </SchedulingGate>

      <BookingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        setDraft={setDraft}
        roster={rosterQuery.data ?? []}
        airframes={airframesQuery.data ?? []}
        batteries={batteriesQuery.data ?? []}
        canManage={canManage}
        onSave={handleSave}
        onDelete={handleDelete}
        onCheckConflicts={(p) =>
          getPersonConflicts({
            userId: p.userId,
            start: p.start,
            end: p.end,
            excludeId: p.excludeId ?? null,
          })
        }
      />
    </div>
  );
}
