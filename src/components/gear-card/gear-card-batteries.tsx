import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Minus, BatteryCharging, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GearItem } from "./types";

interface GearCardBatteriesProps {
  gear: GearItem;
  isDeleting: boolean;
  onUpdatePackCount?: (gearId: string, newCount: number) => void;
}

export function GearCardBatteries({
  gear,
  isDeleting,
  onUpdatePackCount,
}: GearCardBatteriesProps) {
  const [isPacksCollapsed, setIsPacksCollapsed] = useState(false);

  return (
    <div className="mt-4 pt-3 border-t border-orange-500/10">
      <div className="flex items-center justify-between mb-2">
        <div
          className="flex items-center gap-1.5 cursor-pointer select-none"
          onClick={() => setIsPacksCollapsed(!isPacksCollapsed)}
        >
          <span className="text-[11px] font-mono font-medium tracking-wider uppercase flex items-center gap-1 text-orange-400">
            Individual Packs ({gear.pack_count})
            {isPacksCollapsed ? (
              <ChevronDown className="h-3 w-3 inline" />
            ) : (
              <ChevronUp className="h-3 w-3 inline" />
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={gear.pack_count <= 1 || isDeleting}
            onClick={() => {
              if (onUpdatePackCount && gear.pack_count > 1) {
                onUpdatePackCount(gear.id, gear.pack_count - 1);
              }
            }}
            className="h-6 px-2 text-[11px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
            title="Remove pack"
          >
            <Minus className="h-3 w-3 mr-0.5" /> Pack
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDeleting}
            onClick={() => {
              if (onUpdatePackCount) {
                onUpdatePackCount(gear.id, gear.pack_count + 1);
              }
            }}
            className="h-6 px-2 text-[11px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
            title="Add pack"
          >
            <Plus className="h-3 w-3 mr-0.5" /> Pack
          </Button>
        </div>
      </div>

      <div
        style={{
          transition: "max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
          maxHeight: isPacksCollapsed ? "0px" : "250px",
          opacity: isPacksCollapsed ? 0 : 1,
        }}
      >
        {gear.pack_count > 0 ? (
          <div className="space-y-1.5 pt-1 pr-1 max-h-[120px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-secondary/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-orange-500/50 hover:[&::-webkit-scrollbar-thumb]:bg-orange-500">
            {Array.from({ length: gear.pack_count }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-xs bg-secondary/30 border-orange-500/10"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <BatteryCharging className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                  <span className="truncate font-medium text-foreground">
                    Pack #{idx + 1} ({gear.name})
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={gear.pack_count <= 1 || isDeleting}
                    onClick={() => {
                      if (onUpdatePackCount && gear.pack_count > 1) {
                        onUpdatePackCount(gear.id, gear.pack_count - 1);
                      }
                    }}
                    className="h-5 w-5 text-muted-foreground hover:text-red-400 hover:bg-red-500/20 rounded"
                    title="Retire / Remove this individual pack"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/60 italic pt-1">
            No packs remaining in this set.
          </p>
        )}
      </div>
    </div>
  );
}
