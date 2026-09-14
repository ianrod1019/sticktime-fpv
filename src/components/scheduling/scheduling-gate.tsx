/**
 * SchedulingGate — the tier/add-on front door of the scheduling module.
 *
 * Three states:
 *  - loading skeleton
 *  - lock card: hobbyist/pro tier → upgrade prompt (shared upgrade modal)
 *  - lock card: school org without the add-on → points at the org admin
 *
 * The gate is cosmetic coordination: the same rules are enforced by RLS
 * and the scheduling-gate trigger, so a bypassed UI reveals nothing.
 */

import { CalendarOff, GraduationCap, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { openUpgradeModal } from "@/components/billing/upgrade-modal";
import { upgradeCtaLabel } from "@/lib/billing-status";
import type { SchedulingAccess } from "@/lib/scheduling/types";

export function SchedulingGate({
  access,
  isLoading,
  isError,
  refetch,
  children,
}: {
  access: SchedulingAccess;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-9 w-64 animate-pulse rounded-md bg-white/5" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-md border border-white/5 bg-white/[0.03]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/30 bg-card/50">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <CalendarOff className="h-8 w-8 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Couldn't verify scheduling access. The server may be unreachable.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!access.enabled) {
    const isTierProblem = !access.tier_ok;
    const isAddonProblem = access.tier_ok && !access.addon_purchased;

    const openUpgrade = () =>
      openUpgradeModal({
        tier: "enterprise",
        featureName: "Scheduling & Dispatch",
        description: isAddonProblem
          ? "Your organization hasn't purchased the Scheduling Add-On yet. An org admin can add it under billing."
          : "Scheduling & dispatch requires a Solo Commercial, School (with add-on), or Enterprise tier.",
        perks: isAddonProblem
          ? [
              "Assign pilots, students & staff to airframes and batteries",
              "Race-day, shift & class-period dispatch board",
              "Prevent hardware double-booking across the fleet",
            ]
          : [
              "Assign pilots, students & staff to airframes and batteries",
              "Race-day, shift & class-period dispatch board",
              "Prevent hardware double-booking across the fleet",
            ],
      });

    return (
      <Card className="border-primary/20 border-dashed bg-card/50">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            {isAddonProblem ? (
              <GraduationCap className="h-6 w-6 text-primary" aria-hidden />
            ) : (
              <Lock className="h-6 w-6 text-primary" aria-hidden />
            )}
          </div>

          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              {isAddonProblem
                ? "Scheduling Add-On required"
                : "Scheduling is not part of your tier"}
            </h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {isAddonProblem
                ? "Your organization's tier clears the bar, but the dedicated Scheduling Add-On hasn't been purchased for this org yet."
                : "Scheduling & dispatch is available on Solo Commercial, Enterprise, and School tiers (schools also need the Scheduling Add-On). Hobbyist plans stay on the flight-log workflow."}
            </p>
          </div>

          <div className="grid w-full max-w-md grid-cols-1 gap-2 text-left">
            {(isAddonProblem
              ? [
                  "Assign pilots & students to specific airframes, batteries and slots",
                  "Dispatch board for shifts, class periods and race days",
                  "Hard-blocking hardware double-booking",
                ]
              : [
                  "Solo Commercial: full scheduling & dispatch for your operation",
                  "Enterprise fleets: multi-crew dispatch board",
                  "Schools: class periods with the Scheduling Add-On",
                ]
            ).map((perk) => (
              <div
                key={perk}
                className="flex items-start gap-2 rounded-md border border-white/5 bg-white/[0.025] px-3 py-2"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                <span className="text-xs text-zinc-300">{perk}</span>
              </div>
            ))}
          </div>

          <Button onClick={openUpgrade}>
            {isAddonProblem ? "Learn more" : upgradeCtaLabel()}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
