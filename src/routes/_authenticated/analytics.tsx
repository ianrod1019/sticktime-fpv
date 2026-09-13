import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Analytics layout route: /analytics/* renders child routes only — the hub
 * (index), the personal fleet dashboard (personal). Kept as a layout so the
 * personal dashboard lives at its own URL (/analytics/personal) instead of
 * being the /analytics page itself, matching the hanger subtree pattern.
 */
export const Route = createFileRoute("/_authenticated/analytics")({
  component: Outlet,
});
