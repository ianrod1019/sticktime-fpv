import { Shield, Clock, Flame, BatteryCharging } from "lucide-react";
import { GearItem } from "./types";

interface GearCardStatsProps {
  gear: GearItem;
  isQuad: boolean;
  isBattery: boolean;
  isAsNeeded: boolean;
  servicePct: number;
  activeHighlight: boolean;
}

export function GearCardStats({
  gear,
  isQuad,
  isBattery,
  isAsNeeded,
  servicePct,
  activeHighlight,
}: GearCardStatsProps) {
  // If it's as-needed (and not battery), flight time takes the full width (col-span-2)
  const isFullWidthFlightTime = isAsNeeded && !isBattery;

  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      {/* Flight / Operating Time */}
      <div
        className={`bg-muted/30 border border-orange-500/10 rounded-lg p-2.5 flex items-center gap-2.5 ${
          isFullWidthFlightTime ? "col-span-2" : ""
        }`}
      >
        <div className="p-1.5 rounded-md bg-orange-500/10 text-orange-400">
          <Clock className="w-4 h-4" />
        </div>
        <div>
          <div className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">
            {isBattery ? "Total Cycles" : "Flight Time"}
          </div>
          <div className="font-mono font-medium text-foreground text-sm">
            {isBattery ? `${gear.total_minutes} cycles` : `${gear.total_minutes}m`}
          </div>
        </div>
      </div>

      {/* Service Wear / Interval or Battery Pack Count */}
      {isBattery ? (
        <div className="bg-muted/30 border border-orange-500/10 rounded-lg p-2.5 flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
            <BatteryCharging className="w-4 h-4" />
          </div>
          <div>
            <div className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">Pack Count</div>
            <div className="font-mono font-medium text-foreground text-sm">
              {gear.pack_count || 4} packs
            </div>
          </div>
        </div>
      ) : isAsNeeded ? (
        /* As needed items do not show the service wear box */
        null
      ) : (
        <div className="bg-muted/30 border border-orange-500/10 rounded-lg p-2.5 flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-md ${
              servicePct >= 100
                ? "bg-red-500/20 text-red-400 animate-pulse"
                : servicePct >= 80
                ? "bg-orange-500/20 text-orange-400"
                : "bg-emerald-500/20 text-emerald-400"
            }`}
          >
            <Shield className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center text-[10px] uppercase font-semibold tracking-wider mb-1">
              <span className="text-muted-foreground">Service Wear</span>
              <span
                className={`font-mono ${
                  servicePct >= 100
                    ? "text-red-400 font-bold"
                    : servicePct >= 80
                    ? "text-orange-400 font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {servicePct}%
              </span>
            </div>
            <div className="w-full bg-background/80 rounded-full h-1.5 overflow-hidden border border-border/50">
              <div
                className={`h-full transition-all duration-500 ${
                  servicePct >= 100
                    ? "bg-red-500"
                    : servicePct >= 80
                    ? "bg-orange-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, servicePct)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Crash Count (Quads only) */}
      {isQuad && (
        <div className="col-span-2 bg-muted/30 border border-orange-500/10 rounded-lg p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-red-500/10 text-red-400">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">Crash Count</div>
              <div className="font-mono font-medium text-foreground text-sm">
                {gear.crash_count || 0} recorded crashes
              </div>
            </div>
          </div>
          <div className="text-xs font-mono text-muted-foreground bg-background/50 px-2 py-1 rounded border border-border/50">
            {(gear.crash_count || 0) === 0 ? "Clean pilot 🏆" : (gear.crash_count || 0) > 5 ? "Send it! 🔥" : "Moderate"}
          </div>
        </div>
      )}
    </div>
  );
}
