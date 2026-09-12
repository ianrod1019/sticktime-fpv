import { useState } from "react";
import { GearItem } from "./types";
import { GearCardHeader } from "./gear-card-header";
import { GearCardStats } from "./gear-card-stats";
import { GearCardBatteries } from "./gear-card-batteries";
import { GearCardServiceDialog } from "./gear-card-service-dialog";
import { useNavigate } from "@tanstack/react-router";

interface GearCardProps {
  gear: GearItem;
  isDeleting: boolean;
  isHoveredDelete: boolean;
  onHoverDelete: (id: string | null) => void;
  onDeleteGear: (id: string, name: string) => void;
  onUpdateGear: (
    gearId: string,
    name: string,
    brand: string,
    serviceInterval: number,
    packCount: number,
    cells: number,
    connectorType: string,
    purchaseCost: number,
  ) => void;
  onUpdatePackCount?: (gearId: string, newCount: number) => void;
  onService: (gearId: string, minutes: number, notes: string) => void;
}

export function GearCard({
  gear,
  isDeleting,
  isHoveredDelete,
  onHoverDelete,
  onDeleteGear,
  onUpdateGear,
  onUpdatePackCount,
  onService,
}: GearCardProps) {
  const navigate = useNavigate();
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);

  const isQuad = gear.gear_type === "quad";
  const isBattery = gear.gear_type === "battery";

  const isAsNeeded = gear.service_interval_minutes <= 0;
  const servicePct = isAsNeeded
    ? 0
    : Math.min(
        100,
        Math.round(
          (gear.minutes_since_service / gear.service_interval_minutes) * 100,
        ),
      );

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const detailType = gear.gear_type === "quad" ? "drone" : gear.gear_type;
    if (detailType === "drone") {
      navigate({ to: "/drone/$uuid", params: { uuid: gear.id } });
    } else {
      navigate({ to: "/hanger/$type/$uuid", params: { type: detailType, uuid: gear.id } });
    }
  };

  return (
    <div
      style={{
        transitionProperty: "all",
        transitionDuration: "400ms",
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        maxHeight: isDeleting ? "0px" : "1000px",
        opacity: isDeleting ? 0 : 1,
        transform: isDeleting
          ? "scale(0.92) translateY(-16px)"
          : "scale(1) translateY(0)",
        marginTop: isDeleting ? "0px" : undefined,
        marginBottom: isDeleting ? "0px" : undefined,
        paddingTop: isDeleting ? "0px" : undefined,
        paddingBottom: isDeleting ? "0px" : undefined,
        overflow: "hidden",
      }}
      className={`relative group bg-card/50 border rounded-xl p-4 ${
        isHoveredDelete && !isDeleting
          ? "border-destructive/40 bg-destructive/5 shadow-lg shadow-destructive/10 ring-1 ring-destructive/20"
          : "border-primary/10 hover:border-primary/30"
      } ${isDeleting ? "border-transparent! p-0! m-0! shadow-none!" : ""} cursor-pointer`}
      onClick={handleCardClick}
    >
      <div
        className={`transition-opacity duration-200 ${isDeleting ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        {/* Header */}
        <GearCardHeader
          gear={gear}
          servicePct={servicePct}
          isAsNeeded={isAsNeeded}
          isBattery={isBattery}
          isDeleting={isDeleting}
          onHoverDelete={onHoverDelete}
          onDeleteGear={onDeleteGear}
          onUpdateGear={onUpdateGear}
        />

        <div className="space-y-4">
          {/* Stats */}
          <GearCardStats
            gear={gear}
            isQuad={isQuad}
            isBattery={isBattery}
            isAsNeeded={isAsNeeded}
            servicePct={servicePct}
            activeHighlight={isHoveredDelete}
          />

          {/* Battery Packs Section */}
          {isBattery && (
            <div className="space-y-4">
              <GearCardBatteries
                gear={gear}
                onUpdatePackCount={onUpdatePackCount}
                isDeleting={isDeleting}
              />
            </div>
          )}

          {/* Service Dialog */}
          <GearCardServiceDialog
            gear={gear}
            isOpen={serviceDialogOpen}
            onOpenChange={setServiceDialogOpen}
            onService={onService}
            isDeleting={isDeleting}
          />
        </div>
      </div>
    </div>
  );
}
