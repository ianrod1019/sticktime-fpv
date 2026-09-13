import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Hanger layout route: /hanger/* renders child routes only — the index hub
 * (hanger.index.tsx), the personal garage (hanger.personal.tsx) and the
 * squadron hangers (hanger.squadron.$uuid.tsx). Kept as its own route so the
 * legacy /hanger/$type/$uuid redirect below stays mounted under the same
 * subtree.
 */
export const Route = createFileRoute("/_authenticated/hanger")({
  component: Outlet,
});
