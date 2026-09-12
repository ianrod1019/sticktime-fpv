import { GearDetailHeader } from "./gear-detail-header";
import type { GearItem } from "@/hooks/gear-item";

interface GogglesDetailsProps {
  item: GearItem;
  canEdit: boolean;
  isMutating: boolean;
  onEdit: () => void;
  onService?: () => void;
  onDelete: () => void;
}

export function GogglesDetails({
  item,
  canEdit,
  isMutating,
  onEdit,
  onService,
  onDelete,
}: GogglesDetailsProps) {
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
    </div>
  );
}
