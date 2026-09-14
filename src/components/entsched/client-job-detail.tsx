import { useState } from "react";
import { Check, Copy, Link2, RefreshCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel } from "@/components/state-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  clientLinkFor,
  useDeleteClientJob,
  useDeleteDeliverable,
  useJobDeliverables,
  useRotateClientToken,
  useUpdateJobStatus,
  useUploadDeliverable,
} from "@/hooks/entsched/use-client-jobs";
import {
  JOB_STATUS_META,
  canUploadDeliverables,
  formatBytes,
  nextStatuses,
  type ClientJob,
} from "@/types/entsched";

/**
 * JobDetail — the expanded card under a selected board row: overview +
 * status controls, the client-link manager, and the deliverables bay.
 * Split out of ClientJobsPage to keep each file focused (and ≤350).
 */
export function JobDetail({
  job,
  onClose,
}: {
  job: ClientJob;
  onClose: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-primary/25 bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            JOB #{job.job_number} · {JOB_STATUS_META[job.status].label}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-zinc-100">
            {job.title}
          </h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <Tabs defaultValue="overview" className="mt-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="link">Client link</TabsTrigger>
          <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <JobOverviewTab job={job} onClose={onClose} />
        </TabsContent>
        <TabsContent value="link" className="mt-4">
          <JobLinkTab job={job} />
        </TabsContent>
        <TabsContent value="deliverables" className="mt-4">
          <JobDeliverablesTab job={job} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JobOverviewTab({
  job,
  onClose,
}: {
  job: ClientJob;
  onClose: () => void;
}) {
  const update = useUpdateJobStatus(job.organization_id);
  const remove = useDeleteClientJob(job.organization_id);
  const moves = nextStatuses(job.status);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            Client
          </dt>
          <dd className="text-zinc-200">
            {job.client_name}
            {job.client_email ? ` · ${job.client_email}` : ""}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            Window
          </dt>
          <dd className="text-zinc-200">
            {new Date(job.scheduled_start).toLocaleString()} →{" "}
            {new Date(job.scheduled_end).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </dd>
        </div>
        {job.location && (
          <div className="col-span-2">
            <dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              Location
            </dt>
            <dd className="text-zinc-200">{job.location}</dd>
          </div>
        )}
        {job.description && (
          <div className="col-span-2">
            <dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              Scope
            </dt>
            <dd className="text-zinc-300">{job.description}</dd>
          </div>
        )}
      </dl>

      {moves.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {moves.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "cancelled" ? "outline" : "default"}
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { jobId: job.id, status: s },
                  {
                    onSuccess: () =>
                      toast.success(
                        `Job marked ${JOB_STATUS_META[s].label.toLowerCase()}.`,
                      ),
                    onError: (err) =>
                      toast.error(err.message || "Could not update the job."),
                  },
                )
              }
            >
              Mark {JOB_STATUS_META[s].label.toLowerCase()}
            </Button>
          ))}
          {job.status === "draft" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-zinc-500 hover:text-destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(job.id, {
                  onSuccess: () => {
                    toast.success("Draft deleted.");
                    onClose();
                  },
                  onError: (err) =>
                    toast.error(err.message || "Could not delete."),
                })
              }
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete draft
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function JobLinkTab({ job }: { job: ClientJob }) {
  const rotate = useRotateClientToken(job.organization_id);
  const [copied, setCopied] = useState(false);
  const link = clientLinkFor(job.client_token);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        The client opens this link to view the job, confirm it, and download
        deliverables once the job is delivered. No account needed.
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2">
        <Link2 className="h-4 w-4 shrink-0 text-primary" />
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-300">
          {link}
        </code>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => {
            void navigator.clipboard.writeText(link);
            setCopied(true);
            toast.success("Client link copied.");
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={rotate.isPending}
        onClick={() =>
          rotate.mutate(job.id, {
            onSuccess: (t) => {
              void navigator.clipboard.writeText(clientLinkFor(t));
              toast.success(
                "Link rotated — new link copied. The old link is dead.",
              );
            },
            onError: (err) =>
              toast.error(err.message || "Could not rotate the link."),
          })
        }
      >
        <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
        Rotate link (revoke old)
      </Button>
      {job.client_email && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          Confirmation + delivery emails queue in the outbox for{" "}
          {job.client_email} — send the link manually until the mail provider is
          plugged in.
        </p>
      )}
    </div>
  );
}

function JobDeliverablesTab({ job }: { job: ClientJob }) {
  const { data: files, isLoading, error } = useJobDeliverables(job.id);
  const upload = useUploadDeliverable(job);
  const remove = useDeleteDeliverable(job);
  const uploadsAllowed = canUploadDeliverables(job.status);

  return (
    <div className="space-y-3">
      {uploadsAllowed ? (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary transition-colors hover:bg-primary/15">
          <Upload className="h-3.5 w-3.5" />
          {upload.isPending ? "Uploading…" : "Upload deliverable"}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={upload.isPending}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              list
                .reduce(
                  (p, f) =>
                    p.then(
                      () =>
                        new Promise<void>((res) =>
                          upload.mutate(f, { onSettled: () => res() }),
                        ),
                    ),
                  Promise.resolve(),
                )
                .catch(() => toast.error("One or more uploads failed."));
            }}
          />
        </label>
      ) : (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          Deliverables unlock once the job is confirmed.
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : error ? (
        <ErrorPanel message="Could not load deliverables." />
      ) : (files ?? []).length === 0 ? (
        <p className="text-xs text-zinc-600">No files uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {(files ?? []).map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs text-zinc-200">{f.file_name}</p>
                <p className="font-mono text-[10px] text-zinc-600">
                  {formatBytes(f.size_bytes)} ·{" "}
                  {new Date(f.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-zinc-500 hover:text-destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(f, {
                    onError: (err) =>
                      toast.error(err.message || "Could not delete the file."),
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
