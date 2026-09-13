import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Bench Inventory layout route: /gear/inventory/* renders child routes only
 * — the hub (index), the pilot's personal bench (personal) — and stays the
 * parent of the squadron bench at /squadron/$id/inventory's sibling URL.
 */
export const Route = createFileRoute("/_authenticated/gear/inventory")({
  component: Outlet,
});
