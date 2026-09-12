import { Zap, Flame, BatteryCharging } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GearDetailHeader } from "./gear-detail-header";
import { StatTile, StatRow } from "./spec-grid";
import { BatteryIrTracker } from "./battery-ir-tracker";
import {
  DEFAULT_STORAGE_VOLTAGE_PER_CELL,
  DEFAULT_FULL_VOLTAGE_PER_CELL,
  DEFAULT_EMPTY_VOLTAGE_PER_CELL,
  hasCustomChargingPractice,
} from "@/lib/battery-voltages";
import type { GearItem } from "@/hooks/gear-item";

interface BatteryDetailsProps {
  item: GearItem;
  canEdit: boolean;
  isMutating: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Battery detail view: hardware facts only — no service tracking, no
 * flight-time stats and no maintenance log for packs.
 */
export function BatteryDetails({
  item,
  canEdit,
  isMutating,
  onEdit,
  onDelete,
}: BatteryDetailsProps) {
  const cells = item.cells && item.cells > 0 ? `${item.cells}S` : "—";
  const cycles = item.pack_count ?? 0;

  // The Charging Practice card only appears when the pilot recorded a custom
  // charging voltage — assumed defaults are never presented as recorded data.
  const showChargingPractice = hasCustomChargingPractice({
    storage_voltage_per_cell: item.storage_voltage_per_cell,
    full_voltage_per_cell: item.full_voltage_per_cell,
    empty_voltage_per_cell: item.empty_voltage_per_cell,
  });

  return (
    <div className="space-y-6">
      <GearDetailHeader
        item={item}
        canEdit={canEdit}
        onEdit={onEdit}
        onDelete={onDelete}
        isMutating={isMutating}
        showUsageStats={false}
      />

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatTile label="Cell count" value={cells} />
        <StatTile label="Connector" value={item.connector_type || "—"} />
        <StatTile label="Packs in set" value={String(item.pack_count ?? 0)} />
        <StatTile label="Cycles" value={`${cycles} packs run`} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary text-base">
              <Zap className="h-4 w-4" aria-hidden />
              Pack Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <StatRow label="Cell count" value={cells} />
            <StatRow label="Connector" value={item.connector_type || "—"} />
            <StatRow label="Chemistry" value="LiPo" />
            <StatRow
              label="Purchase date"
              value={
                item.purchase_date
                  ? new Date(item.purchase_date).toLocaleDateString()
                  : "—"
              }
            />
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary text-base">
              <Flame className="h-4 w-4" aria-hidden />
              Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <StatRow label="Cycles" value={`${cycles} packs run`} />
            <StatRow
              label="Crash count"
              value={String(item.crash_count ?? 0)}
            />
          </CardContent>
        </Card>
      </div>

      <BatteryIrTracker item={item} />

      {showChargingPractice && (
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary text-base">
              <BatteryCharging className="h-4 w-4" aria-hidden />
              Charging Practice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatTile
                label="Storage voltage"
                value={
                  item.storage_voltage_per_cell != null
                    ? `${item.storage_voltage_per_cell.toFixed(2)} V/cell`
                    : `~${DEFAULT_STORAGE_VOLTAGE_PER_CELL.toFixed(2)} V/cell (assumed)`
                }
              />
              <StatTile
                label="Full voltage"
                value={
                  item.full_voltage_per_cell != null
                    ? `${item.full_voltage_per_cell.toFixed(2)} V/cell`
                    : `~${DEFAULT_FULL_VOLTAGE_PER_CELL.toFixed(2)} V/cell (assumed)`
                }
              />
              <StatTile
                label="Empty voltage"
                value={
                  item.empty_voltage_per_cell != null
                    ? `${item.empty_voltage_per_cell.toFixed(2)} V/cell`
                    : `~${DEFAULT_EMPTY_VOLTAGE_PER_CELL.toFixed(2)} V/cell (assumed)`
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Values marked "assumed" are standard LiPo defaults, not recorded
              readings — edit the set to record your own charging practice.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
