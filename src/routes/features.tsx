import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BatteryCharging,
  Briefcase,
  Check,
  CircleDollarSign,
  FileCheck2,
  FileLock2,
  Gauge,
  LayoutDashboard,
  Minus,
  ShieldCheck,
  Timer,
  Users,
  Wrench,
} from "lucide-react";
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
import { BILLING_LIVE } from "@/lib/billing-status";
import { TIER_MATRIX, TIER_ORDER } from "@/lib/pricing-tiers";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Platform — StickTime Flight Operations" },
      {
        name: "description",
        content:
          "Explore StickTime's flight logs, fleet readiness, analytics, ledger, and squadron controls.",
      },
    ],
  }),
  component: FeaturesPage,
});

const MODULES = [
  {
    icon: LayoutDashboard,
    label: "Command center",
    title: "A reliable operational overview.",
    copy: "See airtime, readiness, recent activity, and the next service decision without assembling a report.",
    details: [
      "Airtime totals by mode",
      "Current streak and activity grid",
      "Active rig utilization",
      "Readiness at a glance",
    ],
  },
  {
    icon: Timer,
    label: "Flight logs",
    title: "Capture the session, not just the stopwatch.",
    copy: "Record simulator drills and real-world packs with the airframe, conditions, notes, and context that make the data useful later.",
    details: [
      "SIM and real-world sessions",
      "Pack counts and crash notes",
      "Pilot and airframe context",
      "Fast logging from the dashboard",
    ],
  },
  {
    icon: BatteryCharging,
    label: "Battery health",
    title: "Make energy data part of the record.",
    copy: "Track pack cycles, internal resistance, cell variance, and service state before degradation becomes a surprise.",
    details: [
      "Cycle and usage history",
      "Internal-resistance tracking",
      "Service intervals",
      "Personal gear ownership",
    ],
  },
  {
    icon: Wrench,
    label: "Fleet hanger",
    title: "Know what is ready to leave the bench.",
    copy: "Connect airframes, motors, parts, repairs, and service clocks to the hours that create wear.",
    details: [
      "Airframe history",
      "Installed-part relationships",
      "Maintenance logs",
      "Usage-based service signals",
    ],
  },
  {
    icon: BarChart3,
    label: "Failure analytics",
    title: "Turn incidents into a better fleet.",
    copy: "Attribute crashes, repairs, and costs to the people, parts, and airframes that need attention.",
    details: [
      "Failure categories and trends",
      "Crash attribution",
      "Repair cost context",
      "Pro and Enterprise analytics",
    ],
  },
  {
    icon: CircleDollarSign,
    label: "Cost ledger",
    title: "Understand what every hour costs.",
    copy: "Keep personal spend separate from shared squadron spend, with access controlled by the organization.",
    details: [
      "Personal ledger",
      "Squadron ledger access",
      "Spend by gear and session",
      "Permission-aware views",
    ],
  },
  {
    icon: Users,
    label: "Squadrons",
    title: "Give teams a shared operating language.",
    copy: "Manage people, roles, shared gear, permissions, and fleet context without flattening everyone into one account.",
    details: [
      "Owner and manager roles",
      "Member permissions",
      "Shared fleet surfaces",
      "Ledger and analytics grants",
    ],
  },
  {
    icon: ShieldCheck,
    label: "Enterprise controls",
    title: "Accountability built into the workflow.",
    copy: "Keep access, audit context, and fleet-level reporting aligned with the people responsible for the operation.",
    details: [
      "Role-based access",
      "Admin portal",
      "Enterprise failure analytics",
      "Security and audit context",
    ],
  },
  {
    icon: FileLock2,
    label: "Cert & waiver vault",
    title: "Compliance you can prove, not just promise.",
    copy: "Part 107 certificates, trust documents, and parental/liability waivers in one auditable vault, with expiration badges that warn — never a lockout that keeps you from booking a flight.",
    details: [
      "Part 107, trust & waiver storage",
      "Org-wide verification and audit",
      "Expiring/expired badges, never blocks",
      "Solo Commercial & Enterprise",
    ],
  },
] as const;

