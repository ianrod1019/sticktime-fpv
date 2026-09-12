import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { HangerItem } from "@/hooks/useHangerItem";
import { DroneHardwareSpecCard } from "@/components/hanger/DroneHardwareSpecCard";
import { DroneFlightLedger } from "@/components/hanger/DroneFlightLedger";
import { DroneMaintenanceLog } from "@/components/hanger/DroneMaintenanceLog";

interface DroneDetailsProps {
  item: HangerItem;
}

export function DroneDetails({ item }: DroneDetailsProps) {
  return (
    <div className="space-y-6">
      <DroneHardwareSpecCard item={item} />
      <DroneFlightLedger item={item} />
      <DroneMaintenanceLog droneId={String(item.id)} />
    </div>
  );
}
