import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Menu,
  Search,
} from "lucide-react";
import { pages, DOCS_NAV, DOCS_ORDER, prettifySlug } from "@/lib/docs-content";
import { DocsPageProvider } from "@/components/docs/ui";
import { TopNav } from "@/components/top-nav";
import { useState } from "react";

export const Route = createFileRoute("/docs/$slug")({
  beforeLoad: ({ params }) => {
    if (!pages[params.slug]) throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `${pages[params.slug]?.frontmatter?.title ?? prettifySlug(params.slug)} — StickTime Operations Docs`,
      },
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  const { slug } = Route.useParams();
  const mod = pages[slug]!;
  const Page = mod.default;
  const idx = DOCS_ORDER.indexOf(slug);
  const prev = idx > 0 ? DOCS_ORDER[idx - 1]! : null;
  const next =
    idx >= 0 && idx < DOCS_ORDER.length - 1 ? DOCS_ORDER[idx + 1]! : null;
  const [mobileNav, setMobileNav] = useState(false);
  const fm = mod.frontmatter;

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-[#08080a] px-4 pb-24 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-7 flex items-center justify-between border-b border-white/[0.08] pb-5">
            <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.16em] text-zinc-600">
              <BookOpen className="h-3.5 w-3.5 text-primary" /> STICKTIME
              OPERATIONS DOCS <span className="text-zinc-800">//</span> V2.4
            </div>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 font-mono text-[9px] tracking-[0.13em] text-zinc-500 hover:text-zinc-200 lg:hidden"
              onClick={() => setMobileNav((value) => !value)}
            >
              <Menu className="h-3.5 w-3.5" /> INDEX
            </button>
          </div>
          <div className="grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)_180px]">
            <aside className={`${mobileNav ? "block" : "hidden"} lg:block`}>
              <div className="sticky top-24">
                <div className="mb-4 flex items-center gap-2 font-mono text-[9px] tracking-[0.18em] text-zinc-600">
                  <Search className="h-3.5 w-3.5" /> DOCUMENT INDEX
                </div>
                <nav className="space-y-6">
                  {DOCS_NAV.map((group) => (
                    <div key={group.group}>
                      <p className="mb-2 font-mono text-[9px] tracking-[0.16em] text-primary">
                        {group.group.toUpperCase()}
                      </p>
                      <div className="space-y-0.5">
                        {group.items.map((item) => (
                          <Link
                            key={item.slug}
                            to="/docs/$slug"
                            params={{ slug: item.slug }}
                            onClick={() => setMobileNav(false)}
                            className={`block rounded-md px-2.5 py-1.5 text-xs transition-colors ${item.slug === slug ? "border border-primary/20 bg-primary/[0.08] text-primary" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"}`}
                          >
                            {item.title || prettifySlug(item.slug)}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
              </div>
            </aside>
            <article className="min-w-0 max-w-3xl">
              <header className="mb-9 border-b border-white/[0.08] pb-8">
                <div className="mb-4 font-mono text-[9px] tracking-[0.18em] text-primary">
                  FIELD MANUAL / {String(idx + 1).padStart(2, "0")}
                </div>
                <h1 className="font-display text-4xl font-semibold leading-[0.98] tracking-[-0.05em] text-zinc-100 sm:text-5xl">
                  {fm?.title ?? prettifySlug(slug)}
                </h1>
                {fm?.description && (
                  <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-500">
                    {fm.description}
                  </p>
                )}
              </header>
              <DocsPageProvider slug={slug}>
                <div className="docs-prose">
                  <Page />
                </div>
              </DocsPageProvider>
              <nav className="mt-14 grid gap-3 border-t border-white/[0.08] pt-6 sm:grid-cols-2">
                {prev ? (
                  <Link
                    to="/docs/$slug"
                    params={{ slug: prev }}
                    className="group rounded-xl border border-white/[0.09] bg-[#111114] p-4 transition-colors hover:border-primary/25"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] text-zinc-600">
                      <ArrowLeft className="h-3.5 w-3.5" /> PREVIOUS
                    </span>
                    <span className="mt-2 block text-sm text-zinc-300 group-hover:text-primary">
                      {pages[prev]?.frontmatter?.title ?? prettifySlug(prev)}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link
                    to="/docs/$slug"
                    params={{ slug: next }}
                    className="group rounded-xl border border-white/[0.09] bg-[#111114] p-4 text-right transition-colors hover:border-primary/25"
                  >
                    <span className="flex items-center justify-end gap-1.5 font-mono text-[9px] tracking-[0.14em] text-zinc-600">
                      NEXT <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                    <span className="mt-2 block text-sm text-zinc-300 group-hover:text-primary">
                      {pages[next]?.frontmatter?.title ?? prettifySlug(next)}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            </article>
            <aside className="hidden lg:block">
              <div className="sticky top-24 rounded-xl border border-white/[0.09] bg-[#111114] p-4">
                <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.15em] text-zinc-600">
                  <ChevronDown className="h-3.5 w-3.5 text-primary" /> ON THIS
                  PAGE
                </div>
                <p className="mt-4 text-xs leading-5 text-zinc-500">
                  Use the document index to move between flight operations,
                  fleet controls, and account guidance.
                </p>
                <Link
                  to="/docs/"
                  className="mt-5 inline-flex font-mono text-[9px] tracking-[0.14em] text-primary"
                >
                  BACK TO INDEX <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
