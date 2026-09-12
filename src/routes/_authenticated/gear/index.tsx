import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/gear/")({
  beforeLoad: () => {
    throw redirect({ to: "/hanger" });
  },
});
