import { DroneDetailHeader } from "@/components/hanger/subcomponents/DroneDetailHeader";
import { DroneServicePanel } from "@/components/hanger/subcomponents/DroneServicePanel";
import type { HangerItem } from "@/hooks/useHangerItem";

interface DroneDetailsDisplayProps {
  item: HangerItem;
}

export function DroneDetailsDisplay({ item }: DroneDetailsDisplayProps) {
  return (
    <div className="min-h-screen bg-background/50 p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <DroneDetailHeader item={item} />
        <DroneServicePanel droneId={item.id} />
      </div>
    </div>
  );
}