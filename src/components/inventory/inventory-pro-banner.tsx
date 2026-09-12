import { Link } from "@tanstack/react-router";
import { Crown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PRO_FEATURE_BLURB, PRO_FEATURE_NAME } from "@/lib/inventory";

interface InventoryProBannerProps {
  /** Show the compact inline variant (used near gated controls). */
  compact?: boolean;
}

/**
 * Free-tier boundary shown on the inventory dashboard. Basic cataloging
 * stays available; this banner markets the Pro-only relational features
 * (bench spares, inter_drone assignment, lifespan analytics).
 */
export function InventoryProBanner({
  compact = false,
}: InventoryProBannerProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
        <Lock className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
        <span className="text-xs text-muted-foreground">
          Assignment &amp; lifespan analytics are{" "}
          <span className="text-primary font-medium">Pro</span> features.
        </span>
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-primary"
        >
          <Link to="/settings">Upgrade</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background/40 to-background/10 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/15">
          <Crown className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-foreground">
              {PRO_FEATURE_NAME}
            </h3>
            <Badge
              className="border-primary/40 bg-primary/15 text-primary"
              variant="outline"
            >
              Pro
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {PRO_FEATURE_BLURB}
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/settings">
            <Crown className="mr-1.5 h-4 w-4" aria-hidden />
            Upgrade to Pro
          </Link>
        </Button>
      </div>
    </div>
  );
}
