import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useLogData } from "./log-hooks.ts";
import { PageHeader } from "@/components/app-shell";
import { LogSessionList } from "@/components/log/LogSessionList";
import { LogSessionDialog } from "@/components/log/LogSessionDialog";
import { Timer, Monitor } from "lucide-react";
import { DURATION_BLOCKS, SIM_PLATFORMS, formatHours, toDateKey } from "@/lib/fpv";

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
  component: LogPage,
});

function LogPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const { sessions, isLoading, isError, removeSession } = useLogData();

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
    return <div className="p-6">Loading...</div>;
  }

  if (isError) {
    return <div className="p-6 text-destructive">Error loading data</div>;
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
        <div className="hud-panel p-1.5 flex max-w-sm relative">
          <div
            className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-primary/20 border border-primary/40 rounded-md transition-transform duration-300 ease-out ${
              activeTab === "sim"
                ? "translate-x-[calc(100%+6px)]"
                : "translate-x-0"
            }`}
          />
          <button
            type="button"
            onClick={() => handleTabChange("real")}
            className={`flex-1 relative z-10 py-2.5 px-4 text-xs font-mono font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2 ${
              activeTab === "real"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Timer className="h-4 w-4" /> Real World
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("sim")}
            className={`flex-1 relative z-10 py-2.5 px-4 text-xs font-mono font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2 ${
              activeTab === "sim"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Monitor className="h-4 w-4" /> Simulator
          </button>
        </div>

        <div className="overflow-hidden relative w-full">
          <div
            key={activeTab}
            className={`w-full ${
              activeTab === "sim" ? "animate-pure-slide-right" : "animate-pure-slide-left"
            }`}
          >
            <LogSessionList
              sessions={sessions}
              kind={activeTab}
              onRemove={(id) => removeSession.mutate(id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}