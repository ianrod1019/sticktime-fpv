import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Glasses,
  Monitor,
  Code,
  Activity,
  Shield,
  Zap,
  Cpu,
  Radio,
} from "lucide-react";
import { HangerItem } from "@/hooks/useHangerItem";

interface GogglesDetailsProps {
  item: HangerItem;
}

export function GogglesDetails({ item }: GogglesDetailsProps) {
  const isAsNeeded = item.service_interval_minutes <= 0;
  const servicePct = isAsNeeded
    ? 0
    : Math.min(
        100,
        Math.round(
          (item.minutes_since_service / item.service_interval_minutes) * 100,
        ),
      );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Glasses className="h-4 w-4" /> Optics &amp; Display
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Display Type
                </div>
                <div className="font-mono font-medium mt-0.5">LCD</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Resolution
                </div>
                <div className="font-mono font-medium mt-0.5">1280×960</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Receiver Module
                </div>
                <div className="font-mono font-medium mt-0.5">TBS Fusion</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Firmware
                </div>
                <div className="font-mono font-medium mt-0.5">v3.2.1</div>
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
              <Radio className="h-4 w-4" /> Connectivity &amp; RX
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Rx Module
                </div>
                <div className="font-mono font-medium mt-0.5">TBS Fusion</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Diversity
                </div>
                <div className="font-mono font-medium mt-0.5">Auto Switch</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Band Support
                </div>
                <div className="font-mono font-medium mt-0.5">
                  Raceband 5.8GHz
                </div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  OSD
                </div>
                <div className="font-mono font-medium mt-0.5">Built-in</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Activity className="h-4 w-4" /> Service &amp; Usage Stats
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                Crash Count
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                {item.crash_count} incidents
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
                Service Int.
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                {item.service_interval_minutes} min
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Shield className="h-4 w-4" /> Comfort &amp; Fit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Interpupillary Distance
                </span>
                <span className="font-mono text-sm text-foreground">62mm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Diopter Support
                </span>
                <span className="font-mono text-sm text-foreground">
                  -5 to +5
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Faceplate
                </span>
                <span className="font-mono text-sm text-foreground">
                  Standard Foam
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Headstrap
                </span>
                <span className="font-mono text-sm text-foreground">
                  Elastic
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Battery
                </span>
                <span className="font-mono text-sm text-foreground">
                  18650 Li-ion
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Cpu className="h-4 w-4" /> Internal &amp; Power
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Processor
                </span>
                <span className="font-mono text-sm text-foreground">
                  ARM Cortex-M4
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  WiFi
                </span>
                <span className="font-mono text-sm text-foreground">
                  2.4GHz
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Power Draw
                </span>
                <span className="font-mono text-sm text-foreground">3.5W</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  HDMI In
                </span>
                <span className="font-mono text-sm text-foreground">Yes</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Code className="h-4 w-4" /> Configuration &amp; Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0 border-primary/30 text-primary"
            >
              Faceplate: Standard
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0 border-primary/30 text-primary"
            >
              Headstrap: Elastic
            </Badge>
            <Badge variant="outline" className="text-[10px] px-2 py-0">
              Diversity: Auto
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
