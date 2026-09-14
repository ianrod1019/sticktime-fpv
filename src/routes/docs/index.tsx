import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Command,
  Gauge,
  LifeBuoy,
  Rocket,
  Search,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { DOCS_NAV, prettifySlug } from "@/lib/docs-content";

export const Route = createFileRoute("/docs/")({ component: DocsIndex });

const GROUP_ICONS = [BookOpen, Rocket, ShieldCheck, TerminalSquare, LifeBuoy];

function DocsIndex() {
  const total = DOCS_NAV.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-[#08080a] px-4 pb-24 pt-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="grid gap-12 lg:grid-cols-[1fr_340px] lg:items-end">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] text-primary">
                <Gauge className="h-3.5 w-3.5" /> OPERATIONS KNOWLEDGE BASE
              </div>
              <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[0.95] tracking-[-0.055em] text-zinc-100 sm:text-6xl">
                The flight manual
                <br />
                <span className="text-primary">for StickTime.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-400">
                Practical guidance for pilots, fleet managers, and the teams
                responsible for keeping every airframe accountable, airworthy,
                and ready for the next sortie.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.1] bg-[#111114] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.16em] text-zinc-600">
                <span>SEARCH OPERATIONS DOCS</span>
                <span className="rounded border border-white/[0.1] px-1.5 py-0.5">
                  ⌘ K
                </span>
              </div>
              <button
                type="button"
                className="mt-4 flex w-full items-center gap-3 rounded-lg border border-white/[0.09] bg-black/25 px-3 py-3 text-left text-sm text-zinc-500 transition-colors hover:border-primary/30 hover:text-zinc-300"
              >
                <Search className="h-4 w-4" /> Search setup, logs, fleet...
              </button>
              <div className="mt-4 flex items-center gap-2 font-mono text-[9px] tracking-[0.12em] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{" "}
                {total} GUIDES // VERSION 2.4
              </div>
            </div>
          </div>
          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DOCS_NAV.map((group, index) => {
              const Icon = GROUP_ICONS[index % GROUP_ICONS.length]!;
              return (
                <section
                  key={group.group}
                  className="group rounded-2xl border border-white/[0.09] bg-[#111114] p-5 transition-colors hover:border-primary/25 hover:bg-[#151519]"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-[9px] tracking-[0.14em] text-zinc-600">
                      {String(group.items.length).padStart(2, "0")} GUIDES
                    </span>
                  </div>
                  <h2 className="mt-6 font-display text-xl font-semibold tracking-[-0.03em] text-zinc-100">
                    {group.group}
                  </h2>
                  <div className="mt-4 space-y-1">
                    {group.items.slice(0, 4).map((item) => (
                      <Link
                        key={item.slug}
                        to="/docs/$slug"
                        params={{ slug: item.slug }}
                        className="flex items-center justify-between rounded-md px-2 py-2 text-sm text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-primary"
                      >
                        <span className="truncate">
                          {item.title || prettifySlug(item.slug)}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    ))}
                  </div>
                  {group.items.length > 4 && (
                    <Link
                      to="/docs/$slug"
                      params={{ slug: group.items[4]!.slug }}
                      className="mt-4 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-primary"
                    >
                      View all <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Link
              to="/docs/$slug"
              params={{ slug: "introduction" }}
              className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-5 transition-colors hover:bg-primary/[0.1]"
            >
              <Command className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-display text-lg font-semibold text-zinc-100">
                Start at command
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Learn the product model before you wire your first fleet.
              </p>
            </Link>
            <Link
              to="/docs/$slug"
              params={{ slug: "quickstart" }}
              className="rounded-2xl border border-white/[0.09] bg-[#111114] p-5 transition-colors hover:border-primary/25"
            >
              <Rocket className="h-5 w-5 text-sky-300" />
              <h3 className="mt-4 font-display text-lg font-semibold text-zinc-100">
                Launch quickly
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Go from account creation to your first logged pack.
              </p>
            </Link>
            <Link
              to="/"
              className="rounded-2xl border border-white/[0.09] bg-[#111114] p-5 transition-colors hover:border-primary/25"
            >
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <h3 className="mt-4 font-display text-lg font-semibold text-zinc-100">
                Trust the system
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                See how StickTime handles fleet access and operational data.
              </p>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
