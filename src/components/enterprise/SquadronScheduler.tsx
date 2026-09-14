import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Check, MapPin, Plus, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorPanel } from "@/components/state-panels";
import {
  useDeleteMeetup,
  useOrgMeetups,
  useRespondToMeetup,
} from "@/hooks/enterprise/use-enterprise";
import {
  canManageOrg,
  type EnterpriseRole,
  type SquadronMeetup,
} from "@/types/enterprise";
import { MeetupFormDialog } from "@/components/enterprise/meetup-form";

/**
 * SquadronScheduler — team meetup & event calendar.
 *
 * Agenda of upcoming practice sessions, race days, and build workshops.
 * Squadron/district admins schedule; members RSVP (attending/declined).
 * Every meetup deep-links the flight log flow — after the session,
 * link_meetup_session ties the logged flight back to the meetup for
 * streamlined team tracking.
 */

const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${DAY_FMT.format(start)} · ${TIME_FMT.format(start)}–${TIME_FMT.format(end)}`
    : `${DAY_FMT.format(start)} → ${DAY_FMT.format(end)} ${TIME_FMT.format(end)}`;
}

function RSVPControls({
  meetup,
  orgId,
}: {
  meetup: SquadronMeetup;
  orgId: string;
}) {
  const respond = useRespondToMeetup(orgId);
  const respondAndToast = (response: "attending" | "declined") =>
    respond.mutate(
      { meetupId: meetup.id, response },
      {
        onSuccess: () =>
          toast.success(
            response === "attending" ? "Marked attending." : "Declined.",
          ),
        onError: (err) =>
          toast.error(err.message || "Could not save your RSVP."),
      },
    );

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={respond.isPending}
        onClick={() => respondAndToast("attending")}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
          meetup.my_response === "attending"
            ? "border-primary/50 bg-primary/15 text-primary"
            : "border-white/[0.1] text-zinc-400 hover:border-primary/40 hover:text-primary"
        }`}
        aria-pressed={meetup.my_response === "attending"}
      >
        <Check className="h-3 w-3" />
        Attending
      </button>
      <button
        type="button"
        disabled={respond.isPending}
        onClick={() => respondAndToast("declined")}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
          meetup.my_response === "declined"
            ? "border-destructive/50 bg-destructive/10 text-destructive"
            : "border-white/[0.1] text-zinc-400 hover:border-destructive/40 hover:text-destructive"
        }`}
        aria-pressed={meetup.my_response === "declined"}
      >
        <X className="h-3 w-3" />
        Declined
      </button>
    </div>
  );
}

function MeetupCard({
  meetup,
  orgId,
  role,
  onDeleted,
}: {
  meetup: SquadronMeetup;
  orgId: string;
  role: EnterpriseRole;
  onDeleted: () => void;
}) {
  const canManage = canManageOrg(role);
  const upcoming = new Date(meetup.end_time).getTime() > Date.now();

  return (
    <article
      className={`rounded-xl border p-4 ${
        upcoming
          ? "border-border/60 bg-card/60"
          : "border-white/[0.05] bg-card/30 opacity-70"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatWindow(meetup.start_time, meetup.end_time)}
            {!upcoming && <span className="text-zinc-600">· past</span>}
          </div>
          <h3 className="mt-1 font-display text-sm font-semibold text-zinc-100">
            {meetup.title}
          </h3>
          {meetup.location && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
              <MapPin className="h-3 w-3" />
              {meetup.location}
            </p>
          )}
          {meetup.description && (
            <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-zinc-500">
              {meetup.description}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            <span className="text-primary">{meetup.attending_count} in</span>
            <span>{meetup.declined_count} out</span>
          </div>
          {canManage && (
            <DeleteMeetupButton
              meetupId={meetup.id}
              orgId={orgId}
              onDeleted={onDeleted}
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <RSVPControls meetup={meetup} orgId={orgId} />
        <Link
          to="/log"
          search={{ tab: "real" }}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-300 transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Timer className="h-3 w-3" />
          {meetup.session_id ? "Session logged" : "Log flight"}
        </Link>
      </div>
    </article>
  );
}

function DeleteMeetupButton({
  meetupId,
  orgId,
  onDeleted,
}: {
  meetupId: string;
  orgId: string;
  onDeleted: () => void;
}) {
  const deleteMeetup = useDeleteMeetup(orgId);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-destructive"
      disabled={deleteMeetup.isPending}
      onClick={() =>
        deleteMeetup.mutate(meetupId, {
          onSuccess: () => {
            toast.success("Meetup deleted.");
            onDeleted();
          },
          onError: (err) =>
            toast.error(err.message || "Could not delete the meetup."),
        })
      }
    >
      Delete
    </Button>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

export function SquadronScheduler({
  orgId,
  role,
}: {
  orgId: string;
  /** The caller's resolved enterprise role in this org. */
  role: EnterpriseRole;
}) {
  const { data: meetups, isLoading, error } = useOrgMeetups(orgId);
  const [showForm, setShowForm] = useState(false);
  const canManage = canManageOrg(role);

  // Upcoming first, then the most recent past events (agenda view).
  const sorted = useMemo(() => {
    const now = Date.now();
    const rows = [...(meetups ?? [])];
    rows.sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    const upcoming = rows.filter((m) => new Date(m.end_time).getTime() >= now);
    const past = rows
      .filter((m) => new Date(m.end_time).getTime() < now)
      .reverse()
      .slice(0, 10);
    return { upcoming, past };
  }, [meetups]);

  if (error) {
    return <ErrorPanel message="Could not load the schedule." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          {sorted.upcoming.length} upcoming · {sorted.past.length} recent
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Schedule meetup
          </Button>
        )}
      </div>

      {isLoading ? (
        <AgendaSkeleton />
      ) : (meetups ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No meetups scheduled"
          description="Practice sessions, race days, and build workshops land here. Members RSVP; logged flights tie back to each event."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Schedule the first meetup
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="space-y-3">
            {sorted.upcoming.map((m) => (
              <MeetupCard
                key={m.id}
                meetup={m}
                orgId={orgId}
                role={role}
                onDeleted={() => undefined}
              />
            ))}
          </div>
          {sorted.past.length > 0 && (
            <div className="space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                RECENT
              </p>
              {sorted.past.map((m) => (
                <MeetupCard
                  key={m.id}
                  meetup={m}
                  orgId={orgId}
                  role={role}
                  onDeleted={() => undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <MeetupFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        orgId={orgId}
      />
    </div>
  );
}
