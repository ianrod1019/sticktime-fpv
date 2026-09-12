import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { GearCardProps } from "./types";
import { useGearCardData } from "./use-gear-card-data";
import { GearCardHeader } from "./gear-card-header";
import { GearCardStats } from "./gear-card-stats";
import { GearCardBatteries } from "./gear-card-batteries";
import { GearCardParts } from "./gear-card-parts";
import { GearCardLogs } from "./gear-card-logs";
import { GearCardServiceDialog } from "./gear-card-service-dialog";

export function GearCard({
  gear,
  isDeleting,
  onDeleteGear,
  onUpdateGear,
  onUpdatePackCount,
  onService,
  onAddPart,
  onRemovePart,
  onAddLog,
  onRemoveLog,
}: GearCardProps) {
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const navigate = useNavigate();

  // Lazy per-card data: parts + paged logs are fetched (and cached) by the
  // card itself rather than up-front for the whole hanger.
  const { parts, logs, logsHaveMore } = useGearCardData(gear.id, gear.gear_type);

  const isQuad = gear.gear_type === "quad";
  const isBattery = gear.gear_type === "battery";
  const isTransmitter = gear.gear_type === "transmitter";
  const isGoggles = gear.gear_type === "goggles";

  const isAsNeeded = gear.service_interval_minutes <= 0;
  const servicePct = isAsNeeded
    ? 0
    : Math.min(
        100,
        Math.round(
          (gear.minutes_since_service / gear.service_interval_minutes) * 100,
        ),
      );

  const detailHref =
    gear.gear_type === "quad"
      ? {
          to: "/gear/$type/$uuid",
          params: { type: "drone", uuid: gear.id },
        }
      : {
          to: "/gear/$type/$uuid",
          params: { type: gear.gear_type, uuid: gear.id },
        };

  // Click anywhere on the card opens the detail view. Clicks on interactive
  // controls (buttons, links, inputs) are left alone.
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "button, a, input, select, textarea, label, [role='button'], [role='tab'], [role='dialog']",
      )
    ) {
      return;
    }
    if (gear.gear_type === "quad") {
      navigate({
        to: "/gear/$type/$uuid",
        params: { type: "drone", uuid: gear.id },
      });
    } else {
      navigate({
        to: "/gear/$type/$uuid",
        params: { type: gear.gear_type, uuid: gear.id },
      });
    }
  };

  return (
    <div
      style={{
        transitionProperty: "all",
        transitionDuration: "400ms",
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        maxHeight: isDeleting ? "0px" : "1500px",
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
      onClick={handleCardClick}
      className={`relative group bg-card/50 bg-gradient-to-b from-white/[0.03] to-transparent border rounded-xl p-4 cursor-pointer shadow-[0_1px_2px_oklch(0_0_0/0.25),0_12px_32px_-24px_oklch(0_0_0/0.6)] transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_1px_2px_oklch(0_0_0/0.25),0_20px_44px_-24px_oklch(0_0_0/0.7)] ${
        isDeleting
          ? "border-transparent! p-0! m-0! shadow-none! cursor-default!"
          : "border-primary/10 hover:border-primary/30"
      }`}
    >
      <div
        className={`transition-opacity duration-200 ${isDeleting ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        {/* Header (whole card is clickable; edit/delete/service actions) */}
        <GearCardHeader
          gear={gear}
          detailHref={detailHref}
          isAsNeeded={isAsNeeded}
          isBattery={isBattery}
          isDeleting={isDeleting}
          onDeleteGear={onDeleteGear}
          onUpdateGear={onUpdateGear}
          onOpenService={() => setServiceDialogOpen(true)}
        />

        <div className="space-y-4">
          {/* Stats */}
          <GearCardStats
            gear={gear}
            isQuad={isQuad}
            isBattery={isBattery}
            isAsNeeded={isAsNeeded}
            servicePct={servicePct}
          />

          {/* Battery Packs Section */}
          {isBattery && (
            <GearCardBatteries
              gear={gear}
              onUpdatePackCount={onUpdatePackCount}
              isDeleting={isDeleting}
            />
          )}

          {/* Components section (radios, goggles, other — quad hardware
              lives on the drone detail page via the master inventory) */}
          {onAddPart && onRemovePart && !isBattery && !isQuad && (
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

          {/* Maintenance log section (non-battery) */}
          {onAddLog && onRemoveLog && !isBattery && (
            <GearCardLogs
              gear={gear}
              logs={logs}
              hasMore={logsHaveMore}
              isDeleting={isDeleting}
              onAddLog={onAddLog}
              onRemoveLog={onRemoveLog}
            />
          )}

          {/* Service Dialog — batteries have no service tracking */}
          {!isBattery && (
            <GearCardServiceDialog
              gear={gear}
              isOpen={serviceDialogOpen}
              onOpenChange={setServiceDialogOpen}
              onService={onService}
              isDeleting={isDeleting}
            />
          )}
        </div>
      </div>
    </div>
  );
}
