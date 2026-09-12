import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createAppQueryClient } from "./lib/query-client";

export const getRouter = () => {
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload route data (loaders + queries) when a <Link> is hovered —
    // navigation then renders from cache with zero waiting.
    defaultPreload: "intent",
    // Loader data is considered fresh for 30s so intent-preload results
    // aren't thrown away at navigation time.
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
