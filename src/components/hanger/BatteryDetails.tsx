import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Flame, Zap, BatteryCharging } from "lucide-react";
import { ProWall } from "@/components/auth/pro-wall";
import { HangerItem } from "@/hooks/useHangerItem";

interface BatteryDetailsProps {
  item: HangerItem;
}

export function BatteryDetails({ item }: BatteryDetailsProps) {
  const isAsNeeded = item.service_interval_minutes <= 0;
  const servicePct = isAsNeeded
    ? 0
    : Math.min(
        100,
        Math.round(
          (item.minutes_since_service / item.service_interval_minutes) * 100,
        ),
      );
  const cycleCount = item.total_minutes;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Zap className="h-4 w-4" /> Capacity &amp; Chemistry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Capacity
                </div>
                <div className="font-mono font-medium mt-0.5">
                  {item.cells ? `${item.cells}S` : "Not recorded"}
                </div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Chemistry
                </div>
                <div className="font-mono font-medium mt-0.5">LiPo</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Cycle Count
                </div>
                <div className="font-mono font-medium mt-0.5">
                  {cycleCount} cycles
                </div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Connector
                </div>
                <div className="font-mono font-medium mt-0.5">
                  {item.connector_type ?? "Not recorded"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-primary font-medium">Status:</span>
              {isAsNeeded ? (
                <Badge
                  variant="outline"
                  className="text-[10px] px-2 py-0 border-primary/30 text-primary"
                >
                  Service as needed
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-2 py-0">
                  Service due in{" "}
                  {Math.max(
                    0,
                    item.service_interval_minutes - item.minutes_since_service,
                  )}{" "}
                  min
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Flame className="h-4 w-4" /> Service &amp; Usage Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Packs in Set
                </span>
                <span className="font-mono text-sm text-foreground">
                  {item.pack_count} packs
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Total Flight Time
                </span>
                <span className="font-mono text-sm text-foreground">
                  {item.total_minutes} min
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Service Wear
                </span>
                <span className="font-mono text-sm text-foreground">
                  {servicePct}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Crash Count
                </span>
                <span className="font-mono text-sm text-foreground">
                  {item.crash_count}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Purchase Cost
                </span>
                <span className="font-mono text-sm text-foreground">
                  ${item.purchase_cost ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Last Service
                </span>
                <span className="font-mono text-sm text-foreground">
                  Not recorded
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <BatteryCharging className="h-4 w-4" /> Individual Packs &amp;
            Charging
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                Charging Method
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                Balance Charger
              </div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Charge Rate
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                2C / 4C
              </div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Storage Voltage
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                3.85V / Cell
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Service clock:{" "}
              {isAsNeeded
                ? "No fixed interval — service as needed"
                : `${item.minutes_since_service}/${item.service_interval_minutes} min`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            <span>Notes: {item.notes ?? "No notes recorded"}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Zap className="h-4 w-4" /> Pro Features — Battery Health Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProWall
            featureName="Battery Health Analytics"
            description="Unlock advanced battery health tracking, internal resistance monitoring, and voltage sag analysis."
            allowAdminOverride
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                  LiPo Health
                </div>
                <div className="font-mono font-medium text-sm text-foreground">
                  98.2%
                </div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                  Internal Resistance
                </div>
                <div className="font-mono font-medium text-sm text-foreground">
                  8.4 mΩ
                </div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                  Voltage Sag
                </div>
                <div className="font-mono font-medium text-sm text-foreground">
                  12.6%
                </div>
              </div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                Health Trend
              </div>
              <div className="h-20 bg-muted/20 rounded-md border border-primary/10 flex items-center justify-center text-xs text-muted-foreground">
                Voltage sag curve chart (last 30 days)
              </div>
            </div>
          </ProWall>
        </CardContent>
      </Card>
    </div>
  );
}
