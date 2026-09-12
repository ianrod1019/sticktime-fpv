import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GearItem, UpdateGearInput } from "@/hooks/gear-item";
import {
  DEFAULT_STORAGE_VOLTAGE_PER_CELL,
  parseVoltageFields,
} from "@/lib/battery-voltages";

interface GearEditDialogProps {
  item: GearItem;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: UpdateGearInput) => void;
  isMutating: boolean;
}

/**
 * Edits only columns that exist in the live schema: name, brand, service
 * interval and purchase cost.
 */
export function GearEditDialog({
  item,
  isOpen,
  onOpenChange,
  onSave,
  isMutating,
}: GearEditDialogProps) {
  const [name, setName] = useState(item.name);
  const [brand, setBrand] = useState(item.brand ?? "");
  const isBattery = item.type === "battery";
  // Batteries have no service tracking — the field only exists for other gear.
  const [interval, setInterval] = useState(
    item.service_interval_minutes > 0
      ? String(item.service_interval_minutes)
      : "",
  );
  const [cost, setCost] = useState(String(item.purchase_cost ?? 0));
  // Optional per-cell voltages: empty means "no custom value" (the column
  // stays NULL and the app falls back to the assumed default).
  const [storageVoltage, setStorageVoltage] = useState(
    item.storage_voltage_per_cell != null
      ? String(item.storage_voltage_per_cell)
      : "",
  );
  const [fullVoltage, setFullVoltage] = useState(
    item.full_voltage_per_cell != null
      ? String(item.full_voltage_per_cell)
      : "",
  );
  const [emptyVoltage, setEmptyVoltage] = useState(
    item.empty_voltage_per_cell != null
      ? String(item.empty_voltage_per_cell)
      : "",
  );

  // Re-sync fields each time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setName(item.name);
    setBrand(item.brand ?? "");
    setInterval(
      item.service_interval_minutes > 0
        ? String(item.service_interval_minutes)
        : "",
    );
    setCost(String(item.purchase_cost ?? 0));
    setStorageVoltage(
      item.storage_voltage_per_cell != null
        ? String(item.storage_voltage_per_cell)
        : "",
    );
    setFullVoltage(
      item.full_voltage_per_cell != null
        ? String(item.full_voltage_per_cell)
        : "",
    );
    setEmptyVoltage(
      item.empty_voltage_per_cell != null
        ? String(item.empty_voltage_per_cell)
        : "",
    );
  }, [isOpen, item]);

  const handleSave = () => {
    if (!name.trim()) return;
    const parsedInterval = Math.max(0, Number(interval) || 0);
    const parsedCost = Math.max(0, Number(cost) || 0);
    onSave({
      name: name.trim(),
      brand: brand.trim() || null,
      // Batteries carry no service clock; never overwrite the column for them.
      ...(isBattery ? {} : { service_interval_minutes: parsedInterval }),
      purchase_cost: parsedCost,
      ...(isBattery
        ? parseVoltageFields({
            storageVoltage,
            fullVoltage,
            emptyVoltage,
          })
        : {}),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/30 bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-foreground">
            <Wrench className="h-5 w-5 text-primary" aria-hidden />
            Edit {item.name}
          </DialogTitle>
          <DialogDescription>
            Update core metadata.{" "}
            {!isBattery && 'Service interval "0" means service as needed.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="gear-edit-name">Name</Label>
            <Input
              id="gear-edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gear-edit-brand">Brand</Label>
            <Input
              id="gear-edit-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Radiomaster, DJI, Tattu"
            />
          </div>
          {isBattery && (
            <div className="space-y-2">
              <Label>Charging practice (per-cell voltages)</Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="gear-edit-storage-voltage"
                    className="text-xs text-muted-foreground"
                  >
                    Storage
                  </Label>
                  <Input
                    id="gear-edit-storage-voltage"
                    type="number"
                    min={0}
                    max={5}
                    step={0.01}
                    value={storageVoltage}
                    onChange={(e) => setStorageVoltage(e.target.value)}
                    placeholder={DEFAULT_STORAGE_VOLTAGE_PER_CELL.toFixed(2)}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="gear-edit-full-voltage"
                    className="text-xs text-muted-foreground"
                  >
                    Full
                  </Label>
                  <Input
                    id="gear-edit-full-voltage"
                    type="number"
                    min={0}
                    max={5}
                    step={0.01}
                    value={fullVoltage}
                    onChange={(e) => setFullVoltage(e.target.value)}
                    placeholder="optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="gear-edit-empty-voltage"
                    className="text-xs text-muted-foreground"
                  >
                    Empty
                  </Label>
                  <Input
                    id="gear-edit-empty-voltage"
                    type="number"
                    min={0}
                    max={5}
                    step={0.01}
                    value={emptyVoltage}
                    onChange={(e) => setEmptyVoltage(e.target.value)}
                    placeholder="optional"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use the assumed default. Custom values (or a
                custom storage voltage) unlock the Charging Practice card.
              </p>
            </div>
          )}
          <div className={isBattery ? "space-y-2" : "grid grid-cols-2 gap-3"}>
            {!isBattery && (
              <div className="space-y-2">
                <Label htmlFor="gear-edit-interval">
                  Service interval (min)
                </Label>
                <Input
                  id="gear-edit-interval"
                  type="number"
                  min={0}
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  placeholder="0 = as needed"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="gear-edit-cost">Purchase cost ($)</Label>
              <Input
                id="gear-edit-cost"
                type="number"
                min={0}
                step={0.01}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || isMutating}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
