import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { DocsMdxProvider } from "@/components/docs/mdx-context";
import { DOCS_NAV } from "@/lib/docs-content";

/**
 * /docs — the in-app documentation site. Content is the repo-root docs/
 * folder: docs.json builds the sidebar, each MDX page compiles to a route
 * component served at /docs/<slug>.
 */
export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "Docs — StickTime FPV" }] }),
  component: DocsLayout,
});

function DocsLayout() {
  return (
    <DocsMdxProvider>
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="mx-auto flex max-w-7xl gap-10 px-6 pt-24 pb-16">
          {/* Sidebar */}
          <aside className="sticky top-24 hidden h-[calc(100vh-7rem)] w-60 shrink-0 overflow-y-auto md:block">
            <Link
              to="/"
              className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <BookOpen className="h-4 w-4" aria-hidden />
              <span className="font-semibold text-foreground">
                Documentation
              </span>
            </Link>
            <nav className="space-y-6">
              {DOCS_NAV.map((group) => (
                <div key={group.group}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.group}
                  </p>
                  <ul className="space-y-0.5 border-l border-border/60">
                    {group.items.map((item) => (
                      <li key={item.slug}>
                        <Link
                          to="/docs/$slug"
                          params={{ slug: item.slug }}
                          activeProps={{
                            className:
                              "text-primary font-medium border-primary",
                          }}
                          className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          {/* Page content */}
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </DocsMdxProvider>
  );
}
