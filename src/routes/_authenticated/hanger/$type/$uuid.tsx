import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy path — canonical gear detail now lives at /gear/$type/$uuid. */
export const Route = createFileRoute("/_authenticated/hanger/$type/$uuid")({
  beforeLoad: ({ params }) => {
    const canonical = params.type === "goggle" ? "goggles" : params.type;
    throw redirect({
      to: "/gear/$type/$uuid",
      params: { type: canonical, uuid: params.uuid },
      replace: true,
    });
  },
});
