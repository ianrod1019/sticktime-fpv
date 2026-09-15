import { createFileRoute } from "@tanstack/react-router";
import { DeliveryPortalView } from "@/components/portals/DeliveryPortalView";

/**
 * /portal/$token — the public client delivery portal. Deliberately
 * OUTSIDE the _authenticated tree: the client has no StickTime
 * account; the token in the URL is the credential. SSR stays on so
 * the first paint is the real delivery card, not a spinner.
 */
export const Route = createFileRoute("/portal/$token")({
  head: () => ({
    meta: [{ title: "Your delivery — StickTime FPV" }],
    robots: "noindex, nofollow",
  }),
  component: DeliveryPortalRoute,
});

function DeliveryPortalRoute() {
  const { token } = Route.useParams();
  return (
    <div className="min-h-screen bg-[#08080a]">
      <DeliveryPortalView token={token} />
    </div>
  );
}
