import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Monitor, Clock } from "lucide-react";
import { type SessionRow } from "@/lib/fpv";
import { type GearItem } from "@/components/gear-card/types";
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
      <div className="p-6 text-sm text-muted-foreground">
        No sessions yet. Log your first block.
      </div>
    );
  }

  return (
    <div className="hud-panel divide-y divide-border overflow-hidden">
      <div className="flex items-center justify-between p-4 bg-muted/40">
        <div className="flex items-center gap-2">
          {isSim ? (
            <span className="flex h-6 w-6 items-center justify-center text-sim">
              <Monitor className="h-5 w-5" aria-hidden />
            </span>
          ) : (
            <span className="flex h-6 w-6 items-center justify-center text-primary">
              <Clock className="h-5 w-5" aria-hidden />
            </span>
          )}
          <span className="label-mono font-semibold">
            {isSim ? "Simulator" : "Real world"} flight log
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-primary">
            {formatHours(total)}
          </span>
        </div>
      </div>
      {rows.map((s) => {
        return (
          <div
            key={s.id}
            className="flex items-center justify-between gap-4 p-4 hover:bg-muted/20 transition-colors duration-200"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{s.flown_on}</span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {s.duration_minutes} min
                </Badge>
                {s.drone_name && s.drone_name.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {s.drone_name}
                  </Badge>
                )}
                {s.transmitter_name && s.transmitter_name.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {s.transmitter_name}
                  </Badge>
                )}
                {s.goggles_name && s.goggles_name.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {s.goggles_name}
                  </Badge>
                )}
                {s.sim_platform && (
                  <Badge variant="outline">{s.sim_platform}</Badge>
                )}
                {s.packs_flown > 0 && (
                  <Badge variant="outline">{s.packs_flown} packs</Badge>
                )}
                {s.crashes > 0 && (
                  <Badge variant="outline">{s.crashes} crashes</Badge>
                )}
              </div>
              {s.notes && (
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {s.notes}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(s.id)}
              aria-label="Delete session"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
