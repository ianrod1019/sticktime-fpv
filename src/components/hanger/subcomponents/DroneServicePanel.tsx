import { DroneMaintenanceLog } from "@/components/hanger/DroneMaintenanceLog";

interface DroneServicePanelProps {
  droneId: string;
  onLogAdded?: () => void;
}

export function DroneServicePanel({ droneId, onLogAdded }: DroneServicePanelProps) {
  return (
    <DroneMaintenanceLog
      droneId={droneId}
      {...(onLogAdded ? { onRefresh: onLogAdded } : {})}
    />
  );
}