import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatMinutes } from "./gear-detail-header";

export function ServiceProgress({
  sinceService,
  interval,
}: {
  sinceService: number;
  interval: number;
}) {
  const isAsNeeded = interval <= 0;
  const pct = isAsNeeded
    ? 0
    : interval > 0
      ? Math.min(100, Math.round((sinceService / interval) * 100))
      : 0;
  const isOverdue = !isAsNeeded && sinceService >= interval;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
          Service wear
        </span>
        {isAsNeeded ? (
          <Badge
            variant="outline"
            className="text-[10px] border-primary/30 text-primary"
          >
            Service as needed
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className={`text-[10px] ${
              isOverdue
                ? "border-destructive/40 text-destructive"
                : "border-primary/30 text-primary"
            }`}
          >
            {isOverdue ? "Overdue" : `${pct}% of interval`}
          </Badge>
        )}
      </div>
      <Progress
        value={pct}
        className="h-2"
        aria-label={`Service wear ${pct}%`}
      />
      <p className="text-xs text-muted-foreground">
        {isAsNeeded
          ? "No fixed interval — service as needed"
          : `${formatMinutes(sinceService)} of ${formatMinutes(interval)} since last service`}
      </p>
    </div>
  );
}
