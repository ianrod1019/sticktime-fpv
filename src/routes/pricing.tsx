import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Minus } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BILLING_LIVE, upgradeCtaLabel } from "@/lib/billing-status";
import { PRICING_PLANS, TIER_MATRIX, TIER_ORDER } from "@/lib/pricing-tiers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — StickTime Flight Operations" },
      {
        name: "description",
        content:
          "StickTime pricing for hobbyist pilots, solo commercial operators, schools, and commercial fleets.",
      },
    ],
  }),
  component: PricingPage,
});

const FAQS = [
  {
    q: "What counts as commercial use?",
    a: "Paid client work, monetized content, or operating on behalf of a business or employer — see the Terms of Service for the full definition. Free, Pro, and Squad are hobbyist-only; commercial flying requires Solo Commercial, School, or Enterprise.",
  },
  {
    q: "Is billing live yet?",
    a: "Not yet. Paid tiers are invite-only while Stripe checkout is being finished — upgrade buttons show what's coming, and the team grants access manually in the meantime.",
  },
  {
    q: "Does the Cert & Waiver Vault ever block a flight?",
    a: "No. Expired certs and waivers only ever show a warning badge for the pilot and safety manager — the vault never locks anyone out of booking a slot on the scheduling calendar.",
  },
] as const;

function PricingPage() {
  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-background px-5 pb-24 pt-28 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="border-b border-border pb-16 sm:pb-20">
            <p className="label-mono text-primary">PRICING</p>
            <h1 className="mt-5 max-w-3xl font-display text-5xl font-semibold leading-[0.96] tracking-[-0.065em] sm:text-6xl">
              Pay for what your flying actually is.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
              Free, Pro, and Squad are for hobbyist flying — your own logs, gear, and
              cost tracking. The moment money changes hands for a flight,
              that's Solo Commercial, School, or Enterprise territory.
            </p>
          </section>

          <section className="grid gap-px border-b border-border bg-border py-14 sm:grid-cols-2 sm:py-20 lg:grid-cols-3 xl:grid-cols-6 lg:border-x">
            {PRICING_PLANS.map((plan) => (
              <article
                key={plan.tier}
                className={cn(
                  "flex flex-col bg-card p-6 sm:p-7",
                  plan.highlight && "border-t-2 border-primary",
                )}
              >
                <h2
                  className={cn(
                    "font-display text-xl font-semibold",
                    plan.highlight ? "text-primary" : "text-foreground",
                  )}
                >
                  {plan.tier}
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {plan.subtitle}
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-semibold tracking-[-0.03em]">
                    {plan.price}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                {plan.tier === "Free" ? (
                  <Link to="/" search={{ showAuth: true, mode: "signup" }}>
                    <Button
                      className="mt-7 w-full"
                      variant={plan.highlight ? "default" : "outline"}
                    >
                      Start your logbook
                    </Button>
                  </Link>
                ) : (
                  <Button
                    className="mt-7 w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    disabled={!BILLING_LIVE}
                  >
                    {upgradeCtaLabel()}
                  </Button>
                )}
              </article>
            ))}
          </section>

          {!BILLING_LIVE && (
            <div className="mt-10 border border-primary/25 bg-primary/[0.05] p-5">
              <p className="label-mono text-primary">BILLING STATUS</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Prices above are current targets, not final invoices — Stripe
                checkout hasn't launched yet, so every paid tier is invite-only
                and provisioned by hand.
              </p>
            </div>
          )}

          <section className="py-14 sm:py-20">
            <p className="label-mono text-primary">COMPARE PLANS</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
              What you get, tier by tier.
            </h2>
            <div className="mt-8 overflow-x-auto border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Capability</TableHead>
                    {TIER_ORDER.map((tier) => (
                      <TableHead key={tier} className="text-center">
                        {tier}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TIER_MATRIX.map((row) => (
                    <TableRow key={row.capability}>
                      <TableCell className="font-medium">
                        {row.capability}
                      </TableCell>
                      {TIER_ORDER.map((tier) => (
                        <TableCell key={tier} className="text-center">
                          {row.access[tier] === "limited" ? (
                            <span className="text-xs text-muted-foreground">
                              Limited
                            </span>
                          ) : row.access[tier] === "addon" ? (
                            <span className="text-xs text-muted-foreground">
                              Add-on
                            </span>
                          ) : row.access[tier] ? (
                            <Check
                              className="mx-auto h-4 w-4 text-primary"
                              aria-hidden
                            />
                          ) : (
                            <Minus
                              className="mx-auto h-4 w-4 text-muted-foreground/40"
                              aria-hidden
                            />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-20">
            <p className="label-mono text-primary">QUESTIONS</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
              Before you pick a tier.
            </h2>
            <div className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-3">
              {FAQS.map(({ q, a }) => (
                <div key={q} className="bg-card p-6 sm:p-7">
                  <h3 className="font-display text-base font-semibold">
                    {q}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {a}
                  </p>
                </div>
              ))}
            </div>
            <Link
              to="/terms"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Read the full Terms of Service{" "}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}
