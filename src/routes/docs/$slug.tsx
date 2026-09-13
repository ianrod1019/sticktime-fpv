import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { pages, DOCS_ORDER, prettifySlug } from "@/lib/docs-content";
import { DocsPageProvider } from "@/components/docs/ui";

/** /docs/$slug — renders the compiled MDX page for the slug. */
export const Route = createFileRoute("/docs/$slug")({
  beforeLoad: ({ params }) => {
    if (!pages[params.slug]) throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `${pages[params.slug]?.frontmatter?.title ?? prettifySlug(params.slug)} — StickTime FPV Docs`,
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

  const titleOf = (s: string) =>
    pages[s]?.frontmatter?.title ?? prettifySlug(s);

  const fm = mod.frontmatter;
  return (
    <DocsPageProvider slug={slug}>
      <article className="max-w-3xl">
        <header className="mb-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {fm?.title ?? prettifySlug(slug)}
          </h1>
          {fm?.description && (
            <p className="mt-2 text-base text-muted-foreground">
              {fm.description}
            </p>
          )}
        </header>
        <Page />
        <nav className="mt-14 flex items-stretch justify-between gap-4 border-t border-border/60 pt-6">
          {prev ? (
            <Link
              to="/docs/$slug"
              params={{ slug: prev }}
              className="group flex-1 rounded-lg border border-border p-4 transition-colors hover:border-primary/40"
            >
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Previous
              </span>
              <span className="mt-1 block text-sm font-medium text-foreground group-hover:text-primary">
                {titleOf(prev)}
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {next ? (
            <Link
              to="/docs/$slug"
              params={{ slug: next }}
              className="group flex-1 rounded-lg border border-border p-4 text-right transition-colors hover:border-primary/40"
            >
              <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                Next <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="mt-1 block text-sm font-medium text-foreground group-hover:text-primary">
                {titleOf(next)}
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
      </article>
    </DocsPageProvider>
  );
}
