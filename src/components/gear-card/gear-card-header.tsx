import { useState, useEffect, useRef } from "react";
import { Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GearItem } from "./types";
import { GearCardEditDialog } from "./gear-card-edit-dialog";

interface GearCardHeaderProps {
  gear: GearItem;
  servicePct: number;
  isAsNeeded: boolean;
  isBattery: boolean;
  isDeleting: boolean;
  onHoverDelete: (id: string | null) => void;
  onDeleteGear: (id: string, name: string) => void;
  onUpdateGear: (gearId: string, name: string, brand: string, serviceInterval: number, packCount: number) => void;
}

export function GearCardHeader({
  gear,
  servicePct,
  isAsNeeded,
  isBattery,
  isDeleting,
  onHoverDelete,
  onDeleteGear,
  onUpdateGear,
}: GearCardHeaderProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleStartDeletePrompt = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConfirmingDelete) return;
    setIsConfirmingDelete(true);
    onHoverDelete(gear.id);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsConfirmingDelete(false);
      onHoverDelete(null);
    }, 4000);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsConfirmingDelete(false);
    onHoverDelete(null);
  };

  const handleExecuteDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onDeleteGear(gear.id, gear.name);
  };

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
        <h3 className="text-base font-semibold tracking-tight truncate text-foreground" title={gear.name}>
          {gear.name}
        </h3>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          {gear.brand ? (
            <span className="text-orange-400 font-medium">{gear.brand}</span>
          ) : (
            ""
          )}
          {gear.brand ? " · " : ""}
          <span className="uppercase tracking-wider text-[10px]">{typeLabel}</span>
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isBattery && isAsNeeded && (
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0 border-orange-500/30 text-orange-400 mr-1"
          >
            As needed
          </Badge>
        )}

        {/* Edit Button Dialog */}
        <GearCardEditDialog gear={gear} onUpdateGear={onUpdateGear} isDeleting={isDeleting} />

        {/* Inline Confirmation or Trash Button */}
        {isConfirmingDelete ? (
          <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/40 rounded-md p-0.5 animate-in fade-in zoom-in-95 duration-150">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] font-medium bg-red-600 text-white hover:bg-red-700 hover:text-white rounded"
              onClick={handleExecuteDelete}
              disabled={isDeleting}
            >
              <Check className="h-3 w-3 mr-0.5" /> Confirm
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded"
              onClick={handleCancelDelete}
              disabled={isDeleting}
              title="Cancel"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 transition-all duration-200 ease-out text-muted-foreground hover:text-red-400 hover:bg-red-500/20 hover:border-red-500/40 active:bg-red-500/30 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed border border-transparent"
            aria-label={`Remove ${gear.name}`}
            disabled={isDeleting}
            onMouseEnter={() => onHoverDelete(gear.id)}
            onMouseLeave={() => {
              if (!isConfirmingDelete && !isDeleting) {
                onHoverDelete(null);
              }
            }}
            onClick={handleStartDeletePrompt}
          >
            <Trash2 className="h-3.5 w-3.5 transition-colors text-red-500" style={{ color: "#ef4444" }} />
          </Button>
        )}
      </div>
    </div>
  );
}
