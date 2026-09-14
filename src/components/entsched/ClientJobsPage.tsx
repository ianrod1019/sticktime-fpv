import { useMemo, useState } from "react";
import { Briefcase, CalendarDays, List, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorPanel } from "@/components/state-panels";
import { useMyEnterprises } from "@/hooks/enterprise/use-enterprise";
import { useOrgClientJobs } from "@/hooks/entsched/use-client-jobs";
import { JOB_STATUS_META, type ClientJob } from "@/types/entsched";
import { ClientJobFormDialog } from "@/components/entsched/client-job-form";
import { JobDetail } from "@/components/entsched/client-job-detail";
import { ScheduleBoard } from "@/components/entsched/schedule-board";
import { JobsLoadError } from "@/components/entsched/board-pieces";

/**
 * ClientJobsPage — the internal client-job board (/clients).
 * Org switcher for multi-org admins, status-badged job rows, expanding
 * into the detail card (client-job-detail.tsx) for the selected job.
 */
export function ClientJobsPage() {
  const { data: memberships, isLoading, error } = useMyEnterprises();
  const managed = useMemo(
    () =>
      (memberships ?? []).filter(
        (m) => m.my_role === "district_admin" || m.my_role === "squadron_admin",
      ),
    [memberships],
  );
  const [orgId, setOrgId] = useState<string | null>(null);
  const activeOrg =
    managed.find((o) => o.organization_id === orgId) ?? managed[0];
  const [creating, setCreating] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Client jobs" subtitle="Loading…" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader
          title="Client jobs"
          subtitle="Client work, scheduled and delivered."
        />
        <ErrorPanel
          message="Could not resolve your organizations."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }
  if (managed.length === 0) {
    return (
      <div>
        <PageHeader
          title="Client jobs"
          subtitle="Client work, scheduled and delivered."
        />
        <EmptyState
          icon={Briefcase}
          title="Admin access required"
          description="Client jobs are managed by squadron and district admins. Ask your admin to add you."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Client jobs"
        subtitle="Professional client work: schedule, confirm via secure link, deliver."
        action={
          activeOrg && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New client job
            </Button>
          )
        }
      />

      {managed.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {managed.map((o) => (
            <button
              key={o.organization_id}
              type="button"
              onClick={() => {
                setOrgId(o.organization_id);
                setSelectedJobId(null);
              }}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                o.organization_id === activeOrg!.organization_id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-white/[0.08] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {o.organization_name}
            </button>
          ))}
        </div>
      )}

      {activeOrg && (
        <>
          <div className="mb-3 flex items-center gap-1.5">
            <ViewToggle view={view} onChange={setView} />
          </div>
          <JobsView
            orgId={activeOrg.organization_id}
            view={view}
            selectedJobId={selectedJobId}
            onSelect={setSelectedJobId}
          />
          <ClientJobFormDialog
            open={creating}
            onOpenChange={setCreating}
            orgId={activeOrg.organization_id}
          />
        </>
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "board" | "list";
  onChange: (v: "board" | "list") => void;
}) {
  const cls = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
      active
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-white/[0.08] text-zinc-500 hover:text-zinc-300"
    }`;
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        className={cls(view === "board")}
        onClick={() => onChange("board")}
      >
        <CalendarDays className="h-3 w-3" /> Board
      </button>
      <button
        type="button"
        className={cls(view === "list")}
        onClick={() => onChange("list")}
      >
        <List className="h-3 w-3" /> List
      </button>
    </div>
  );
}

function JobsView({
  orgId,
  view,
  selectedJobId,
  onSelect,
}: {
  orgId: string;
  view: "board" | "list";
  selectedJobId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data: jobs, isLoading, error } = useOrgClientJobs(orgId);

  if (view === "board") {
    return (
      <ScheduleBoard
        orgId={orgId}
        jobs={jobs ?? []}
        isLoading={isLoading}
        error={error}
        onOpenJob={onSelect}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }
  if (error) {
    return <JobsLoadError error={error} />;
  }
  if ((jobs ?? []).length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No client jobs yet"
        description="Create a job, send the client their secure link, upload deliverables after the flight."
      />
    );
  }

  const selected = (jobs ?? []).find((j) => j.id === selectedJobId) ?? null;

  return (
    <div className="space-y-3">
      {(jobs ?? []).map((job) => (
        <JobRow key={job.id} job={job} onOpen={() => onSelect(job.id)} />
      ))}
      {selected && <JobDetail job={selected} onClose={() => onSelect(null)} />}
    </div>
  );
}

function JobRow({ job, onOpen }: { job: ClientJob; onOpen: () => void }) {
  const meta = JOB_STATUS_META[job.status];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-xl border border-border/60 bg-card/60 p-4 text-left transition-all hover:border-primary/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            JOB #{job.job_number}
            <span className={`rounded border px-1.5 py-0.5 ${meta.className}`}>
              {meta.label}
            </span>
          </div>
          <h3 className="mt-1 font-display text-sm font-semibold text-zinc-100">
            {job.title}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {job.client_name}
            {job.scheduled_start &&
              ` · ${new Date(job.scheduled_start).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
          </p>
        </div>
        {job.status === "pending_confirmation" && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400">
            Awaiting client →
          </span>
        )}
      </div>
    </button>
  );
}
