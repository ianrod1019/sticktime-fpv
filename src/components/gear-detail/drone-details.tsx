import { Gauge } from "lucide-react";
import { formatMinutes, GearDetailHeader } from "./gear-detail-header";
import { DronePartsPanel } from "./drone-parts-panel";
import { KeyValueCard, StatTile } from "./spec-grid";
import type { GearItem } from "@/hooks/gear-item";
import { useDroneBuild } from "@/hooks/gear-item";

interface DroneDetailsProps {
  item: GearItem;
  canEdit: boolean;
  isMutating: boolean;
  onEdit: () => void;
  onService?: () => void;
  onDelete: () => void;
}

export function DroneDetails({
  item,
  canEdit,
  isMutating,
  onEdit,
  onService,
  onDelete,
}: DroneDetailsProps) {
  const { installedParts } = useDroneBuild(item.id);

  const packsRun = item.pack_count ?? 0;
  const crashes = item.crash_count ?? 0;

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
          label="Flight packs run"
          value={String(packsRun)}
          hint="Packs logged on this airframe"
        />
        <StatTile
          label="Total flight time"
          value={formatMinutes(item.total_minutes)}
          hint="Lifetime across all sessions"
        />
        <StatTile
          label="Crashes"
          value={String(crashes)}
          hint="Logged incidents"
        />
      </div>

      <KeyValueCard
        title="Configuration"
        icon={<Gauge className="h-4 w-4" aria-hidden />}
        rows={[
          { label: "Cells", value: item.cells ? `${item.cells}S` : "—" },
          { label: "Connector", value: item.connector_type || "—" },
          { label: "Retired", value: item.retired ? "Yes" : "No" },
        ]}
      />

      <DronePartsPanel droneId={item.id} parts={installedParts} />
    </div>
  );
}
