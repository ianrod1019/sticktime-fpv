import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Download,
  Package,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  confirmClientJob,
  fetchClientJobView,
} from "@/hooks/entsched/use-client-jobs";
import {
  JOB_STATUS_META,
  formatBytes,
  type ClientConfirmResult,
  type ClientJobView,
} from "@/types/entsched";

/**
 * ClientJobPortal — what the client sees at /client/$token.
 *
 * Public surface, no auth: job summary, a Confirm button while the job
 * awaits confirmation, and per-file / archive downloads served by the
 * client-job-download edge function (token-validated, delivered files
 * only). Renders an ownership-proof flow: wrong or revoked token shows
 * a neutral "link not valid" card, never an error dump.
 */
export function ClientJobPortal({ token }: { token: string }) {
  const [view, setView] = useState<ClientJobView | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchClientJobView(token)
      .then((v) => {
        if (alive) setView(v);
      })
      .catch(() => {
        if (alive) setView(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res: ClientConfirmResult = await confirmClientJob(token);
      if ("ok" in res && res.ok) {
        toast.success("Booking confirmed — see you on site.");
        setView((v) =>
          v
            ? {
                ...v,
                status: "confirmed",
                confirmed_at: new Date().toISOString(),
              }
            : v,
        );
      } else if ("error" in res && res.error === "invalid_state") {
        toast.error(
          `This job is already ${JOB_STATUS_META[res.status]?.label ?? res.status}.`,
        );
        setView((v) => (v ? { ...v, status: res.status } : v));
      } else {
        setView(null); // not_found — token died; re-render the neutral card
      }
    } catch {
      toast.error("Could not confirm right now — try again in a moment.");
    } finally {
      setConfirming(false);
    }
  };

  const downloadUrl = (fileId?: string) =>
    `/functions/v1/client-job-download?token=${encodeURIComponent(token)}${fileId ? `&file=${fileId}` : ""}`;

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!view || view.error === "not_found") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-white/10 bg-card/60 p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-zinc-600" />
          <h1 className="mt-3 font-display text-lg font-semibold text-zinc-200">
            This link isn't valid
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
            The job link may have been replaced or typed incorrectly. Ask your
            pilot for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  const meta = JOB_STATUS_META[view.status];
  const isDelivered = view.status === "delivered";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
          <Building2 className="h-3.5 w-3.5" />
          {view.org_name ?? "StickTime"}
        </div>
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${meta.className}`}
        >
          {meta.label}
        </span>
      </header>

      <section className="rounded-xl border border-white/10 bg-card/60 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
          JOB #{view.job_number}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em] text-zinc-100">
          {view.title}
        </h1>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
              Scheduled
            </dt>
            <dd className="text-zinc-300">
              {new Date(view.scheduled_start).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {" – "}
              {new Date(view.scheduled_end).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </dd>
          </div>
          {view.location && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                <MapPin className="h-3 w-3" /> Where
              </dt>
              <dd className="text-zinc-300">{view.location}</dd>
            </div>
          )}
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
              Booked for
            </dt>
            <dd className="text-zinc-300">{view.client_name}</dd>
          </div>
          {view.description && (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                Scope
              </dt>
              <dd className="mt-1 text-zinc-400">{view.description}</dd>
            </div>
          )}
        </dl>

        {view.status === "pending_confirmation" && (
          <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
            <p className="text-sm text-amber-200">
              Please confirm this booking so your pilot can lock the slot in.
            </p>
            <Button
              className="mt-3"
              onClick={() => void handleConfirm()}
              disabled={confirming}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {confirming ? "Confirming…" : "Confirm booking"}
            </Button>
          </div>
        )}

        {view.status === "confirmed" && view.confirmed_at && (
          <p className="mt-5 flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Confirmed {new Date(view.confirmed_at).toLocaleDateString()}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-card/60 p-6">
        <h2 className="font-display text-sm font-semibold text-zinc-100">
          Deliverables
        </h2>
        {isDelivered ? (
          (view.deliverables ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              No files were attached to this delivery.
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {(view.deliverables ?? []).map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs text-zinc-200">
                        {f.file_name}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-600">
                        {formatBytes(f.size_bytes)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <a href={downloadUrl()} className="gap-1.5">
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
              <Button className="mt-4 w-full" asChild>
                <a href={downloadUrl()}>
                  <Package className="mr-1.5 h-4 w-4" />
                  Download everything (.zip)
                </a>
              </Button>
            </>
          )
        ) : (
          <p className="mt-2 text-sm text-zinc-500">
            Files appear here the moment your job is marked delivered.
          </p>
        )}
      </section>

      <footer className="pb-8 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
        Powered by StickTime FPV
      </footer>
    </div>
  );
}
