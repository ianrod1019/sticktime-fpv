// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";

export default defineConfig({
  vite: {
    plugins: [
      // .mdx → React components (the in-app /docs site). Must run BEFORE the
      // React plugin so MDX gets JSX handling first — the wrapper config
      // prepends user plugins ahead of its own, which is what we want.
      {
        enforce: "pre",
        ...mdx({
          providerImportSource: "@/components/docs/mdx-context",
          remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
        }),
      },
    ],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
