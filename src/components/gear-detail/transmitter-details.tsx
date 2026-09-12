import { Radio } from "lucide-react";
import { GearDetailHeader } from "./gear-detail-header";
import { KeyValueCard, StatTile } from "./spec-grid";
import { GearPartsSection } from "./gear-parts-section";
import { formatMinutes } from "./gear-detail-header";
import type { GearItem } from "@/hooks/gear-item";
import { useGearParts } from "@/hooks/gear-item";

interface TransmitterDetailsProps {
  item: GearItem;
  canEdit: boolean;
  isMutating: boolean;
  onEdit: () => void;
  onService?: () => void;
  onDelete: () => void;
}

export function TransmitterDetails({
  item,
  canEdit,
  isMutating,
  onEdit,
  onService,
  onDelete,
}: TransmitterDetailsProps) {
  const { parts, isLoading: partsLoading } = useGearParts(
    "transmitter",
    item.id,
  );

  return (
    <div className="space-y-6">
      <GearDetailHeader
        item={item}
        canEdit={canEdit}
        onEdit={onEdit}
        onService={onService}
        onDelete={onDelete}
        isMutating={isMutating}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Total flight time"
          value={formatMinutes(item.total_minutes)}
          hint="Time logged with this radio"
        />
        <StatTile
          label="Service wear"
          value={`${Math.min(100, Math.round((item.minutes_since_service / Math.max(1, item.service_interval_minutes)) * 100))}%`}
          hint="Of service interval"
        />
        <StatTile
          label="Purchase cost"
          value={`$${Number(item.purchase_cost ?? 0).toFixed(2)}`}
        />
      </div>

      <KeyValueCard
        title="Radio Specifications"
        icon={<Radio className="h-4 w-4" aria-hidden />}
        rows={[{ label: "Brand", value: item.brand || "—" }]}
      />

      <GearPartsSection
        gearType="transmitter"
        parts={parts}
        isLoading={partsLoading}
        emptyHint="No parts installed on this radio yet."
      />
    </div>
  );
}
