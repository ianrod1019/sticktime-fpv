import { createFileRoute } from "@tanstack/react-router";
import { CostLedgerPage } from "@/pages/gear/ledger";

export const Route = createFileRoute("/_authenticated/gear/ledger")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    // ?tab=breakdown — shareable ledger views (fleet vs per-gear).
    const v = search["tab"];
    return v === "breakdown" ? { tab: v } : {};
  },
  head: () => ({
    meta: [{ title: "Cost Ledger — StickTime FPV" }],
  }),
  component: CostLedgerPage,
});
