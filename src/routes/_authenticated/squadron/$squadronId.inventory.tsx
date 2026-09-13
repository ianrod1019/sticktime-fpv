import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SquadronInventoryPage } from "@/pages/gear/inventory/squadron";

export const Route = createFileRoute(
  "/_authenticated/squadron/$squadronId/inventory",
)({
  head: () => ({
    meta: [{ title: `Squadron Bench — StickTime FPV` }],
  }),
  component: SquadronInventoryRoute,
});

function SquadronInventoryRoute() {
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

      <SquadronInventoryPage teamId={squadronId} />
    </div>
  );
}
