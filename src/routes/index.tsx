import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BatteryCharging,
  Check,
  CircleDollarSign,
  Gauge,
  LayoutDashboard,
  ShieldCheck,
  Timer,
  Users,
  Wrench,
} from "lucide-react";
import { z } from "zod";
import { AuthModal } from "@/components/auth-modal";
import { useAuth } from "@/context/auth-context";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";

const authSchema = z.object({
  showAuth: z.boolean().optional(),
  mode: z.enum(["login", "signup"]).optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => authSchema.parse(search),
  head: () => ({
    meta: [
      { title: "StickTime — Flight operations for FPV pilots" },
      {
        name: "description",
        content:
          "Log flights, understand gear health, and run a more accountable FPV operation.",
      },
    ],
  }),
  component: Landing,
});

const WORKFLOWS = [
  [
    Timer,
    "Flight logs",
    "Record sim sessions and real-world packs in one reliable timeline.",
  ],
  [
    Wrench,
    "Fleet readiness",
    "Connect hours, airframes, parts, and service work before the next sortie.",
  ],
  [
    BarChart3,
    "Operational insight",
    "See utilization, failure patterns, and cost context without spreadsheet work.",
  ],
] as const;

function Landing() {
  const { showAuth, mode } = Route.useSearch();
  const navigate = useNavigate();
  const { loading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => setAuthModalOpen(Boolean(showAuth)), [showAuth, loading]);

  const closeAuth = () =>
    navigate({ to: "/", search: { showAuth: undefined, mode: undefined } });

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-background pt-20 text-foreground">
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-7xl gap-16 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-36">
            <div>
              <p className="label-mono text-primary">
                FLIGHT OPERATIONS PLATFORM
              </p>
              <h1 className="mt-6 max-w-3xl font-display text-5xl font-semibold leading-[0.94] tracking-[-0.065em] text-foreground sm:text-7xl">
                Know what flew.
                <br />
                Know what is ready.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
                StickTime gives FPV pilots and squadrons a dependable operating
                record for airtime, gear health, service, and spend.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/" search={{ showAuth: true, mode: "signup" }}>
                  <Button size="lg" className="h-11 rounded-md px-5">
                    Start your logbook{" "}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Button>
                </Link>
                <Link to="/features">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-11 rounded-md border-border px-5"
                  >
                    Explore the platform
                  </Button>
                </Link>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" /> SIM + REAL
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" /> PERSONAL +
                  SQUADRON
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" /> ROLE-BASED
                </span>
              </div>
            </div>

            <div className="border border-border bg-card p-4 shadow-panel sm:p-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="label-mono">COMMAND CENTER</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    Your operation at a glance
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Live
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-px border border-border bg-border">
                {[
                  ["Airtime", "48h 12m"],
                  ["Readiness", "92.4%"],
                  ["Active rigs", "04"],
                  ["Next service", "08h"],
                ].map(([label, value]) => (
                  <div key={label} className="bg-card p-4">
                    <p className="label-mono">{label}</p>
                    <p className="mt-3 font-display text-2xl tracking-[-0.04em] text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <p className="label-mono">Readiness trend</p>
                  <span className="font-mono text-[10px] text-primary">
                    +18.2%
                  </span>
                </div>
                <div className="mt-6 flex h-20 items-end gap-1">
                  {[28, 36, 34, 48, 44, 58, 54, 71, 68, 83, 78, 94].map(
                    (height, index) => (
                      <span
                        key={index}
                        className="flex-1 bg-primary"
                        style={{
                          height: `${height}%`,
                          opacity: 0.25 + index * 0.05,
                        }}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="max-w-2xl">
              <p className="label-mono text-primary">
                A CLEARER OPERATING RECORD
              </p>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                The useful parts, without the noise.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Start with the workflows that matter. Go deeper on the platform
                page when you are ready.
              </p>
            </div>
            <div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-3">
              {WORKFLOWS.map(([Icon, title, copy]) => (
                <article key={title} className="bg-card p-6 sm:p-7">
                  <Icon className="h-5 w-5 text-primary" aria-hidden />
                  <h3 className="mt-8 font-display text-xl font-semibold tracking-[-0.04em]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {copy}
                  </p>
                  <Link
                    to="/features"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    Learn more <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-col justify-between gap-6 border border-border bg-card p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <p className="label-mono text-primary">
                BUILT FOR ACCOUNTABILITY
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em]">
                One record for every flight decision — compliance included.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Solo Commercial, School, and Enterprise add the Cert & Waiver
                Vault: Part 107 certs and waivers in one auditable place, with
                expiration badges that warn, never lock you out.
              </p>
            </div>
            <Link
              to="/features"
              className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              See every capability{" "}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 sm:pb-20">
          <div className="flex flex-col justify-between gap-6 border border-border bg-card p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <p className="label-mono text-primary">PRICING</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em]">
                Free for hobbyists. Priced for the rest.
              </h2>
            </div>
            <Link to="/pricing">
              <Button
                variant="outline"
                className="inline-flex shrink-0 items-center gap-2 border-border"
              >
                See pricing <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </Link>
          </div>
        </section>

        <footer className="border-t border-border px-5 py-8 sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>StickTime — flight operations for FPV pilots.</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
              SIM + REAL / PERSONAL + SQUADRON
            </span>
          </div>
        </footer>
      </main>
      {authModalOpen && (
        <AuthModal isOpen onClose={closeAuth} initialMode={mode || "login"} />
      )}
    </>
  );
}
