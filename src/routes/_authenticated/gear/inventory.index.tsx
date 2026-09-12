import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage } from "@/pages/gear/inventory";

export const Route = createFileRoute("/_authenticated/gear/inventory/")({
  head: () => ({
    meta: [
      { title: "Bench Inventory — StickTime FPV" },
      {
        name: "description",
        content:
          "Master spare-parts inventory for your FPV fleet: filter by category and status, track lifespans and assign components to airframes (Pro).",
      },
    ],
  }),
  component: InventoryPage,
});
