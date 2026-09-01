import { useState } from "react";
import { GearItem, GearPart, MaintenanceLog } from "./types";
import { GearCardHeader } from "./gear-card-header";
import { GearCardStats } from "./gear-card-stats";
import { GearCardBatteries } from "./gear-card-batteries";
import { GearCardParts } from "./gear-card-parts";
import { GearCardLogs } from "./gear-card-logs";
import { GearCardServiceDialog } from "./gear-card-service-dialog";

interface GearCardProps {
  gear: GearItem;
  parts: GearPart[];
  logs: MaintenanceLog[];
  onDeleteGear: (id: string, name: string) => void;
  onUpdateGear: (gearId: string, name: string, brand: string, serviceInterval: number, packCount: number) => void;
  onAddPart: (gearId: string, partName: string, category: string, description: string) => void;
  onRemovePart: (partId: string) => void;
  onAddLog: (gearId: string, description: string, cost: string) => void;
  onRemoveLog: (logId: string) => void;
  onService: (gearId: string, minutes: number, notes: string) => void;
  onUpdatePackCount?: (gearId: string, newCount: number) => void;
  isDeleting: boolean;
  isHoveredDelete: boolean;
  onHoverDelete: (id: string | null) => void;
}

export function GearCard({
  gear,
  parts,
  logs,
  onDeleteGear,
  onUpdateGear,
  onAddPart,
  onRemovePart,
  onAddLog,
  onRemoveLog,
  onService,
  onUpdatePackCount,
  isDeleting,
  isHoveredDelete,
  onHoverDelete,
}: GearCardProps) {
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);

  const isQuad = gear.gear_type === "quad";
  const isTransmitter = gear.gear_type === "transmitter";
  const isGoggles = gear.gear_type === "goggles";
  const isBattery = gear.gear_type === "battery";
  const isOther = gear.gear_type === "other";

  const isAsNeeded = gear.service_interval_minutes <= 0;
  const servicePct = isAsNeeded ? 0 : Math.min(100, Math.round((gear.minutes_since_service / gear.service_interval_minutes) * 100));

  return (
    <div
      style={{
        transitionProperty: "all",
        transitionDuration: "400ms",
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        maxHeight: isDeleting ? "0px" : "1000px",
        opacity: isDeleting ? 0 : 1,
        transform: isDeleting ? "scale(0.92) translateY(-16px)" : "scale(1) translateY(0)",
        marginTop: isDeleting ? "0px" : undefined,
        marginBottom: isDeleting ? "0px" : undefined,
        paddingTop: isDeleting ? "0px" : undefined,
        paddingBottom: isDeleting ? "0px" : undefined,
        overflow: "hidden",
      }}
      className={`relative group bg-card/50 border rounded-xl p-4 ${
        isHoveredDelete && !isDeleting
          ? "border-red-500/40 bg-red-500/5 shadow-lg shadow-red-500/10 ring-1 ring-red-500/20"
          : "border-orange-500/10 hover:border-orange-500/30"
      } ${isDeleting ? "!border-transparent !p-0 !m-0 !shadow-none" : ""}`}
    >
      <div className={`transition-opacity duration-200 ${isDeleting ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
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
            <GearCardBatteries
              gear={gear}
              onUpdatePackCount={onUpdatePackCount}
              isDeleting={isDeleting}
            />
          )}

          {/* Parts/Upgrades Section */}
          {(isTransmitter || isGoggles || isQuad || isOther) && (
            <GearCardParts
              gear={gear}
              parts={parts}
              isTransmitter={isTransmitter}
              isGoggles={isGoggles}
              isDeleting={isDeleting}
              onAddPart={onAddPart}
              onRemovePart={onRemovePart}
            />
          )}

          {/* Maintenance Logs Section - omitted entirely for batteries */}
          {!isBattery && (
            <GearCardLogs
              gear={gear}
              logs={logs}
              isDeleting={isDeleting}
              onAddLog={onAddLog}
              onRemoveLog={onRemoveLog}
            />
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
