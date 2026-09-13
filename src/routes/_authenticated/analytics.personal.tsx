import { createFileRoute } from "@tanstack/react-router";
import { FailureAnalyticsDashboard } from "@/components/analytics";

export const Route = createFileRoute("/_authenticated/analytics/personal")({
  head: () => ({
    meta: [
      { title: "Fleet Failure Analytics — StickTime FPV" },
      {
        name: "description",
        content:
          "Pro analytics: component failure rates, crash attribution and repair-cost breakdowns across your FPV fleet.",
      },
    ],
  }),
  component: PersonalAnalyticsPage,
});

function PersonalAnalyticsPage() {
  return (
    <div className="space-y-6 pb-16">
      <FailureAnalyticsDashboard />
    </div>
  );
}
