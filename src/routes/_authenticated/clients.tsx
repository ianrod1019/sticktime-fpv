import { createFileRoute } from "@tanstack/react-router";
import { ClientJobsPage } from "@/components/entsched/ClientJobsPage";

export const Route = createFileRoute("/_authenticated/clients")({
  ssr: false,
  head: () => ({ meta: [{ title: "Client jobs — StickTime FPV" }] }),
  component: ClientJobsPage,
});
