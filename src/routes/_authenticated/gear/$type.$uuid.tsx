import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useGearItem,
  useGearMutations,
  isGearType,
  type GearType,
} from "@/hooks/gear-item";
import { LoadingPanel, ErrorPanel } from "@/components/state-panels";
import { DroneDetails } from "@/components/gear-detail/drone-details";
import { BatteryDetails } from "@/components/gear-detail/battery-details";
import { GogglesDetails } from "@/components/gear-detail/goggles-details";
import { TransmitterDetails } from "@/components/gear-detail/transmitter-details";
import { OtherGearDetails } from "@/components/gear-detail/other-details";
import { GearEditDialog } from "@/components/gear-detail/gear-detail-dialogs";
import { GearServiceDialog } from "@/components/gear-detail/gear-service-dialog";

export const Route = createFileRoute("/_authenticated/gear/$type/$uuid")({
  head: () => ({
    meta: [{ title: "Gear Details — StickTime FPV" }],
  }),
  component: GearDetailPage,
});

function GearDetailPage() {
  const { type, uuid } = Route.useParams();
  const navigate = useNavigate();
  const { item, isLoading, isError, error, canEdit } = useGearItem(type, uuid);
  const { updateGear, serviceGear, deleteGear, isMutating } = useGearMutations(
    type,
    uuid,
  );
  const [editOpen, setEditOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);

  if (isLoading) {
    return <LoadingPanel label="Loading gear…" />;
  }

  if (isError || !item) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ErrorPanel
          message={
            (error as Error | null)?.message ??
            "Gear not found — it may have been deleted, or you don't have access to it."
          }
          onRetry={() => navigate({ to: "/hanger" })}
        />
      </div>
    );
  }

  const validType: GearType = isGearType(type) ? type : "other";
  const isBattery = validType === "battery";
  const detailProps = {
    item,
    canEdit,
    isMutating,
    onEdit: () => setEditOpen(true),
    onDelete: () =>
      deleteGear.mutate(undefined, {
        onSuccess: () => navigate({ to: "/hanger" }),
      }),
    // Batteries have no service tracking — omit the handler so the header
    // hides the Service button entirely.
    ...(isBattery ? {} : { onService: () => setServiceOpen(true) }),
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {validType === "quad" && <DroneDetails {...detailProps} />}
      {validType === "battery" && <BatteryDetails {...detailProps} />}
      {validType === "goggles" && <GogglesDetails {...detailProps} />}
      {validType === "transmitter" && <TransmitterDetails {...detailProps} />}
      {validType === "other" && <OtherGearDetails {...detailProps} />}

      <GearEditDialog
        item={item}
        isOpen={editOpen}
        onOpenChange={setEditOpen}
        onSave={(input) => updateGear.mutate(input)}
        isMutating={isMutating}
      />
      {!isBattery && (
        <GearServiceDialog
          item={item}
          isOpen={serviceOpen}
          onOpenChange={setServiceOpen}
          onService={(input) => serviceGear.mutate(input)}
          canAddPart={
            validType === "transmitter" ||
            validType === "goggles" ||
            validType === "other"
          }
          isMutating={isMutating}
        />
      )}
    </div>
  );
}
