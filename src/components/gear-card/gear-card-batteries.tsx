import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  BatteryCharging,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GearItem } from "./types";

/**
 * Lowering the pack count prunes surplus pack rows, but any pack that still
 * carries recorded IR readings is kept server-side, so raising the count
 * again (or an explicit undo) restores the set. Removal is always reversible.
 */
function changePackCount(
  gear: GearItem,
  newCount: number,
  onUpdatePackCount?: ((gearId: string, newCount: number) => void) | undefined,
) {
  if (!onUpdatePackCount) return;
  const clamped = Math.min(20, Math.max(1, newCount));
  if (clamped === gear.pack_count) return;
  onUpdatePackCount(gear.id, clamped);
}

interface GearCardBatteriesProps {
  gear: GearItem;
  isDeleting: boolean;
  onUpdatePackCount?: ((gearId: string, newCount: number) => void) | undefined;
}

export function GearCardBatteries({
  gear,
  isDeleting,
  onUpdatePackCount,
}: GearCardBatteriesProps) {
  const [isPacksCollapsed, setIsPacksCollapsed] = useState(false);

  return (
    <div className="mt-4 pt-3 border-t border-primary/10">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          className="flex items-center gap-1.5 cursor-pointer select-none text-left"
          onClick={() => setIsPacksCollapsed(!isPacksCollapsed)}
          aria-expanded={!isPacksCollapsed}
        >
          <span className="text-[11px] font-mono font-medium tracking-wider uppercase flex items-center gap-1 text-primary">
            Individual Packs ({gear.pack_count})
            {isPacksCollapsed ? (
              <ChevronDown className="h-3 w-3 inline" aria-hidden />
            ) : (
              <ChevronUp className="h-3 w-3 inline" aria-hidden />
            )}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={gear.pack_count <= 1 || isDeleting}
            onClick={() =>
              changePackCount(gear, gear.pack_count - 1, onUpdatePackCount)
            }
            className="h-6 px-2 text-[11px] text-primary hover:text-primary/80 hover:bg-primary/10"
            title="Remove pack (undo available)"
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
            className="h-6 px-2 text-[11px] text-primary hover:text-primary/80 hover:bg-primary/10"
            title="Add pack"
          >
            <Plus className="h-3 w-3 mr-0.5" /> Pack
          </Button>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          isPacksCollapsed
            ? "grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          {gear.pack_count > 0 ? (
            <div className="space-y-1.5 pt-1 pr-1 max-h-30 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-secondary/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/50 hover:[&::-webkit-scrollbar-thumb]:bg-primary">
              {Array.from({ length: gear.pack_count }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-xs bg-secondary/30 border-primary/10"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <BatteryCharging className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate font-medium text-foreground">
                      Pack #{idx + 1} ({gear.name})
                    </span>
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
    </div>
  );
}
