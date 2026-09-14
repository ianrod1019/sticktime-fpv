import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DocsMdxProvider } from "@/components/docs/mdx-context";

/** Shared provider only; index and article routes own their enterprise chrome. */
export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "Operations Docs — StickTime" }] }),
  component: () => (
    <DocsMdxProvider>
      <Outlet />
    </DocsMdxProvider>
  ),
});
