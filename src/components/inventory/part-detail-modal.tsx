import { Calendar, Hash, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  normalizeSpecs,
  specLabel,
  type DronePart,
  type PartStatus,
} from "@/lib/inventory";
import { usePartInstalls } from "@/hooks/inventory";
import { PartInstallPanel } from "./part-install-panel";

interface PartDetailModalProps {
  part: DronePart | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (part: DronePart) => void;
  onDelete: (part: DronePart) => Promise<void> | void;
}

function SpecList({ part }: { part: DronePart }) {
  const specs = normalizeSpecs(part.specs);
  // "quantity" is surfaced as the dedicated Quantity-owned field, not a spec.
  const entries = Object.entries(specs).filter(([key]) => key !== "quantity");
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No specifications recorded.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-baseline justify-between gap-2 border-b border-primary/10 pb-1"
        >
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {specLabel(key)}
          </dt>
          <dd className="font-mono text-sm text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Detail view for a single master-inventory part: full specs, purchase info,
 * metadata and the Pro-gated install / lifespan block.
 */
export function PartDetailModal({
  part,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: PartDetailModalProps) {
  // Hook must run unconditionally; the hook no-ops with an empty partId.
  const installs = usePartInstalls(part?.id ?? "");

  if (!part) return null;
  const status = (part.status ?? "shelf") as PartStatus;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/30 bg-background/95 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 font-display text-foreground">
            <Wrench className="h-4 w-4 text-primary" aria-hidden />
            {part.brand ? `${part.brand} ` : ""}
            {part.name}
            <Badge
              variant="outline"
              className={cn("text-[10px]", STATUS_BADGE_CLASSES[status])}
            >
              {STATUS_LABELS[status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="secondary">
              {CATEGORY_LABELS[part.category as keyof typeof CATEGORY_LABELS] ??
                part.category}
            </Badge>
            {Number(normalizeSpecs(part.specs)["quantity"] ?? 1) > 1 && (
              <Badge
                variant="outline"
                className="border-primary/30 text-primary font-mono"
              >
                ×{normalizeSpecs(part.specs)["quantity"]}
              </Badge>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden />
              Added {new Date(part.created_at).toLocaleDateString()}
            </span>
            <span className="inline-flex items-center gap-1 font-mono">
              <Hash className="h-3 w-3" aria-hidden />
              {part.id.slice(0, 8)}
            </span>
          </div>

          {(part.purchase_cost != null || part.vendor || part.purchase_date) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {part.purchase_cost != null && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 font-mono"
                >
                  ${Number(part.purchase_cost).toFixed(2)}
                </Badge>
              )}
              {part.vendor && <span>from {part.vendor}</span>}
              {part.purchase_date && (
                <span>
                  bought {new Date(part.purchase_date).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          <section aria-label="Specifications">
            <SpecList part={part} />
          </section>

          <Separator className="bg-primary/10" />

          <PartInstallPanel part={part} installs={installs} />

          <Separator className="bg-primary/10" />

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(part)}
              className="border-primary/40 text-primary"
            >
              Edit part
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void onDelete(part);
                onOpenChange(false);
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Remove from inventory
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
