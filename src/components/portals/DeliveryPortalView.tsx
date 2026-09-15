import { useEffect, useState } from "react";
import { Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDeliveryView } from "@/hooks/portals/use-deliveries";
import { formatBytes, type DeliveryViewResult } from "@/types/portals";

/**
 * DeliveryPortalView — what the client sees at /portal/$token.
 *
 * Public surface, no auth: branded header (logo/color/agency from
 * branding_config), the file list, and per-file downloads served by
 * the portal-download edge function (token + expiry validated there
 * too — this page's own expiry check is a courtesy, not the gate).
 * An unknown or expired token renders the same neutral "link not
 * valid" card; the two are distinguished only by copy, never by
 * leaking which case it was.
 */
export function DeliveryPortalView({ token }: { token: string }) {
  const [result, setResult] = useState<DeliveryViewResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDeliveryView(token)
      .then((r) => {
        if (alive) setResult(r);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const downloadUrl = (fileId: string) =>
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-download?token=${encodeURIComponent(token)}&file=${encodeURIComponent(fileId)}`;

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!result || result.status !== "ok") {
    const expired = result?.status === "expired";
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-white/10 bg-card/60 p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-zinc-600" />
          <h1 className="mt-3 font-display text-lg font-semibold text-zinc-200">
            {expired ? "This link has expired" : "This link isn't valid"}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
            {expired
              ? "Delivery links expire for security. Ask your pilot for a fresh link."
              : "The delivery link may have been replaced or typed incorrectly. Ask your pilot for a fresh link."}
          </p>
        </div>
      </div>
    );
  }

  const { view } = result;
  const brand = view.branding_config;
  const accent = brand.brand_color || "#6366f1";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="flex items-center gap-3">
        {brand.logo_url ? (
          <img
            src={brand.logo_url}
            alt=""
            className="h-8 w-8 rounded object-contain"
          />
        ) : null}
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: accent }}
        >
          {brand.agency_name ?? "Delivery Portal"}
        </span>
      </header>

      <section
        className="rounded-xl border border-white/10 bg-card/60 p-6"
        style={{ borderTopColor: accent, borderTopWidth: 3 }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
          Delivered to {view.client_name}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em] text-zinc-100">
          {view.project_title}
        </h1>
        <p className="mt-2 text-xs text-zinc-500">
          Link expires {new Date(view.expires_at).toLocaleDateString()}
        </p>
      </section>

      <section className="rounded-xl border border-white/10 bg-card/60 p-6">
        <h2 className="font-display text-sm font-semibold text-zinc-100">
          Files
        </h2>
        {view.files.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No files were attached to this delivery.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {view.files.map((f) => (
              <li
                key={f.file_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-zinc-200">
                    {f.file_name}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-600">
                    {formatBytes(f.file_size)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  style={{ borderColor: accent }}
                >
                  <a href={downloadUrl(f.file_id)} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="pb-8 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700">
        Powered by StickTime FPV
      </footer>
    </div>
  );
}
