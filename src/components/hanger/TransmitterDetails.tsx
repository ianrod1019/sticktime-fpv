import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Radio,
  Sliders,
  Server,
  Crown,
  Activity,
  Shield,
  Zap,
  Cpu,
} from "lucide-react";
import { HangerItem } from "@/hooks/useHangerItem";

interface TransmitterDetailsProps {
  item: HangerItem;
}

export function TransmitterDetails({ item }: TransmitterDetailsProps) {
  const isAsNeeded = item.service_interval_minutes <= 0;
  const servicePct = isAsNeeded
    ? 0
    : Math.min(
        100,
        Math.round(
          (item.minutes_since_service / item.service_interval_minutes) * 100,
        ),
      );

  const protocol = "ELRS / Frsky";
  const gimbalSupport = "3-Way";
  const switchLayout = "Left / Right";
  const backupModel = "TX16S Model";
  const stickEnds = "CNC Aluminum V2";
  const gimbalUpgrade = "AG01 Hall Gimbal";
  const switchUpgrader = "3-Way Toggle";
  const batteryMod = "21700 Li-Ion Pack";
  const primaryStick = "Left";
  const secondaryStick = "Right";
  const mode = "Normal (10ms)";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Radio className="h-4 w-4" /> Protocol &amp; Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Protocol
                </div>
                <div className="font-mono font-medium mt-0.5">{protocol}</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Gimbal Support
                </div>
                <div className="font-mono font-medium mt-0.5">
                  {gimbalSupport}
                </div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Switch Layout
                </div>
                <div className="font-mono font-medium mt-0.5">
                  {switchLayout}
                </div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Backup Model
                </div>
                <div className="font-mono font-medium mt-0.5">
                  {backupModel}
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
              <Sliders className="h-4 w-4" /> Custom Features
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Stick Ends
                </span>
                <span className="font-mono text-sm text-foreground">
                  {stickEnds}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Gimbal Upgrade
                </span>
                <span className="font-mono text-sm text-foreground">
                  {gimbalUpgrade}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Switch Upgrader
                </span>
                <span className="font-mono text-sm text-foreground">
                  {switchUpgrader}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Battery Mod
                </span>
                <span className="font-mono text-sm text-foreground">
                  {batteryMod}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Server className="h-4 w-4" /> Usage &amp; Service History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                Total Usage
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                {item.total_minutes} min
              </div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                Service Wear
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                {servicePct}%
              </div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                Crash Count
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                {item.crash_count}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Primary Stick
              </span>
              <span className="font-mono text-sm text-foreground">
                {primaryStick}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Secondary Stick
              </span>
              <span className="font-mono text-sm text-foreground">
                {secondaryStick}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Mode
              </span>
              <span className="font-mono text-sm text-foreground">{mode}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Activity className="h-4 w-4" /> Service &amp; Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
                Service Interval
              </span>
              <span className="font-mono text-sm text-foreground">
                {item.service_interval_minutes} min
              </span>
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
              <Crown className="h-4 w-4" /> Premium Features
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Range Test
              </span>
              <span className="font-mono text-sm text-foreground">8.4 km</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Battery Mod
              </span>
              <span className="font-mono text-sm text-foreground">
                {batteryMod}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Radio Mode
              </span>
              <span className="font-mono text-sm text-foreground">{mode}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Shield className="h-4 w-4" /> Firmware &amp; Safety
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
              Firmware Version
            </span>
            <span className="font-mono text-sm text-foreground">v2.4.1</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
              Safety Features
            </span>
            <span className="font-mono text-sm text-foreground">
              RTL, Failsafe
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
              Power Draw
            </span>
            <span className="font-mono text-sm text-foreground">3.2W</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
