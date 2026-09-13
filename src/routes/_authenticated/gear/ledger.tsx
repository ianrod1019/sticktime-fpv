import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy path. The cost ledger moved to /ledger (personal at
 * /ledger/personal, squadrons at /ledger/squadron/$uuid) mirroring the
 * hanger; this route forwards old /gear/ledger links, preserving the
 * ?tab=breakdown view selection.
 */
export const Route = createFileRoute("/_authenticated/gear/ledger")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    const v = search["tab"];
    return v === "breakdown" ? { tab: v } : {};
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/ledger/personal", search, replace: true });
  },
});
