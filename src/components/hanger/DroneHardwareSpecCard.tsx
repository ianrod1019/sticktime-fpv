import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Gauge,
  Cpu,
  Zap,
  Activity,
  Shield,
  Wrench,
} from "lucide-react";
import type { HangerItem } from "@/hooks/useHangerItem";

interface DroneHardwareSpecCardProps {
  item: HangerItem;
}

export function DroneHardwareSpecCard({ item }: DroneHardwareSpecCardProps) {
  const isAsNeeded = item.service_interval_minutes <= 0;
  const servicePct = isAsNeeded
    ? 0
    : Math.min(
        100,
        Math.round(
          (item.minutes_since_service / item.service_interval_minutes) * 100,
        ),
      );

  const frameMaterial = item.frame ?? "Carbon Fiber 4mm";
  const frameSize = item.motor_size ?? "5 inch";
  const motorKV = item.motor_kv ?? 2300;
  const motorBrand = "EMAX";
  const escBrand = item.esc ?? "BLHeli_32";
  const stackBrand = "T-Motor";
  const propSize = "5.1×3.1";
  const flightController = item.fc ?? "Kakute F7";
  const receiverModel = item.receiver ?? "TBS Unify";
  const elrsVersion = "ExpressLRS 2.3";
  const vtxPower = "600mW";
  const cameraModel = "Caddx Peanut";
  const tuneName = "Stock Tune v2";

  const motorHealth = Math.max(0, 100 - item.crash_count * 15);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Gauge className="h-4 w-4" /> Frame & Motors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Frame Material
                </div>
                <div className="font-mono font-medium mt-0.5">
                  {frameMaterial}
                </div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Frame Size
                </div>
                <div className="font-mono font-medium mt-0.5">{frameSize}</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Motor KV
                </div>
                <div className="font-mono font-medium mt-0.5">{motorKV}KV</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Motor Brand
                </div>
                <div className="font-mono font-medium mt-0.5">{motorBrand}</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Motor Wear</span>
              <span className="font-mono text-foreground">{motorHealth}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Cpu className="h-4 w-4" /> Stack & FC
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  ESC
                </div>
                <div className="font-mono font-medium mt-0.5">{escBrand}</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Stack
                </div>
                <div className="font-mono font-medium mt-0.5">{stackBrand}</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Props
                </div>
                <div className="font-mono font-medium mt-0.5">{propSize}</div>
              </div>
              <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  FC
                </div>
                <div className="font-mono font-medium mt-0.5">
                  {flightController}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-primary font-medium">Receiver:</span>
              <span className="font-mono">{receiverModel}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Zap className="h-4 w-4" /> VTX & Camera
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                VTX Model
              </div>
              <div className="font-mono font-medium mt-0.5">
                {receiverModel}
              </div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                VTX Power
              </div>
              <div className="font-mono font-medium mt-0.5">{vtxPower}</div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Camera
              </div>
              <div className="font-mono font-medium mt-0.5">{cameraModel}</div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                ELRS
              </div>
              <div className="font-mono font-medium mt-0.5">{elrsVersion}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Wrench className="h-4 w-4" /> Tune & Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Active Tune
              </span>
              <span className="font-mono text-sm text-foreground">
                {tuneName}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Total Flights
              </span>
              <span className="font-mono text-sm text-foreground">
                {item.total_minutes} min
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Crash Count
              </span>
              <span className="font-mono text-sm text-foreground">
                {item.crash_count} incidents
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Activity className="h-4 w-4" /> Service Status
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
                Pack Count
              </span>
              <span className="font-mono text-sm text-foreground">
                {item.pack_count}
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
      </div>

      {item.notes && (
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Shield className="h-4 w-4" /> Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/80">{item.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
