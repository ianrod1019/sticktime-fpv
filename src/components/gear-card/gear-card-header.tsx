import { Pencil, Trash2, Wrench } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { GearItem } from "./types";
import { GearCardEditDialog } from "./gear-card-edit-dialog";

interface GearCardHeaderProps {
  gear: GearItem;
  detailHref: {
    to: string;
    params: { uuid: string };
  };
  isAsNeeded: boolean;
  isBattery: boolean;
  isDeleting: boolean;
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
  onOpenService: () => void;
}

export function GearCardHeader({
  gear,
  detailHref,
  isAsNeeded,
  isBattery,
  isDeleting,
  onDeleteGear,
  onUpdateGear,
  onOpenService,
}: GearCardHeaderProps) {
  const typeLabel =
    gear.gear_type === "quad"
      ? "Drone / Quad"
      : gear.gear_type === "transmitter"
        ? "Controller / Radio"
        : gear.gear_type === "goggles"
          ? "Goggles"
          : gear.gear_type === "battery"
            ? "Battery Set"
            : "Other Gear";

  return (
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="min-w-0 flex-1 pr-1">
        <h3
          className="text-base font-semibold tracking-tight truncate text-foreground"
          title={gear.name}
        >
          <Link
            to={detailHref.to}
            params={detailHref.params}
            className="hover:text-primary transition-colors"
          >
            {gear.name}
          </Link>
        </h3>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          {gear.brand ? (
            <span className="text-primary font-medium">{gear.brand}</span>
          ) : null}
          {gear.brand ? " · " : ""}
          <span className="uppercase tracking-wider text-[10px]">
            {typeLabel}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isBattery && isAsNeeded && (
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0 border-primary/30 text-primary mr-1"
          >
            As needed
          </Badge>
        )}

        {/* Log service (opens the service dialog) — batteries have no
            service clock, so the control is hidden for them */}
        {!isBattery && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 transition-all duration-200 ease-out text-muted-foreground hover:text-primary hover:bg-primary/20 active:scale-[0.95] border border-transparent"
            aria-label={`Log service for ${gear.name}`}
            title="Log service"
            onClick={(e) => {
              e.stopPropagation();
              onOpenService();
            }}
            disabled={isDeleting}
          >
            <Wrench className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Edit dialog */}
        <GearCardEditDialog
          gear={gear}
          onUpdateGear={onUpdateGear}
          isDeleting={isDeleting}
        />

        {/* Delete with confirmation dialog */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 transition-all duration-200 ease-out text-muted-foreground hover:text-destructive hover:bg-destructive/20 active:scale-[0.95] border border-transparent"
              aria-label={`Delete ${gear.name}`}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {gear.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the gear, its logged maintenance
                history, and unlinks any flight sessions that reference it. This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onDeleteGear(gear.id, gear.name)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
