import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GearItem } from "./types";

interface GearCardEditDialogProps {
  gear: GearItem;
  onUpdateGear: (gearId: string, name: string, brand: string, serviceInterval: number, packCount: number) => void;
  isDeleting: boolean;
}

export function GearCardEditDialog({ gear, onUpdateGear, isDeleting }: GearCardEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(gear.name);
  const [brand, setBrand] = useState(gear.brand || "");
  const [serviceMode, setServiceMode] = useState<"interval" | "needed">(
    gear.service_interval_minutes >= 999999 || gear.service_interval_minutes <= 0 ? "needed" : "interval"
  );
  const [interval, setIntervalMinutes] = useState(
    gear.service_interval_minutes > 0 && gear.service_interval_minutes < 999999 ? gear.service_interval_minutes : 600
  );
  const [packCount, setPackCount] = useState(gear.pack_count || 4);

  // Synchronize internal state whenever gear prop changes or dialog re-opens
  useEffect(() => {
    if (open) {
      setName(gear.name);
      setBrand(gear.brand || "");
      const isAsNeeded = gear.service_interval_minutes >= 999999 || gear.service_interval_minutes <= 0;
      setServiceMode(isAsNeeded ? "needed" : "interval");
      setIntervalMinutes(
        !isAsNeeded && gear.service_interval_minutes > 0 ? gear.service_interval_minutes : 600
      );
      setPackCount(gear.pack_count || 4);
    }
  }, [open, gear]);

  const isBattery = gear.gear_type === "battery";

  const handleSave = () => {
    if (!name.trim()) return;
    const finalInterval = isBattery || serviceMode === "needed" ? 9999999 : interval;
    const finalPackCount = isBattery ? packCount : gear.pack_count || 0;
    
    onUpdateGear(gear.id, name.trim(), brand.trim(), finalInterval, finalPackCount);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 transition-all duration-200 ease-out text-muted-foreground hover:text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/40 active:scale-[0.95] border border-transparent"
          aria-label={`Edit ${gear.name}`}
          disabled={isDeleting}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="border-orange-500/30 bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-display">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span> Edit Equipment
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor={`edit-name-${gear.id}`}>Name</Label>
            <Input
              id={`edit-name-${gear.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Equipment name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-brand-${gear.id}`}>Brand / Manufacturer</Label>
            <Input
              id={`edit-brand-${gear.id}`}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. CNHL, Tattu, Radiomaster, DJI"
            />
          </div>

          {isBattery ? (
            <div className="space-y-2">
              <Label htmlFor={`edit-packs-${gear.id}`}>Packs in this Battery Set</Label>
              <Input
                id={`edit-packs-${gear.id}`}
                type="number"
                min={1}
                max={20}
                value={packCount}
                onChange={(e) => setPackCount(Number(e.target.value))}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Maintenance Schedule</Label>
                <Select
                  value={serviceMode}
                  onValueChange={(v) => setServiceMode(v as "interval" | "needed")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interval">Custom service interval (minutes)</SelectItem>
                    <SelectItem value="needed">Service as needed (no fixed schedule)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {serviceMode === "interval" && (
                <div className="space-y-2">
                  <Label htmlFor={`edit-interval-${gear.id}`}>Service interval (minutes)</Label>
                  <Input
                    id={`edit-interval-${gear.id}`}
                    type="number"
                    value={interval}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  />
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            className="bg-orange-500 hover:bg-orange-600 text-white w-full sm:w-auto"
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
