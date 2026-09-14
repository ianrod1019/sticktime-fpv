import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Monitor, Clock, Radio, ArrowUpRight } from "lucide-react";
import { type SessionRow } from "@/lib/fpv";
import { formatHours } from "@/lib/fpv";

interface LogSessionListProps {
  sessions: SessionRow[];
  kind: "sim" | "real";
  onRemove: (id: string) => void;
}

export function LogSessionList({
  sessions,
  kind,
  onRemove,
}: LogSessionListProps) {
  const rows = sessions.filter((s) => s.session_type === kind);
  const total = rows.reduce((a, s) => a + s.duration_minutes, 0);
  const isSim = kind === "sim";

  if (rows.length === 0) {
    return (
      <div className="hud-panel grid min-h-48 place-items-center p-8 text-center">
        <div>
          <Radio className="mx-auto h-5 w-5 text-zinc-700" />
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            No {isSim ? "simulator" : "real-world"} sessions yet
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            Log your first block to start the timeline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#101013] shadow-[0_18px_50px_-38px_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.025] px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`grid h-8 w-8 place-items-center rounded-md border ${isSim ? "border-sky-400/20 bg-sky-400/10 text-sky-300" : "border-primary/20 bg-primary/10 text-primary"}`}
          >
            {isSim ? (
              <Monitor className="h-4 w-4" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-300">
              {isSim ? "Simulator" : "Real world"} flight log
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {rows.length} sessions · latest first
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg tabular-nums text-primary">
            {formatHours(total)}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
            total airtime
          </p>
        </div>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {rows.map((s) => (
          <div
            key={s.id}
            className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.035]"
          >
            <div className="hidden h-9 w-1 rounded-full bg-primary/60 sm:block" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-zinc-300">
                  {s.flown_on}
                </span>
                <Badge
                  variant="outline"
                  className="border-white/10 font-mono text-[10px] text-zinc-500"
                >
                  {s.duration_minutes} min
                </Badge>
                {s.sim_platform && (
                  <Badge
                    variant="outline"
                    className="border-sky-400/15 text-sky-300/80"
                  >
                    {s.sim_platform}
                  </Badge>
                )}
                {s.packs_flown > 0 && (
                  <Badge
                    variant="outline"
                    className="border-primary/15 text-primary/80"
                  >
                    {s.packs_flown} packs
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-600">
                {s.drone_name && <span>Airframe · {s.drone_name}</span>}
                {s.notes && <span className="truncate">{s.notes}</span>}
                {s.crashes > 0 && (
                  <span className="text-red-300/75">{s.crashes} crashes</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Open session"
              >
                <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(s.id)}
                aria-label="Delete session"
              >
                <Trash2 className="h-4 w-4 text-zinc-600 hover:text-red-300" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
