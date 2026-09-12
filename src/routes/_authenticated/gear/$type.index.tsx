import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/gear/$type/")({
  beforeLoad: () => {
    throw redirect({ to: "/hanger" });
  },
});
