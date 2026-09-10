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
  onUpdateGear: (
    gearId: string,
    name: string,
    brand: string,
    serviceInterval: number,
    packCount: number,
    cells: number,
    connectorType: string,
    purchaseCost: number,
    currentValue: number,
  ) => void;
  isDeleting: boolean;
}

const PRESET_CONNECTORS = [
  "XT30",
  "XT60",
  "XT90",
  "PH2.0",
  "BT2.0",
  "BT3.0",
  "XN69",
  "A30",
];

export function GearCardEditDialog({
  gear,
  onUpdateGear,
  isDeleting,
}: GearCardEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(gear.name);
  const [brand, setBrand] = useState(gear.brand || "");
  const [serviceMode, setServiceMode] = useState<"interval" | "needed">(
    gear.service_interval_minutes >= 999999 ||
      gear.service_interval_minutes <= 0
      ? "needed"
      : "interval",
  );
  const [interval, setIntervalMinutes] = useState(
    gear.service_interval_minutes > 0 && gear.service_interval_minutes < 999999
      ? gear.service_interval_minutes
      : 600,
  );
  const [packCount, setPackCount] = useState(gear.pack_count || 4);
  const [cells, setCells] = useState<number>(gear.cells || 4);
  const [purchaseCost, setPurchaseCost] = useState<number>(
    gear.purchase_cost ?? 0,
  );
  const [currentValue, setCurrentValue] = useState<number>(
    gear.current_value ?? gear.purchase_cost ?? 0,
  );

  const initialConn = gear.connector_type || "XT60";
  const isInitialPreset = PRESET_CONNECTORS.includes(initialConn);
  const [connectorType, setConnectorType] = useState<string>(
    isInitialPreset ? initialConn : "XT60",
  );

  // Synchronize internal state whenever gear prop changes or dialog re-opens
  useEffect(() => {
    if (open) {
      setName(gear.name);
      setBrand(gear.brand || "");
      const isAsNeeded =
        gear.service_interval_minutes >= 999999 ||
        gear.service_interval_minutes <= 0;
      setServiceMode(isAsNeeded ? "needed" : "interval");
      setIntervalMinutes(
        !isAsNeeded && gear.service_interval_minutes > 0
          ? gear.service_interval_minutes
          : 600,
      );
      setPackCount(gear.pack_count || 4);
      setCells(gear.cells || (gear.gear_type === "battery" ? 6 : 4));
      setPurchaseCost(gear.purchase_cost ?? 0);
      setCurrentValue(gear.current_value ?? gear.purchase_cost ?? 0);

      const conn = gear.connector_type || "XT60";
      if (PRESET_CONNECTORS.includes(conn)) {
        setConnectorType(conn);
      } else {
        setConnectorType("XT60");
      }
    }
  }, [open, gear]);

  const isBattery = gear.gear_type === "battery";
  const isQuad = gear.gear_type === "quad";
  const showCellsAndConnector = isBattery || isQuad;

  const handleSave = () => {
    if (!name.trim()) return;
    const finalInterval = isBattery || serviceMode === "needed" ? 0 : interval;
    const finalPackCount = isBattery ? packCount : gear.pack_count || 0;
    const finalCells = showCellsAndConnector ? cells : 0;
    const finalConnector = showCellsAndConnector ? connectorType : "";

    onUpdateGear(
      gear.id,
      name.trim(),
      brand.trim(),
      finalInterval,
      finalPackCount,
      finalCells,
      finalConnector,
      purchaseCost,
      currentValue,
    );
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 transition-all duration-200 ease-out text-muted-foreground hover:text-primary hover:bg-primary/20 hover:border-primary/40 active:scale-[0.95] border border-transparent"
          aria-label={`Edit ${gear.name}`}
          disabled={isDeleting}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="border-primary/30 bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-display">
            <span className="w-2 h-2 rounded-full bg-primary"></span> Edit
            Equipment
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
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
            <Label htmlFor={`edit-brand-${gear.id}`}>
              Brand / Manufacturer
            </Label>
            <Input
              id={`edit-brand-${gear.id}`}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. CNHL, Tattu, Radiomaster, DJI"
            />
          </div>

          {showCellsAndConnector && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`edit-cells-${gear.id}`}>
                    Cell Count (S)
                  </Label>
                  <Select
                    value={String(cells)}
                    onValueChange={(v) => setCells(Number(v))}
                  >
                    <SelectTrigger id={`edit-cells-${gear.id}`}>
                      <SelectValue placeholder="Cells" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1S</SelectItem>
                      <SelectItem value="2">2S</SelectItem>
                      <SelectItem value="3">3S</SelectItem>
                      <SelectItem value="4">4S</SelectItem>
                      <SelectItem value="5">5S</SelectItem>
                      <SelectItem value="6">6S</SelectItem>
                      <SelectItem value="8">8S</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`edit-connector-${gear.id}`}>Connector</Label>
                  <Select
                    value={connectorType}
                    onValueChange={setConnectorType}
                  >
                    <SelectTrigger id={`edit-connector-${gear.id}`}>
                      <SelectValue placeholder="Connector" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="XT30">XT30</SelectItem>
                      <SelectItem value="XT60">XT60</SelectItem>
                      <SelectItem value="XT90">XT90</SelectItem>
                      <SelectItem value="PH2.0">PH2.0</SelectItem>
                      <SelectItem value="BT2.0">BT2.0</SelectItem>
                      <SelectItem value="BT3.0">BT3.0</SelectItem>
                      <SelectItem value="XN69">XN69</SelectItem>
                      <SelectItem value="A30">A30</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {isBattery ? (
            <div className="space-y-2">
              <Label htmlFor={`edit-packs-${gear.id}`}>
                Packs in this Battery Set
              </Label>
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
                  onValueChange={(v) =>
                    setServiceMode(v as "interval" | "needed")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interval">
                      Custom service interval (minutes)
                    </SelectItem>
                    <SelectItem value="needed">
                      Service as needed (no fixed schedule)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {serviceMode === "interval" && (
                <div className="space-y-2">
                  <Label htmlFor={`edit-interval-${gear.id}`}>
                    Service interval (minutes)
                  </Label>
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

          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold">
                Cost Tracking (Pro Feature)
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`edit-purchase-cost-${gear.id}`}>
                  Purchase Cost ($)
                </Label>
                <Input
                  id={`edit-purchase-cost-${gear.id}`}
                  type="number"
                  min={0}
                  step={0.01}
                  value={String(purchaseCost)}
                  onChange={(e) => setPurchaseCost(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`edit-current-value-${gear.id}`}>
                  Current Value ($)
                </Label>
                <Input
                  id={`edit-current-value-${gear.id}`}
                  type="number"
                  min={0}
                  step={0.01}
                  value={String(currentValue)}
                  onChange={(e) => setCurrentValue(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            className="bg-primary hover:bg-primary/80 text-primary-foreground w-full sm:w-auto"
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
