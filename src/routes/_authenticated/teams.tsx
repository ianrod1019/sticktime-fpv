import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

// Legacy alias: the squadron portal lives at /squadron. This route only
// redirects so old links and bookmarks keep working.
export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Squadrons — StickTime FPV" }] }),
  component: TeamsRedirect,
});

function TeamsRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/squadron", replace: true });
  }, [navigate]);
  return null;
}
