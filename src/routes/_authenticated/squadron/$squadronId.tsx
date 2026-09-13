import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Squad HQ layout route: /squadron/$squadronId renders child routes only —
 * the HQ dashboard (index) and the dedicated Squadron Failure Analytics page
 * (analytics). Kept as a layout so the analytics page can live at its own
 * URL (/squadron/$squadronId/analytics) instead of an inline tab, matching
 * the hanger subtree pattern (/hanger/*).
 */
export const Route = createFileRoute("/_authenticated/squadron/$squadronId")({
  component: Outlet,
});
