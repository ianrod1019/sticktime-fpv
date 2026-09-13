import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Cost Ledger layout route: /ledger/* renders child routes only — the index
 * hub (ledger.index.tsx), the personal ledger (ledger.personal.tsx) and the
 * squadron ledgers (ledger.squadron.$uuid.tsx). Mirrors the hanger layout:
 * personal first, then one entry per squadron.
 */
export const Route = createFileRoute("/_authenticated/ledger")({
  component: Outlet,
});
