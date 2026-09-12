import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useHangerItem, type HangerItem } from "@/hooks/useHangerItem";
import { DroneDetails } from "@/components/hanger/DroneDetails";
import { BatteryDetails } from "@/components/hanger/BatteryDetails";
import { GogglesDetails } from "@/components/hanger/GogglesDetails";
import { TransmitterDetails } from "@/components/hanger/TransmitterDetails";
import { OtherGearDetails } from "@/components/hanger/OtherGearDetails";
import type React from "react";

type GearType = "drone" | "battery" | "goggles" | "transmitter" | "other";

const TYPE_COMPONENT_MAP: Record<
  GearType,
  React.ComponentType<{ item: HangerItem }>
> = {
  drone: DroneDetails,
  battery: BatteryDetails,
  goggles: GogglesDetails,
  transmitter: TransmitterDetails,
  other: OtherGearDetails,
};

export const Route = createFileRoute("/_authenticated/hanger/$type/$uuid")({
  head: () => ({
    meta: [{ title: "Gear Details — StickTime FPV" }],
  }),
  component: HangerDetailPage,
});

function HangerDetailPage() {
  const { type, uuid } = Route.useParams();
  const navigate = useNavigate();

  const { item, isLoading, isError, error } = useHangerItem(
    type as GearType,
    uuid,
  );

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
            Gear not found
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {(error as Error)?.message ??
              "The requested gear item could not be found or you don't have permission to view it."}
          </p>
          <div className="mt-6">
            <button
              onClick={() => navigate({ to: "/hanger" })}
              className="btn-primary w-full sm:w-auto"
            >
              Back to Hanger
            </button>
          </div>
        </div>
      </div>
    );
  }

  const DetailComponent = TYPE_COMPONENT_MAP[type as GearType];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {DetailComponent ? (
        <DetailComponent item={item} />
      ) : (
        <p className="text-muted-foreground">
          No detail view available for this gear type.
        </p>
      )}
    </div>
  );
}
