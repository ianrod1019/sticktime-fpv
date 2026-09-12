import { createFileRoute } from "@tanstack/react-router";
import { DroneDetailsDisplay } from "@/components/hanger/DroneDetailsDisplay";
import { useHangerItem } from "@/hooks/useHangerItem";

export const Route = createFileRoute("/_authenticated/drone/$uuid")({
  head: () => ({
    meta: [{ title: "Drone ID — StickTime FPV" }],
  }),
  component: DroneIdPage,
});

function DroneIdPage() {
  const { uuid } = Route.useParams();

  const { item, isLoading, isError, error } = useHangerItem("drone", uuid);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="bg-card/50 border border-primary/20 rounded-xl p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Drone not found
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {(error as Error)?.message ??
              "The requested drone could not be found or you don't have permission to view it."}
          </p>
        </div>
      </div>
    );
  }

  return <DroneDetailsDisplay item={item} />;
}