import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogData } from "./log-hooks.ts";
import { usePilot } from "@/hooks/use-pilot";
import { PageHeader } from "@/components/app-shell";
import { LogSessionList } from "@/components/log/LogSessionList";
import { Button } from "@/components/ui/button";
import { LogSessionDialog } from "@/components/log/LogSessionDialog";
import { LoadingPanel, ErrorPanel } from "@/components/state-panels";
import { Timer, Monitor } from "lucide-react";
import {
  DURATION_BLOCKS,
  SIM_PLATFORMS,
  formatHours,
  toDateKey,
} from "@/lib/fpv";

export const Route = createFileRoute("/_authenticated/log")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "real" | "sim" } => {
    return {
      ...(search["tab"] === "sim" || search["tab"] === "real"
        ? { tab: search["tab"] }
        : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Flight Logs — StickTime FPV" },
      {
        name: "description",
        content:
          "Log simulator and real-world FPV sessions in 5-minute blocks.",
      },
      { property: "og:title", content: "Flight Logs — StickTime FPV" },
      {
        property: "og:description",
        content:
          "Log simulator and real-world FPV sessions in 5-minute blocks.",
      },
    ],
  }),
  loader: async ({ context }) => {
    // Cache-first: first page of sessions is pre-fetched so the list paints
    // immediately on navigation (and instantly from cache on reload).
    const { queryClient } = context;
    const session = await queryClient.fetchQuery({
      queryKey: ["auth-session"],
      queryFn: async () => {
        const { data } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
        return data.session;
      },
      staleTime: 60_000,
    });
    const userId = session?.user?.id;
    if (!userId) return;
    await queryClient.ensureQueryData({
      queryKey: ["log-data", userId],
      queryFn: async () => {
        const { db_request } = await import("@/lib/db_request");
        const { data, error } = await db_request({
          mode: "rpc",
          rpcFunction: "get_user_sessions_with_gear",
          rpcParams: { p_user_id: userId, p_limit: 51, p_offset: 0 },
        });
        if (error) throw error;
        const rows = (data ?? []) as import("@/lib/fpv").SessionRow[];
        const hasMore = rows.length > 50;
        return {
          sessions: hasMore ? rows.slice(0, 50) : rows,
          hasMore,
          nextOffset: hasMore ? 50 : null,
        };
      },
      staleTime: 30_000,
    });
  },
  component: LogPage,
});

function LogPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { userId } = usePilot();

  const {
    sessions,
    hasMore,
    isLoading,
    isError,
    isFetchingMore,
    loadMore,
    removeSession,
  } = useLogData(userId);

  const [open, setOpen] = useState(false);
  const initialTab = search.tab === "sim" ? "sim" : "real";
  const [activeTab, setActiveTab] = useState<"real" | "sim">(initialTab);
  const prevTabRef = useRef<"real" | "sim">(initialTab);

  const handleTabChange = (newTab: "real" | "sim") => {
    if (newTab === activeTab) return;
    prevTabRef.current = activeTab;
    setActiveTab(newTab);
    navigate({
      to: "/log",
      search: { tab: newTab },
      replace: true,
    }).catch(() => {});
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Flight Logs"
          subtitle="Manual entry in 5-minute blocks — sim and real world tracked separately."
        />
        <LoadingPanel label="Loading flight logs..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHeader
          title="Flight Logs"
          subtitle="Manual entry in 5-minute blocks — sim and real world tracked separately."
        />
        <ErrorPanel
          message="We couldn't load your flight logs. Check your connection and try again."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Flight Logs"
        subtitle="Manual entry in 5-minute blocks — sim and real world tracked separately."
        action={
          <LogSessionDialog
            open={open}
            onOpenChange={setOpen}
            initialTab={activeTab}
          />
        }
      />

      <div className="mt-6 flex flex-col gap-4">
        <div
          className="hud-panel p-1.5 flex max-w-sm relative"
          role="tablist"
          aria-label="Session type"
        >
          <div
            className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-primary/15 border border-primary/35 rounded-md shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_0_10px_-4px_var(--primary)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              activeTab === "sim"
                ? "translate-x-[calc(100%+6px)]"
                : "translate-x-0"
            }`}
          />
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "real"}
            onClick={() => handleTabChange("real")}
            className={`flex-1 relative z-10 py-2.5 px-4 text-xs font-mono font-bold uppercase tracking-wider rounded transition-colors duration-200 active:scale-[0.98] flex items-center justify-center gap-2 ${
              activeTab === "real"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Timer className="h-4 w-4" aria-hidden /> Real World
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "sim"}
            onClick={() => handleTabChange("sim")}
            className={`flex-1 relative z-10 py-2.5 px-4 text-xs font-mono font-bold uppercase tracking-wider rounded transition-colors duration-200 active:scale-[0.98] flex items-center justify-center gap-2 ${
              activeTab === "sim"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Monitor className="h-4 w-4" aria-hidden /> Simulator
          </button>
        </div>

        <div className="overflow-hidden relative w-full">
          <div
            key={activeTab}
            className={`w-full ${
              activeTab === "sim"
                ? "animate-pure-slide-right"
                : "animate-pure-slide-left"
            }`}
          >
            <LogSessionList
              sessions={sessions}
              kind={activeTab}
              onRemove={(id) => removeSession.mutate(id)}
            />
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={isFetchingMore}
                >
                  {isFetchingMore ? "Loading…" : "Load older sessions"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
