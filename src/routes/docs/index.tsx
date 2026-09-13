import { createFileRoute, redirect } from "@tanstack/react-router";

/** /docs → /docs/introduction */
export const Route = createFileRoute("/docs/")({
  beforeLoad: () => {
    throw redirect({
      to: "/docs/$slug",
      params: { slug: "introduction" },
      replace: true,
    });
  },
});
