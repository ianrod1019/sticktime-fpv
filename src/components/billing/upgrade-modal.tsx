/**
 * Shared upgrade modal for every Pro/Enterprise-gated surface.
 *
 * Any code — inline lock cards, banners, even non-component hooks — can pop
 * the same modal via `openUpgradeModal({ tier, featureName, ... })`; the
 * single `<UpgradeModalHost />` mounted in the root route renders it.
 * Enforcement stays where it is today (server RPCs + the existing gates);
 * this only unifies the upgrade UX.
 */
import { useEffect, useState } from "react";
import { Building2, Check, Crown, Sparkles } from "lucide-react";
import {
  BILLING_COMING_SOON_TEXT,
  BILLING_LIVE,
  upgradeCtaLabel,
} from "@/lib/billing-status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type UpgradeTier = "pro" | "enterprise";

export interface UpgradeIntent {
  tier: UpgradeTier;
  /** Name of the locked feature, shown as the modal title context. */
  featureName: string;
  /** One-sentence explanation of what stays locked. */
  description?: string;
  /** Short perk bullets surfaced inside the modal. */
  perks?: string[];
}

// Module-level single-slot bus: the host registers itself on mount.
let openListener: ((intent: UpgradeIntent) => void) | null = null;

export function openUpgradeModal(intent: UpgradeIntent): void {
  if (openListener) openListener(intent);
}

export function UpgradeModalHost() {
  const [intent, setIntent] = useState<UpgradeIntent | null>(null);

  useEffect(() => {
    openListener = setIntent;
    return () => {
      openListener = null;
    };
  }, []);

  if (!intent) return null;

  const isEnterprise = intent.tier === "enterprise";
  const close = () => setIntent(null);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="border-primary/30 bg-background/95 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/15">
              {isEnterprise ? (
                <Building2 className="h-4.5 w-4.5 text-primary" aria-hidden />
              ) : (
                <Crown className="h-4.5 w-4.5 text-primary" aria-hidden />
              )}
            </span>
            {intent.featureName}
          </DialogTitle>
          <DialogDescription className="text-left">
            {intent.description ||
              `This feature is part of StickTime ${isEnterprise ? "Enterprise" : "Pro"}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 border-primary/40 bg-primary/15 text-primary"
            >
              {isEnterprise ? (
                <Building2 className="h-3 w-3" aria-hidden />
              ) : (
                <Crown className="h-3 w-3" aria-hidden />
              )}
              {isEnterprise ? "Enterprise" : "Pro"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              required to unlock this feature
            </span>
          </div>
          {intent.perks && intent.perks.length > 0 && (
            <ul className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
              {intent.perks.map((perk) => (
                <li
                  key={perk}
                  className="flex items-start gap-2 text-xs text-muted-foreground"
                >
                  <Check
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                    aria-hidden
                  />
                  {perk}
                </li>
              ))}
            </ul>
          )}{" "}
          {/* While billing is not live the CTA is an honest, disabled
              stub instead of a link to a Settings page with no billing
              section. BILLING_LIVE=true turns it into a real checkout CTA. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="sm" onClick={close}>
              Maybe later
            </Button>
            {BILLING_LIVE ? (
              <Button size="sm" onClick={close}>
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
                {upgradeCtaLabel()}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={close}
                disabled
                title={BILLING_COMING_SOON_TEXT}
              >
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
                {upgradeCtaLabel()}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
