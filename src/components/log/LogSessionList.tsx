import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { type SessionRow } from "@/lib/fpv";
import { type GearItem } from "@/components/gear-card/types";
import { formatHours } from "@/lib/fpv";

interface LogSessionListProps {
  sessions: SessionRow[];
  gear: GearItem[];
  kind: "sim" | "real";
  onRemove: (id: string) => void;
}

export function LogSessionList({
  sessions,
  gear,
  kind,
  onRemove
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
            <span className="h-4 w-4 text-sim">
              {/* Monitor icon from lucide-react */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </span>
          ) : (
            <span className="h-4 w-4 text-primary">
              {/* Timer icon from lucide-react */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
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
        const associatedDrone = gear.find((g) => g.id === s.gear_id);
        const associatedController = gear.find(
          (g) => g.id === s.controller_id,
        );
        const associatedGoggles = gear.find((g) => g.id === s.goggles_id);

        // Build combined badge text
        const badgeParts: string[] = [];
        if (associatedDrone) badgeParts.push(`Drone: ${associatedDrone.name}`);
        if (associatedController) badgeParts.push(`Radio: ${associatedController.name}`);
        if (associatedGoggles) badgeParts.push(`Goggles: ${associatedGoggles.name}`);
        const badgeText = badgeParts.join(", ");

        return (
          <div
            key={s.id}
            className="flex items-center justify-between gap-4 p-4 hover:bg-muted/20 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{s.flown_on}</span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {s.duration_minutes} min
                </Badge>
                {s.sim_platform && (
                  <Badge variant="outline">{s.sim_platform}</Badge>
                )}
                {badgeText && (
                  <Badge
                    variant="outline"
                    className="border-primary/30 text-primary"
                  >
                    {badgeText}
                  </Badge>
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