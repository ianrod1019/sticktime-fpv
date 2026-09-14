import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  BatteryCharging,
  BrainCircuit,
  ChartNoAxesCombined,
  CheckCircle2,
  PlaneTakeoff,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

function SectionHeading() {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="label-mono text-primary">One interface. Full signal.</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-[-0.04em] text-zinc-100 sm:text-4xl">
          Built to fly harder. Designed to know more.
        </h2>
      </div>
      <p className="max-w-sm text-sm leading-6 text-zinc-500 sm:text-right">
        Practical intelligence for solo pilots and the fleets that need every
        operational detail to hold up under review.
      </p>
    </div>
  );
}

/**
 * A compact production bento: every card pairs an operational capability with
 * a visual data signature, rather than generic feature-card copy.
 */
export function BentoFeatures() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative mx-auto max-w-[1440px] px-4 pb-24 pt-20 sm:px-6 lg:px-8 lg:pb-32">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.13] to-transparent" />
      <SectionHeading />

      <div className="bento-grid overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08] shadow-[0_24px_80px_-50px_rgba(0,0,0,0.95)] lg:grid-cols-12">
        <motion.article
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.42 }}
          whileHover={reduceMotion ? undefined : { y: -3 }}
          className="group relative min-h-[350px] overflow-hidden bg-[#121215] p-6 transition-colors duration-300 hover:bg-[#17171b] sm:p-8 lg:col-span-7 lg:min-h-[410px]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_84%_12%,rgba(249,115,22,0.16),transparent_27%)] opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="relative flex h-full flex-col">
            <CardEyebrow
              icon={TimerReset}
              title="Flight logbook"
              status="SYNCED"
            />
            <div className="mt-auto grid gap-8 sm:grid-cols-[1fr_1.1fr] sm:items-end">
              <div>
                <h3 className="font-display text-3xl font-semibold tracking-[-0.045em] text-zinc-100 sm:text-4xl">
                  The session, not just the stopwatch.
                </h3>
                <p className="mt-4 max-w-sm text-sm leading-6 text-zinc-400">
                  Record simulator drills and real-world packs side by side.
                  Every flight lands with the context needed to get sharper.
                </p>
                <Link
                  to="/"
                  search={{ showAuth: true, mode: "signup" }}
                  className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-primary hover:text-orange-300"
                >
                  Open flight log <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <RecordedFields
                fields={["mode", "duration", "airframe", "packs", "notes"]}
              />
            </div>
          </div>
        </motion.article>

        <motion.article
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.42, delay: 0.06 }}
          whileHover={reduceMotion ? undefined : { y: -3 }}
          className="group relative min-h-[350px] overflow-hidden bg-[#0f1012] p-6 transition-colors duration-300 hover:bg-[#141519] sm:p-8 lg:col-span-5"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_20%,rgba(56,189,248,0.12),transparent_32%)]" />
          <div className="relative flex h-full flex-col">
            <CardEyebrow
              icon={BatteryCharging}
              title="Battery intelligence"
              status="HEALTHY"
              tone="sky"
            />
            <h3 className="mt-8 max-w-sm font-display text-3xl font-semibold tracking-[-0.045em] text-zinc-100">
              See degradation before it sees you.
            </h3>
            <p className="mt-4 max-w-sm text-sm leading-6 text-zinc-400">
              Watch internal resistance, cell variance and lifetime reserve move
              from raw readings into usable maintenance signals.
            </p>
            <RecordedFields
              fields={[
                "cycle count",
                "cell variance",
                "internal resistance",
                "service state",
              ]}
              tone="sky"
            />
          </div>
        </motion.article>

        <motion.article
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.42, delay: 0.1 }}
          whileHover={reduceMotion ? undefined : { y: -3 }}
          className="group relative min-h-[300px] overflow-hidden bg-[#111114] p-6 transition-colors duration-300 hover:bg-[#16161a] sm:p-8 lg:col-span-4"
        >
          <CardEyebrow
            icon={ShieldCheck}
            title="Operational history"
            status="TRACEABLE"
            tone="emerald"
          />
          <h3 className="mt-8 font-display text-2xl font-semibold tracking-[-0.04em] text-zinc-100">
            Context that ships with the sortie.
          </h3>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Capture airframe history, pilot activity and service context in a
            timeline your fleet can actually inspect.
          </p>
          <div className="mt-7 flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> HISTORY LINKED TO HOURS
          </div>
        </motion.article>

        <motion.article
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.42, delay: 0.14 }}
          whileHover={reduceMotion ? undefined : { y: -3 }}
          className="group relative min-h-[300px] overflow-hidden bg-[#0f1012] p-6 transition-colors duration-300 hover:bg-[#141519] sm:p-8 lg:col-span-4"
        >
          <CardEyebrow
            icon={BrainCircuit}
            title="Skill intelligence"
            status="IN VIEW"
            tone="violet"
          />
          <h3 className="mt-8 font-display text-2xl font-semibold tracking-[-0.04em] text-zinc-100">
            Build repeatable stick time.
          </h3>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Turn a daily sim habit and a race-week prep cycle into the momentum
            you can actually see.
          </p>
          <div className="mt-7 flex gap-1">
            {[20, 34, 25, 52, 40, 68, 78, 64, 88, 72, 96, 84].map(
              (height, index) => (
                <span
                  key={index}
                  style={{ height: `${height / 4}px` }}
                  className="w-2 rounded-sm bg-gradient-to-t from-violet-500/20 to-violet-300/90"
                />
              ),
            )}
          </div>
        </motion.article>

        <motion.article
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.42, delay: 0.18 }}
          whileHover={reduceMotion ? undefined : { y: -3 }}
          className="group relative min-h-[300px] overflow-hidden bg-[#121215] p-6 transition-colors duration-300 hover:bg-[#17171b] sm:p-8 lg:col-span-4"
        >
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-[70px]" />
          <CardEyebrow
            icon={PlaneTakeoff}
            title="Gear control"
            status="ON BENCH"
          />
          <h3 className="mt-8 font-display text-2xl font-semibold tracking-[-0.04em] text-zinc-100">
            Keep every build airworthy.
          </h3>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Tie motors, frames, consumables and service work directly to the
            hours that cause wear.
          </p>
          <div className="mt-7 flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] text-primary">
            <ChartNoAxesCombined className="h-4 w-4" /> USAGE-BASED SERVICE
          </div>
        </motion.article>
      </div>
    </section>
  );
}

