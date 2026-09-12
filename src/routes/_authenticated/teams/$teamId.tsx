import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

// Legacy alias: Squad HQ lives at /squadron/$squadronId. This route only
// redirects so old links keep working.
export const Route = createFileRoute("/_authenticated/teams/$teamId")({
  head: () => ({ meta: [{ title: "Squad HQ — StickTime FPV" }] }),
  component: TeamRedirect,
});

function TeamRedirect() {
  const { teamId } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate({
      to: "/squadron/$squadronId",
      params: { squadronId: teamId },
      replace: true,
    });
  }, [navigate, teamId]);
  return null;
}