function FeaturesPage() {
  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-background px-5 pb-24 pt-28 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="border-b border-border pb-16 sm:pb-24">
            <p className="label-mono text-primary">THE PLATFORM</p>
            <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
              <div>
                <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[0.96] tracking-[-0.065em] sm:text-7xl">
                  Everything that turns flight hours into an operating record.
                </h1>
              </div>
              <div>
                <p className="text-base leading-7 text-muted-foreground">
                  StickTime brings flight logs, gear health, fleet readiness,
                  spend, and access control into one system for serious pilots
                  and squadrons.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to="/" search={{ showAuth: true, mode: "signup" }}>
                    <Button className="h-10 rounded-md">
                      Start your logbook{" "}
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </Button>
                  </Link>
                  <Link to="/docs/$slug" params={{ slug: "introduction" }}>
                    <Button
                      variant="outline"
                      className="h-10 rounded-md border-border"
                    >
                      Read the docs
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="border-b border-border py-14 sm:py-20">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="label-mono text-primary">MODULES</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  A system built around real workflows.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Every surface has a job. Open the dashboard to use them, or read
                the map below to understand how they fit together.
              </p>
            </div>
            <div className="grid gap-px border border-border bg-border md:grid-cols-2">
              {MODULES.map(
                ({ icon: Icon, label, title, copy, details }, index) => (
                  <article
                    key={label}
                    className={`bg-card p-6 sm:p-8 ${index === MODULES.length - 1 && MODULES.length % 2 === 1 ? "md:col-span-2" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="grid h-10 w-10 place-items-center border border-primary/25 bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
                        0{index + 1}
                      </span>
                    </div>
                    <p className="mt-8 label-mono">{label}</p>
                    <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.045em]">
                      {title}
                    </h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                      {copy}
                    </p>
                    <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                      {details.map((detail) => (
                        <li
                          key={detail}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <Check
                            className="h-3.5 w-3.5 shrink-0 text-primary"
                            aria-hidden
                          />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </article>
                ),
              )}
            </div>
          </section>

          <section className="border-b border-border py-14 sm:py-20">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <p className="label-mono text-primary">HOW IT FITS TOGETHER</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em]">
                  From pack to decision.
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Log the work, connect the gear, inspect the trend, and make
                  the next decision with the same source of truth.
                </p>
              </div>
              <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
                {[
                  ["01", "Record", "Sessions, packs, airframes, and notes."],
                  [
                    "02",
                    "Understand",
                    "Health, readiness, utilization, and cost.",
                  ],
                  ["03", "Act", "Service, repair, permission, or fly."],
                ].map(([step, title, copy]) => (
                  <div key={step} className="bg-card p-6">
                    <span className="font-mono text-[10px] text-primary">
                      {step}
                    </span>
                    <h3 className="mt-8 font-display text-xl font-semibold">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {copy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-px border border-border bg-border py-14 sm:grid-cols-2 sm:py-20 lg:grid-cols-3 xl:grid-cols-6">
            <PlanCard
              title="Pilot"
              subtitle="For the serious solo operator"
              icon={Gauge}
              items={[
                "Unlimited flight logs",
                "Gear hanger and service clocks",
                "Personal operating record",
              ]}
            />
            <PlanCard
              title="Pro"
              subtitle="For pilots who want depth"
              icon={FileCheck2}
              items={[
                "Battery health and IR tracking",
                "Parts install history",
                "Personal failure analytics",
              ]}
            />
            <PlanCard
              title="Squad"
              subtitle="Hobbyist squads & clubs, non-commercial"
              icon={Users}
              items={[
                "Everything in Pro, per pilot",
                "Shared club roster & flight logs",
                "One bundled price, 5–10 pilots",
              ]}
            />
            <PlanCard
              title="Solo Commercial"
              subtitle="For the single commercial pilot"
              icon={Briefcase}
              items={[
                "Everything in Pro",
                "Cert & Waiver Vault",
                "Audit-ready compliance record",
              ]}
              accent
            />
            <PlanCard
              title="School"
              subtitle="For educational drone programs"
              icon={ShieldCheck}
              items={[
                "Institution-wide roster",
                "Cert & Waiver Vault",
                "Student & staff profiles",
              ]}
            />
            <PlanCard
              title="Enterprise"
              subtitle="For teams accountable for fleets"
              icon={Users}
              items={[
                "Squadron controls and roles",
                "Fleet failure analytics",
                "Cert & Waiver Vault, org-wide",
              ]}
            />
          </section>

          {!BILLING_LIVE && (
            <div className="mt-10 border border-primary/25 bg-primary/[0.05] p-5">
              <p className="label-mono text-primary">BILLING STATUS</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Pro, Squad, Solo Commercial, School, and Enterprise are invite-only
                while billing completes flight testing.
              </p>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              See full pricing <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

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
        </div>
      </main>
    </>
  );
}

function PlanCard({
  title,
  subtitle,
  icon: Icon,
  items,
  accent,
}: {
  title: string;
  subtitle: string;
  icon: typeof Gauge;
  items: string[];
  accent?: boolean;
}) {
  return (
    <article
      className={`bg-card p-6 sm:p-8 ${accent ? "border-t-2 border-primary" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3
            className={`font-display text-2xl font-semibold ${accent ? "text-primary" : "text-foreground"}`}
          >
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Icon
          className={`h-5 w-5 ${accent ? "text-primary" : "text-muted-foreground"}`}
          aria-hidden
        />
      </div>
      <ul className="mt-6 space-y-3">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
