import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy path — canonical gear detail now lives at /gear/drone/$uuid. */
export const Route = createFileRoute("/_authenticated/drone/$uuid")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/gear/$type/$uuid",
      params: { type: "drone", uuid: params.uuid },
      replace: true,
    });
  },
});
