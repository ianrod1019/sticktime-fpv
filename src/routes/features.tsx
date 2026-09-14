import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BatteryCharging,
  Check,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  LineChart,
  Radio,
  ShieldCheck,
  Timer,
  Users,
  Wrench,
} from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import { BILLING_LIVE } from "@/lib/billing-status";

export const Route = createFileRoute("/features")({
  head: () => ({ meta: [{ title: "Platform — StickTime Flight Operations" }] }),
  component: FeaturesPage,
});

const MODULES = [
  {
    icon: LayoutDashboard,
    label: "Command center",
    title: "A single operational picture.",
    copy: "See airtime, readiness, service risk, and utilization without stitching together spreadsheets.",
    tone: "orange",
  },
  {
    icon: Timer,
    label: "Flight intelligence",
    title: "Count every kind of stick time.",
    copy: "Log real-world packs and simulator work separately, then understand how they compound into pilot readiness.",
    tone: "sky",
  },
  {
    icon: BatteryCharging,
    label: "Battery health",
    title: "Treat energy like mission data.",
    copy: "Track pack cycles, internal resistance, sag, and service status as a first-class operational record.",
    tone: "emerald",
  },
  {
    icon: Wrench,
    label: "Fleet hanger",
    title: "Know what is ready to leave the bench.",
    copy: "Connect airframes, motors, parts, repairs, and service clocks to the hours that create wear.",
    tone: "violet",
  },
  {
    icon: LineChart,
    label: "Failure analytics",
    title: "Turn incidents into a better fleet.",
    copy: "Attribute crashes, repairs, and costs to the people, parts, and airframes that need attention.",
    tone: "orange",
  },
  {
    icon: ShieldCheck,
    label: "Enterprise controls",
    title: "Accountability built into the workflow.",
    copy: "Squadrons, roles, shared benches, exports, and fleet-level audit context—without losing pilot-level speed.",
    tone: "sky",
  },
] as const;

function FeaturesPage() {
  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-[#08080a] px-4 pb-24 pt-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1280px]">
          <section className="grid gap-12 border-b border-white/[0.08] pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] text-primary">
                <Radio className="h-3.5 w-3.5" /> PRODUCT SYSTEM // V2.4
              </div>
              <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[0.94] tracking-[-0.06em] text-zinc-100 sm:text-7xl">
                One system for
                <br />
                <span className="text-primary">every flight decision.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-400">
                StickTime gives individual pilots and commercial drone teams the
                same operational language: hours, readiness, service, risk, and
                proof.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/" search={{ showAuth: true, mode: "signup" }}>
                  <Button size="lg" className="h-12 rounded-md px-5">
                    Start your logbook <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/docs/$slug" params={{ slug: "introduction" }}>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 border-white/[0.14] bg-transparent"
                  >
                    Read the flight manual
                  </Button>
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.1] bg-[#111114] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_-40px_rgba(249,115,22,0.25)]">
              <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.16em] text-zinc-600">
                <span>OPERATIONS COVERAGE</span>
                <span className="text-emerald-400">100% LINKED</span>
              </div>
              <div className="mt-6 space-y-3">
                {[
                  ["AIRTIME", "12.4h", "76%"],
                  ["SERVICE CLOCKS", "04 open", "32%"],
                  ["FLEET READINESS", "92%", "92%"],
                  ["COST / HOUR", "$14.20", "64%"],
                ].map(([label, value, width]) => (
                  <div key={label}>
                    <div className="flex justify-between font-mono text-[10px] tracking-[0.14em]">
                      <span className="text-zinc-500">{label}</span>
                      <span className="text-zinc-200">{value}</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-orange-300"
                        style={{ width }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-2 border-t border-white/[0.08] pt-4 font-mono text-[9px] tracking-[0.13em] text-emerald-400">
                <Check className="h-3.5 w-3.5" /> BUILT FOR REAL OPERATIONS
              </div>
            </div>
          </section>
          <section className="py-20">
            <div className="mb-9 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="label-mono text-primary">The platform map</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.045em] text-zinc-100 sm:text-4xl">
                  From pack to post-flight report.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-zinc-500 sm:text-right">
                Every module is designed to make the next operational decision
                faster, clearer, and more defensible.
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.09] md:grid-cols-2 lg:grid-cols-3">
              {MODULES.map(({ icon: Icon, label, title, copy, tone }) => (
                <article
                  key={label}
                  className="group bg-[#111114] p-6 transition-colors hover:bg-[#17171b] sm:p-7"
                >
                  <div
                    className={`grid h-10 w-10 place-items-center rounded-lg border ${tone === "orange" ? "border-primary/25 bg-primary/10 text-primary" : tone === "sky" ? "border-sky-400/20 bg-sky-400/10 text-sky-300" : tone === "emerald" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-violet-400/20 bg-violet-400/10 text-violet-300"}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mt-8 font-mono text-[9px] tracking-[0.16em] text-zinc-600">
                    {label.toUpperCase()}
                  </div>
                  <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-zinc-100">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-500">{copy}</p>
                  <span className="mt-7 inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.14em] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    EXPLORE MODULE <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </article>
              ))}
            </div>
          </section>
          <section className="grid gap-4 border-t border-white/[0.08] pt-16 md:grid-cols-3">
            <PlanCard
              title="Pilot"
              subtitle="For the serious solo operator"
              icon={Gauge}
              items={[
                "Unlimited flight logs",
                "Gear hanger & service clocks",
                "Personal exports",
              ]}
            />
            <PlanCard
              title="Pro"
              subtitle="For pilots who want depth"
              icon={FileCheck2}
              items={[
                "Battery health & IR tracking",
                "Parts install history",
                "Personal failure analytics",
              ]}
              accent
            />
            <PlanCard
              title="Enterprise"
              subtitle="For teams accountable for fleets"
              icon={Users}
              items={[
                "Squadron controls & roles",
                "Fleet failure analytics",
                "Cost and audit context",
              ]}
              enterprise
            />
          </section>
          {!BILLING_LIVE && (
            <div className="mt-10 flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-mono text-[9px] tracking-[0.16em] text-primary">
                  BILLING STATUS
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  Pro and Enterprise are invite-only while billing completes
                  flight testing.
                </p>
              </div>
              <Link
                to="/docs/$slug"
                params={{ slug: "introduction" }}
                className="font-mono text-[10px] tracking-[0.14em] text-primary"
              >
                READ THE OPS MODEL{" "}
                <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" />
              </Link>
            </div>
          )}
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
  enterprise,
}: {
  title: string;
  subtitle: string;
  icon: typeof Gauge;
  items: string[];
  accent?: boolean;
  enterprise?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-6 ${enterprise ? "border-amber-400/25 bg-amber-400/[0.035]" : accent ? "border-primary/25 bg-primary/[0.045]" : "border-white/[0.09] bg-[#111114]"}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3
            className={`font-display text-2xl font-semibold ${enterprise ? "text-amber-200" : accent ? "text-primary" : "text-zinc-100"}`}
          >
            {title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
        </div>
        <Icon
          className={`h-5 w-5 ${enterprise ? "text-amber-300" : accent ? "text-primary" : "text-zinc-500"}`}
        />
      </div>
      <ul className="mt-6 space-y-3">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2 text-sm text-zinc-400"
          >
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
