import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  CATEGORY_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  normalizeSpecs,
  specLabel,
  type DronePart,
  type PartStatus,
} from "@/lib/inventory";

interface PartCardProps {
  part: DronePart;
  onClick: (part: DronePart) => void;
}

function statusOf(part: DronePart): PartStatus {
  return (part.status ?? "shelf") as PartStatus;
}

function specSummary(part: DronePart): string {
  const specs = normalizeSpecs(part.specs);
  // "quantity" is shown by the dedicated badge below, not as a spec.
  const entries = Object.entries(specs)
    .filter(([key]) => key !== "quantity")
    .slice(0, 3);
  if (entries.length === 0) return CATEGORY_LABELS.other ?? "Component";
  return entries
    .map(([key, value]) => `${specLabel(key)}: ${value}`)
    .join(" · ");
}

/** One tile in the master inventory grid. Click opens the detail modal. */
export function PartCard({ part, onClick }: PartCardProps) {
  const status = statusOf(part);

  return (
    <button
      type="button"
      onClick={() => onClick(part)}
      className={cn(
        "group flex h-full w-full flex-col gap-3 rounded-xl border p-4 text-left",
        "border-primary/15 bg-card/50 transition-all duration-200",
        "hover:border-primary/40 hover:bg-primary/5 hover:shadow-[0_8px_24px_-12px_var(--primary)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
      )}
      aria-label={`View details for ${part.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <Wrench className="h-4 w-4" aria-hidden />
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase tracking-wide",
            STATUS_BADGE_CLASSES[status],
          )}
        >
          {STATUS_LABELS[status]}
        </Badge>
      </div>

      <div className="min-w-0">
        <div className="truncate font-display text-sm font-semibold text-foreground">
          {part.brand ? `${part.brand} ` : ""}
          {part.name}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {CATEGORY_LABELS[part.category as keyof typeof CATEGORY_LABELS] ??
            part.category}
        </div>
      </div>

      <p className="mt-auto line-clamp-2 text-[11px] font-mono text-muted-foreground/80">
        {specSummary(part)}
      </p>
    </button>
  );
}
