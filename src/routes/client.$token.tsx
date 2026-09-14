import { createFileRoute } from "@tanstack/react-router";
import { ClientJobPortal } from "@/components/entsched/ClientJobPortal";

/**
 * /client/$token — the public deliverables portal. Deliberately OUTSIDE
 * the _authenticated tree: the client has no StickTime account; the
 * token in the URL is the credential. SSR stays on so the first paint
 * is the real job card, not a spinner.
 */
export const Route = createFileRoute("/client/$token")({
  head: () => ({
    meta: [{ title: "Your job — StickTime FPV" }],
    robots: "noindex, nofollow",
  }),
  component: ClientJobPortalRoute,
});

function ClientJobPortalRoute() {
  const { token } = Route.useParams();
  return (
    <div className="min-h-screen bg-[#08080a]">
      <ClientJobPortal token={token} />
    </div>
  );
}