function CardEyebrow({
  icon: Icon,
  title,
  status,
  tone = "orange",
}: {
  icon: typeof TimerReset;
  title: string;
  status: string;
  tone?: "orange" | "sky" | "emerald" | "violet";
}) {
  const toneClass = {
    orange: "border-primary/25 bg-primary/10 text-primary",
    sky: "border-sky-400/20 bg-sky-400/10 text-sky-300",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    violet: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  }[tone];

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span
          className={`grid h-8 w-8 place-items-center rounded-md border ${toneClass}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          {title}
        </span>
      </div>
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
        {status}
      </span>
    </div>
  );
}

function RecordedFields({
  fields,
  tone = "orange",
}: {
  fields: string[];
  tone?: "orange" | "sky";
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#09090b]/80 p-4 backdrop-blur-sm">
      <div className="font-mono text-[9px] tracking-[0.14em] text-zinc-600">
        WHAT STICKTIME RECORDS
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {fields.map((field) => (
          <div
            key={field}
            className={`border px-2.5 py-2 font-mono text-[9px] uppercase tracking-[0.1em] ${tone === "sky" ? "border-sky-400/15 text-sky-300/80" : "border-primary/15 text-primary/80"}`}
          >
            {field}
          </div>
        ))}
      </div>
    </div>
  );
}
