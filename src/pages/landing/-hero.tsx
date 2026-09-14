import { lazy, Suspense, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Database, Layers3, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";

// The 3D scene remains code-split so the product story can paint before WebGL.
const DroneHeroScene = lazy(() =>
  import("@/components/three/drone-hero-scene").then((m) => ({
    default: m.DroneHeroScene,
  })),
);

const flightReadouts = [
  {
    label: "SESSION RECORDS",
    value: "SIM + REAL",
    icon: Layers3,
    tone: "text-emerald-400",
  },
  {
    label: "TIME BLOCKS",
    value: "5 MIN PRECISION",
    icon: ScanLine,
    tone: "text-primary",
  },
  {
    label: "DATA MODEL",
    value: "PILOT → FLEET",
    icon: Database,
    tone: "text-sky-400",
  },
] as const;

const transition = { type: "spring", stiffness: 180, damping: 22 } as const;

/**
 * Public landing hero: an Apple-scale statement with an F1-style technical
 * readout. The WebGL quad owns the right half of the frame, while the copy and
 * flight-state indicators retain strong contrast on the left.
 */
export function LandingHero() {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setTimeout(() => {
      void import("@/components/three/drone-hero-scene");
    }, 80);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  return (
    <section className="relative isolate overflow-hidden">
      <div className="carbon-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute left-[12%] top-0 h-80 w-80 rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-10%] top-28 h-[34rem] w-[34rem] rounded-full bg-sky-500/[0.075] blur-[130px]" />

      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="relative min-h-[760px] overflow-hidden border-x border-white/[0.07] sm:min-h-[780px]">
          {/* Fine F1-inspired registration marks keep the frame intentional. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="pointer-events-none absolute bottom-9 left-6 hidden items-center gap-3 font-mono text-[10px] tracking-[0.22em] text-zinc-500 lg:flex">
            <span className="h-px w-12 bg-primary/80" />
            STK // FLIGHT OPERATIONS // 01
          </div>

          {/* The canvas is a real depth layer, not a static hero asset. */}
          <div className="hero-drift pointer-events-none absolute inset-0 z-0">
            <Suspense
              fallback={
                <div className="absolute inset-0 grid place-items-center">
                  <div className="h-8 w-8 animate-spin rounded-full border border-primary/70 border-t-transparent" />
                </div>
              }
            >
              <DroneHeroScene />
            </Suspense>
          </div>
          <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(90deg,#08080a_0%,rgba(8,8,10,0.92)_27%,rgba(8,8,10,0.38)_53%,rgba(8,8,10,0.04)_78%,rgba(8,8,10,0.58)_100%)]" />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-px bg-white/[0.12]" />

          <div className="relative z-10 grid min-h-[760px] items-center gap-12 px-6 pb-24 pt-28 sm:px-10 lg:min-h-[780px] lg:grid-cols-[minmax(0,0.95fr)_minmax(450px,1.05fr)] lg:px-16 lg:pt-20">
            <div className="max-w-3xl">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.48, ease: [0.23, 1, 0.32, 1] }}
                className="mb-7 flex w-fit items-center gap-3 rounded-full border border-white/[0.12] bg-zinc-950/60 px-3 py-1.5 backdrop-blur-xl"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-300">
                  Flight intelligence, always live
                </span>
              </motion.div>

              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transition, delay: 0.06 }}
                className="label-mono text-primary"
              >
                The operations system for pilots
              </motion.p>
              <motion.h1
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transition, delay: 0.12 }}
                className="mt-5 max-w-3xl font-display text-5xl font-semibold leading-[0.93] tracking-[-0.055em] text-white sm:text-6xl lg:text-[clamp(4.25rem,6.7vw,7.25rem)]"
              >
                Every pack.
                <br />
                Every sim run.
                <br />
                <span className="text-primary">Counted.</span>
              </motion.h1>
              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transition, delay: 0.18 }}
                className="mt-7 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg"
              >
                StickTime unifies flight logs, battery health, maintenance and
                fleet readiness in a single high-performance command center.
              </motion.p>

              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transition, delay: 0.24 }}
                className="mt-9 flex flex-col gap-3 sm:flex-row"
              >
                <Link to="/" search={{ showAuth: true, mode: "signup" }}>
                  <Button
                    size="lg"
                    className="group h-12 rounded-md border border-orange-300/20 bg-primary px-5 text-sm font-semibold text-zinc-950 shadow-[0_0_34px_-10px_rgba(249,115,22,0.9)] transition-all duration-200 hover:scale-[1.015] hover:bg-orange-400 active:scale-[0.98]"
                  >
                    Start your logbook
                    <ArrowUpRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Button>
                </Link>
                <Link to="/features">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-md border-white/[0.14] bg-zinc-950/35 px-5 text-sm text-zinc-200 backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-white/[0.06]"
                  >
                    Explore the platform
                  </Button>
                </Link>
              </motion.div>

              <motion.div
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.32, duration: 0.45 }}
                className="mt-11 grid max-w-xl grid-cols-3 divide-x divide-white/[0.1] border-y border-white/[0.1] py-4"
              >
                {flightReadouts.map(({ label, value, icon: Icon, tone }) => (
                  <div key={label} className="px-3 first:pl-0">
                    <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] text-zinc-500">
                      <Icon className={`h-3 w-3 ${tone}`} />
                      {label}
                    </div>
                    <div
                      className={`mt-1 font-mono text-[11px] font-semibold tracking-[0.1em] ${tone}`}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Desktop telemetry overlay is intentionally a sibling of the canvas
                so users retain a readable product story even without WebGL. */}
            <motion.aside
              initial={reduceMotion ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...transition, delay: 0.3 }}
              className="relative ml-auto hidden w-full max-w-sm self-end pb-14 lg:block"
              aria-label="StickTime product model"
            >
              <div className="telemetry-panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3">
                  <div className="flex items-center gap-2">
                    <ScanLine className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono text-[10px] tracking-[0.18em] text-zinc-300">
                      PRODUCT MODEL
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-500">
                    PRODUCT SIGNAL
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-white/[0.07]">
                  <Readout
                    label="FLIGHT LOGS"
                    value="SIM + REAL"
                    hint="ONE TIMELINE"
                  />
                  <Readout
                    label="AIRFRAME HEALTH"
                    value="TRACKED"
                    hint="SERVICE HISTORY"
                  />
                  <Readout
                    label="BATTERY DATA"
                    value="CYCLES + IR"
                    hint="EARLY WARNINGS"
                  />
                  <Readout
                    label="FLEET ACCESS"
                    value="ROLE BASED"
                    hint="SQUADRON READY"
                  />
                </div>
                <div className="border-t border-white/[0.08] px-5 py-4">
                  <div className="mb-2 flex justify-between font-mono text-[9px] tracking-[0.14em] text-zinc-500">
                    <span>DATA FLOW</span>
                    <span className="text-primary">STRUCTURED</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <div className="h-full w-full rounded-full bg-gradient-to-r from-orange-500 to-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.8)]" />
                  </div>
                </div>
              </div>
            </motion.aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function Readout({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-[#111114]/95 px-5 py-4">
      <div className="font-mono text-[9px] tracking-[0.15em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-xl font-semibold tracking-tight text-zinc-100">
        {value}
      </div>
      <div className="mt-1 font-mono text-[9px] tracking-[0.12em] text-zinc-500">
        {hint}
      </div>
    </div>
  );
}
