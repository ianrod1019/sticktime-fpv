import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeBenchStats,
  PART_STATUSES,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  type DronePart,
  type PartStatus,
} from "@/lib/inventory";

interface InventoryStatsBarProps {
  parts: DronePart[];
}

/**
 * Free summary strip — raw counts only. Deep per-part analytics (lifespan,
 * airframes used) remain behind the Pro wall in the detail modal.
 */
export function InventoryStatsBar({ parts }: InventoryStatsBarProps) {
  const stats = computeBenchStats(parts);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <Boxes className="h-3.5 w-3.5" aria-hidden />
        {stats.total} component{stats.total === 1 ? "" : "s"} owned
      </span>

      {PART_STATUSES.map((status: PartStatus) => {
        const count = stats.byStatus[status] ?? 0;
        if (count === 0) return null;
        return (
          <span
            key={status}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              STATUS_BADGE_CLASSES[status],
            )}
          >
            {STATUS_LABELS[status]}: {count}
          </span>
        );
      })}

      {stats.sparesAvailable > 0 && (
        <span className="ml-auto text-xs text-muted-foreground">
          {stats.sparesAvailable} spare{stats.sparesAvailable === 1 ? "" : "s"}{" "}
          on the bench
        </span>
      )}
    </div>
  );
}
