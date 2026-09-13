/**
 * MDX provider source for the in-app docs. Compiled MDX pages reference
 * this module (see `providerImportSource` in vite.config.ts), so every
 * component referenced from MDX resolves here unless the page imports it
 * explicitly.
 */
import { MDXProvider, useMDXComponents } from "@mdx-js/react";
import type { ReactNode } from "react";
import { DocsComponents, type DocsComponentSet } from "@/components/docs/ui";

// Compiled MDX modules import `useMDXComponents` from this module (it is the
// `providerImportSource` in vite.config.ts) — re-export the real one.
export { useMDXComponents };

/** Bare markdown elements rendered with sensible docs styling. */
const DOC_ELEMENTS = {
  h1: (p: React.ComponentProps<"h1">) => (
    <h1
      className="mt-2 scroll-mt-24 text-3xl font-bold tracking-tight text-foreground"
      {...p}
    />
  ),
  h2: (p: React.ComponentProps<"h2">) => (
    <h2
      className="mt-10 scroll-mt-24 border-t border-border/60 pt-6 text-xl font-semibold text-foreground first:mt-0 first:border-0 first:pt-0"
      {...p}
    />
  ),
  h3: (p: React.ComponentProps<"h3">) => (
    <h3 className="mt-6 text-base font-semibold text-foreground" {...p} />
  ),
  p: (p: React.ComponentProps<"p">) => (
    <p className="mt-3 leading-relaxed text-muted-foreground" {...p} />
  ),
  a: (p: React.ComponentProps<"a">) => (
    <a className="text-primary underline-offset-4 hover:underline" {...p} />
  ),
  ul: (p: React.ComponentProps<"ul">) => (
    <ul
      className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground"
      {...p}
    />
  ),
  ol: (p: React.ComponentProps<"ol">) => (
    <ol
      className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground"
      {...p}
    />
  ),
  li: (p: React.ComponentProps<"li">) => (
    <li className="leading-relaxed" {...p} />
  ),
  blockquote: (p: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="mt-4 border-l-2 border-primary/50 pl-4 italic text-muted-foreground"
      {...p}
    />
  ),
  hr: () => <hr className="mt-8 border-border/60" />,
  strong: (p: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...p} />
  ),
  table: (p: React.ComponentProps<"table">) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" {...p} />
    </div>
  ),
  thead: (p: React.ComponentProps<"thead">) => (
    <thead className="bg-muted/50" {...p} />
  ),
  th: (p: React.ComponentProps<"th">) => (
    <th
      className="border-b border-border px-3 py-2 text-left font-medium text-foreground"
      {...p}
    />
  ),
  td: (p: React.ComponentProps<"td">) => (
    <td
      className="border-b border-border/60 px-3 py-2 align-top text-muted-foreground"
      {...p}
    />
  ),
  code: (p: React.ComponentProps<"code">) => (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
      {...p}
    />
  ),
  pre: (p: React.ComponentProps<"pre">) => (
    <pre
      className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-sm"
      {...p}
    />
  ),
} as const;

/** Components + bare elements handed to every compiled MDX page. */
const mdxComponents = {
  ...DocsComponents,
  ...DOC_ELEMENTS,
} as const;

export function DocsMdxProvider({ children }: { children: ReactNode }) {
  return <MDXProvider components={mdxComponents}>{children}</MDXProvider>;
}

export type { DocsComponentSet };
