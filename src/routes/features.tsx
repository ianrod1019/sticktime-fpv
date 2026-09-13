import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Timer,
  Wrench,
  Users,
  LineChart,
  Crown,
  Building2,
  BatteryCharging,
  FileDown,
  ShieldCheck,
  Puzzle,
  Check,
  ArrowRight,
  LayoutDashboard,
  Radio,
  Glasses,
} from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { BILLING_LIVE } from "@/lib/billing-status";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [{ title: "Features — StickTime FPV" }],
  }),
  component: FeaturesPage,
});

type Tier = "free" | "pro" | "enterprise";

interface FeatureRow {
  icon: typeof Timer;
  name: string;
  description: string;
  tier: Tier;
  where: string;
}

const FEATURES: FeatureRow[] = [
  {
    icon: LayoutDashboard,
    name: "Dashboard & streaks",
    description:
      "Total airtime, streaks, the consistency heatmap, and monthly volume charts.",
    tier: "free",
    where: "/dashboard",
  },
  {
    icon: Timer,
    name: "Dual timecards",
    description:
      "Real-world and simulator flight logs, kept separate, in 5-minute blocks.",
    tier: "free",
    where: "/log",
  },
  {
    icon: Wrench,
    name: "Gear hanger",
    description:
      "Quads, batteries, radios, goggles and other gear with service clocks.",
    tier: "free",
    where: "/hanger",
  },
  {
    icon: FileDown,
    name: "CSV exports",
    description:
      "Export your sessions, gear and ledgers any time. Your data is yours.",
    tier: "free",
    where: "/settings",
  },
  {
    icon: Users,
    name: "Squadrons",
    description:
      "Shared hangers, rotating entry codes, per-member ledger access and roles.",
    tier: "free",
    where: "/squadron",
  },
  {
    icon: BatteryCharging,
    name: "Battery pack health & IR tracking",
    description:
      "Per-pack health bars, internal-resistance trends and sag tracking.",
    tier: "pro",
    where: "/hanger/personal",
  },
  {
    icon: Puzzle,
    name: "Parts inventory",
    description:
      "Master spare-parts bench with install history per airframe, and the squadron bench.",
    tier: "pro",
    where: "/gear/inventory",
  },
  {
    icon: LineChart,
    name: "Personal failure analytics",
    description:
      "Failure rates, crash attribution and repair costs across your own fleet.",
    tier: "pro",
    where: "/analytics/personal",
  },
  {
    icon: ShieldCheck,
    name: "Gear edit locks & cost history",
    description:
      "Cost fields locked behind roles, purchase-cost editing tracked to managers.",
    tier: "pro",
    where: "/hanger",
  },
  {
    icon: Radio,
    name: "Squadron cost ledger",
    description:
      "Cost-per-flight-hour across org gear, bench parts and repairs.",
    tier: "pro",
    where: "/ledger",
  },
  {
    icon: Building2,
    name: "Squadron failure analytics",
    description:
      "Crashes, broken parts and repair spend across the whole squadron fleet.",
    tier: "enterprise",
    where: "/analytics",
  },
];

function TierBadge({ tier }: { tier: Tier }) {
  if (tier === "free")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground">
        <Check className="h-3 w-3" aria-hidden /> Free
      </span>
    );
  if (tier === "pro")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
        <Crown className="h-3 w-3" aria-hidden /> Pro
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
      <Building2 className="h-3 w-3" aria-hidden /> Enterprise
    </span>
  );
}

function FeatureCard({ feature }: { feature: FeatureRow }) {
  const { icon: Icon, name, description, tier, where } = feature;
  return (
    <Link
      to={where}
      className="group flex flex-col rounded-xl border border-border/60 bg-card/60 p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
          <Icon className="h-5 w-5 text-primary" aria-hidden />
        </span>
        <TierBadge tier={tier} />
      </div>
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
        {name}
      </h3>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Open <ArrowRight className="h-3 w-3" aria-hidden />
      </span>
    </Link>
  );
}

function FeaturesPage() {
  return (
    <>
      <TopNav />
      <div className="min-h-screen bg-zinc-950 text-white pt-20">
        <main className="mx-auto max-w-6xl px-6 pb-20 pt-12 lg:pt-20">
          <section className="mb-12">
            <h1 className="text-5xl font-bold tracking-tight mb-4">
              Everything StickTime tracks
            </h1>
            <p className="text-zinc-400 text-lg max-w-2xl">
              Every feature and the plan it needs. The core logbook is free
              forever — Pro and Enterprise unlock analytics depth for pilots and
              squadrons who want more.
            </p>
            {!BILLING_LIVE && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                <Crown className="h-3.5 w-3.5" aria-hidden />
                Paid tiers are invite-only while billing is in testing —
                checkout opens with the Stripe launch.
              </p>
            )}
          </section>

          {/* ---------------- Tier summary ---------------- */}
          <section className="mb-14 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-zinc-900/50 p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Free</h2>
                <TierBadge tier="free" />
              </div>
              <p className="text-sm text-zinc-400">
                The full logbook: sessions, streaks, gear, squadrons, exports.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-zinc-400">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  Unlimited logging — sim and real
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  Gear hanger + maintenance service clocks
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  One squadron membership
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-primary/30 bg-zinc-900/60 p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-primary">
                  Pro
                </h2>
                <TierBadge tier="pro" />
              </div>
              <p className="text-sm text-zinc-400">
                Everything in Free, plus the maintenance and analytics depth.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-zinc-400">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Battery pack health + IR tracker
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Parts inventory & install history
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Personal failure analytics
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Squadron cost ledger
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-zinc-900/60 p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-amber-300">
                  Enterprise
                </h2>
                <TierBadge tier="enterprise" />
              </div>
              <p className="text-sm text-zinc-400">
                Everything in Pro, plus fleet-level intelligence for squads.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-zinc-400">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                  Squadron-wide failure analytics
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                  Org fleet crash attribution & repair spend
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                  Multi-squadron administration
                </li>
              </ul>
            </div>
          </section>

          {/* ---------------- Feature grid ---------------- */}
          <section>
            <h2 className="mb-5 font-display text-xl font-bold uppercase tracking-wider text-zinc-200">
              All features
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <FeatureCard key={f.name} feature={f} />
              ))}
            </div>
          </section>

          {/* ---------------- Upgrade CTA ---------------- */}
          {!BILLING_LIVE && (
            <section className="mt-14 rounded-xl border border-primary/20 bg-zinc-900/50 p-8 text-center">
              <h2 className="font-display text-xl font-bold mb-2">
                Need Pro or Enterprise?
              </h2>
              <p className="mx-auto max-w-xl text-sm text-zinc-400">
                Checkout opens with the Stripe billing launch. Until then paid
                tiers are granted by invitation while we flight-test.
              </p>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="mt-5 inline-block">
                      <Button variant="outline" disabled>
                        Billing coming soon
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Pro and Enterprise are invite-only until Stripe launches.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
