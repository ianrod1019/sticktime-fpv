import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PackagePlus, Wrench } from "lucide-react";
import type { GearItem, ServiceInput } from "@/hooks/gear-item";

interface GearServiceDialogProps {
  item: GearItem;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onService: (input: ServiceInput) => void;
  /** False for gear types without a parts table (battery/drone). */
  canAddPart: boolean;
  isMutating: boolean;
}

/** Categories matching the per-gear parts tables used by Installed Parts. */
const PART_CATEGORIES = [
  "gimbals",
  "stickends",
  "screen",
  "switches",
  "module",
  "battery",
  "receiver",
  "antenna",
  "foam",
  "diopter",
  "strap",
  "other",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  gimbals: "Gimbals",
  stickends: "Stick ends",
  screen: "Screen",
  switches: "Switches",
  module: "Module",
  battery: "Battery",
  receiver: "Receiver",
  antenna: "Antenna",
  foam: "Foam",
  diopter: "Diopter",
  strap: "Strap",
  other: "Other",
};

export function GearServiceDialog({
  item,
  isOpen,
  onOpenChange,
  onService,
  canAddPart,
  isMutating,
}: GearServiceDialogProps) {
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [addPart, setAddPart] = useState(false);
  const [partName, setPartName] = useState("");
  const [partCategory, setPartCategory] = useState("other");

  useEffect(() => {
    if (isOpen) {
      setDescription("");
      setCost("");
      setAddPart(false);
      setPartName("");
      setPartCategory("other");
    }
  }, [isOpen]);

  const parsedCost = Math.max(0, Number(cost) || 0);
  const isValid = description.trim().length > 0;
  const partValid = !addPart || partName.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid || !partValid) return;
    onService({
      cost: parsedCost,
      description: description.trim(),
      part:
        addPart && partName.trim()
          ? { name: partName.trim(), category: partCategory }
          : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/30 bg-background/95 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-foreground">
            <Wrench className="h-5 w-5 text-primary" aria-hidden />
            Service {item.name}
          </DialogTitle>
          <DialogDescription>
            Log a completed service. This resets the minutes-since-service clock
            to zero.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="gear-service-description">What was serviced</Label>
            <Input
              id="gear-service-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. new gimbals, replaced antenna"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gear-service-cost">Cost ($)</Label>
            <Input
              id="gear-service-cost"
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {canAddPart && (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                <Checkbox
                  checked={addPart}
                  onCheckedChange={(v) => setAddPart(v === true)}
                  aria-label="Also add an inventory item"
                />
                <PackagePlus className="h-4 w-4 text-primary" aria-hidden />
                Add an inventory item
              </label>
              {addPart && (
                <div className="space-y-2">
                  <Input
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                    placeholder="Part name, e.g. AG02 Hall Gimbal"
                    aria-label="Part name"
                  />
                  <Select
                    value={partCategory}
                    onValueChange={(v) => setPartCategory(v)}
                  >
                    <SelectTrigger aria-label="Part category">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {PART_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || !partValid || isMutating}
            className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
          >
            Log service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
