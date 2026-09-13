/**
 * In-app docs content pipeline.
 *
 * Source of truth is the repo-root `docs/` folder: `docs.json` drives the
 * sidebar navigation, and the compiled MDX pages are pulled in with
 * import.meta.glob (eager — the pages are small text components and the
 * sidebar needs their frontmatter synchronously for titles/icons).
 *
 * Frontmatter (title/description/icon) is extracted at compile time by
 * remark-mdx-frontmatter and exposed as the `frontmatter` export of each
 * MDX module.
 */
import docsJson from "../../docs/docs.json";

export interface DocsNavItem {
  slug: string;
  title: string;
  description?: string | undefined;
  icon?: string | undefined;
}

export interface DocsNavGroup {
  group: string;
  items: DocsNavItem[];
}

/* ------------------------------------------------------------------ */
/* MDX page modules                                                    */
/* ------------------------------------------------------------------ */

interface MdxModule {
  default: React.ComponentType;
  frontmatter?: { title?: string; description?: string; icon?: string };
}

const pageModules = import.meta.glob<MdxModule>("../../docs/*.mdx", {
  eager: true,
});

const slugFromPath = (path: string) =>
  path.replace(/^\.\.\/\.\.\/docs\//, "").replace(/\.mdx$/, "");

/** slug → loaded MDX module (default = page component). */
export const pages: Record<string, MdxModule> = Object.fromEntries(
  Object.entries(pageModules).map(([path, mod]) => [slugFromPath(path), mod]),
);

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

interface DocsJsonGroup {
  group: string;
  pages: string[];
}

const groups = (docsJson as { navigation: { groups: DocsJsonGroup[] } })
  .navigation.groups;

/** Sidebar structure, straight from docs.json, titled from frontmatter. */
export const DOCS_NAV: DocsNavGroup[] = groups.map((g) => ({
  group: g.group,
  items: g.pages.map((slug) => ({
    slug,
    title: pages[slug]?.frontmatter?.title ?? prettifySlug(slug),
    description: pages[slug]?.frontmatter?.description,
    icon: pages[slug]?.frontmatter?.icon,
  })),
}));

/** Ordered list of every documented slug (for prev/next links). */
export const DOCS_ORDER: string[] = groups.flatMap((g) => g.pages);

export function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
