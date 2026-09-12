import { Toolbox, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GearDetailHeader, formatMinutes } from "./gear-detail-header";
import { KeyValueCard } from "./spec-grid";
import { GearPartsSection } from "./gear-parts-section";
import { ServiceProgress } from "./service-progress";
import { MaintenanceLogList } from "./maintenance-log-list";
import type { GearItem } from "@/hooks/gear-item";
import { useGearLogs, useGearParts, addGearLog } from "@/hooks/gear-item";
import { usePilot } from "@/hooks/use-pilot";
import { toast } from "sonner";

interface OtherGearDetailsProps {
  item: GearItem;
  canEdit: boolean;
  isMutating: boolean;
  onEdit: () => void;
  onService?: () => void;
  onDelete: () => void;
}

export function OtherGearDetails({
  item,
  canEdit,
  isMutating,
  onEdit,
  onService,
  onDelete,
}: OtherGearDetailsProps) {
  const { profile } = usePilot();
  const { logs, isLoading: logsLoading } = useGearLogs("other", item.id);
  const { parts, isLoading: partsLoading } = useGearParts("other", item.id);

  const handleLogSubmit = async (description: string, cost: string) => {
    if (!profile?.id) return;
    const ok = await addGearLog({
      type: "other",
      uuid: item.id,
      userId: profile.id,
      description,
      cost: Number(cost) || 0,
    });
    if (ok) toast.success("Log entry saved");
    else toast.error("Could not save log entry");
  };

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

      <KeyValueCard
        title="Item Details"
        icon={<Toolbox className="h-4 w-4" aria-hidden />}
        rows={[
          { label: "Brand", value: item.brand || "—" },
          { label: "Connector", value: item.connector_type || "—" },
          {
            label: "Purchase date",
            value: item.purchase_date
              ? new Date(item.purchase_date).toLocaleDateString()
              : "—",
          },
          {
            label: "Current value",
            value:
              item.current_value != null
                ? `$${Number(item.current_value).toFixed(2)}`
                : "—",
          },
          { label: "Notes", value: item.last_service_notes || "—" },
        ]}
      />

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary text-base">
            <Info className="h-4 w-4" aria-hidden />
            Usage &amp; Service
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <KeyValueCard
            title="Recorded"
            icon={<Info className="h-4 w-4" aria-hidden />}
            rows={[
              {
                label: "Total usage",
                value: formatMinutes(item.total_minutes),
              },
            ]}
          />
          <ServiceProgress
            sinceService={item.minutes_since_service}
            interval={item.service_interval_minutes}
          />
        </CardContent>
      </Card>

      <GearPartsSection
        gearType="other"
        parts={parts}
        isLoading={partsLoading}
        emptyHint="No accessories recorded for this item yet."
      />

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary text-base">
            <Toolbox className="h-4 w-4" aria-hidden />
            Item Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MaintenanceLogList
            logs={logs}
            isLoading={logsLoading}
            canEdit={canEdit}
            onSubmitLog={handleLogSubmit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
