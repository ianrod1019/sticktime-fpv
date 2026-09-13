import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SquadronFailureAnalytics } from "@/components/analytics";

export const Route = createFileRoute(
  "/_authenticated/squadron/$squadronId/analytics",
)({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    // ?tab=failures — legacy link compat from the old Squad HQ inline tab
    // (?tab=failures now lands on this page).
    const v = search["tab"];
    return v === "failures" ? { tab: v } : {};
  },
  head: () => ({
    meta: [{ title: `Squadron Failure Analytics — StickTime FPV` }],
  }),
  component: SquadronAnalyticsPage,
});

function SquadronAnalyticsPage() {
  const { squadronId } = Route.useParams();

  return (
    <div className="space-y-4 pb-16">
      <Button asChild variant="ghost" size="sm" className="gap-2">
        <Link
          to="/squadron/$squadronId"
          params={{ squadronId }}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Squad HQ
        </Link>
      </Button>

      <SquadronFailureAnalytics squadronId={squadronId} />
    </div>
  );
}
