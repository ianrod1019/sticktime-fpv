import { useState } from "react";
import { Wrench, ShieldAlert, AlertTriangle, Plus, Trash2, Calendar, DollarSign, Activity } from "lucide-react";
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
import { GearCardProps, CONTROLLER_CATEGORIES, GOGGLES_CATEGORIES } from "./types";
import { GearCardBatteries } from "./gear-card-batteries";
import { GearCardEditDialog } from "./gear-card-edit-dialog";

export function GearCard({
  gear,
  parts,
  logs,
  onDeleteGear,
  onAddPart,
  onRemovePart,
  onAddLog,
  onRemoveLog,
  onUpdatePackCount,
  onUpdateGear,
  isDeleting,
  isHoveredDelete,
  onHoverDelete,
}: GearCardProps & {
  onUpdateGear: (
    gearId: string,
    name: string,
    brand: string,
    serviceInterval: number,
    packCount: number,
    cells: number,
    connectorType: string
  ) => void;
}) {
  const [partOpen, setPartOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [newPartName, setNewPartName] = useState("");
  const [partCategory, setPartCategory] = useState<string>("motor");
  const [partDescription, setPartDescription] = useState("");
  const [logDesc, setLogDesc] = useState("");
  const [logCost, setLogCost] = useState("");

  const isBattery = gear.gear_type === "battery";
  const isQuad = gear.gear_type === "quad";
  const isTransmitter = gear.gear_type === "transmitter";
  const isGoggles = gear.gear_type === "goggles";
  const showCellsAndConnector = isBattery || isQuad;

  const serviceInterval = gear.service_interval_minutes || 600;
  const minutesSince = gear.minutes_since_service || 0;
  const percentUsed = isBattery || serviceInterval >= 999999 ? 0 : Math.min(100, Math.round((minutesSince / serviceInterval) * 100));
  const needsService = !isBattery && serviceInterval < 999999 && minutesSince >= serviceInterval;

  const handleAddPartSubmit = () => {
    if (!newPartName.trim()) return;
    onAddPart(gear.id, newPartName.trim(), partCategory, partDescription.trim());
    setNewPartName("");
    setPartDescription("");
    setPartOpen(false);
  };

  const handleAddLogSubmit = () => {
    if (!logDesc.trim()) return;
    onAddLog(gear.id, logDesc.trim(), logCost);
    setLogDesc("");
    setLogCost("");
    setLogOpen(false);
  };

  return (
    <div
      className={`hud-panel relative p-5 flex flex-col justify-between transition-all duration-300 bg-card/60 backdrop-blur-md border-orange-500/20 hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5 ${
        isDeleting ? "animate-subtle-shake opacity-60 pointer-events-none" : ""
      } ${needsService ? "border-amber-500/50 shadow-amber-500/10" : ""}`}
    >
      <div>
        {/* Header Badge & Actions */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-semibold">
                {gear.gear_type === "quad"
                  ? "Drone"
                  : gear.gear_type === "transmitter"
                  ? "Radio"
                  : gear.gear_type === "goggles"
                  ? "Goggles"
                  : gear.gear_type === "battery"
                  ? "Battery Set"
                  : "Other"}
              </span>
              {gear.brand && (
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-secondary/60 text-muted-foreground border border-border">
                  {gear.brand}
                </span>
              )}
              {showCellsAndConnector && gear.cells ? (
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                  {gear.cells}S
                </span>
              ) : null}
              {showCellsAndConnector && gear.connector_type ? (
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                  {gear.connector_type}
                </span>
              ) : null}
            </div>
            <h3 className="font-display font-bold text-lg text-foreground tracking-wide mt-1">
              {gear.name}
            </h3>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <GearCardEditDialog
              gear={gear}
              onUpdateGear={onUpdateGear}
              isDeleting={isDeleting}
            />
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 transition-all duration-200 ease-out border ${
                isHoveredDelete
                  ? "bg-red-500 text-white border-red-600 scale-105 shadow-md shadow-red-500/30"
                  : "text-muted-foreground hover:text-red-400 hover:bg-red-500/20 hover:border-red-500/40 border-transparent"
              }`}
              onClick={() => onDeleteGear(gear.id, gear.name)}
              onMouseEnter={() => onHoverDelete(gear.id)}
              onMouseLeave={() => onHoverDelete(null)}
              aria-label={`Delete ${gear.name}`}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Battery packs list if battery */}
        {isBattery && (
          <GearCardBatteries
            gear={gear}
            isDeleting={isDeleting}
            onUpdatePackCount={onUpdatePackCount}
          />
        )}

        {/* Maintenance / Airtime progress if not battery */}
        {!isBattery && serviceInterval < 999999 && (
          <div className="mt-4 space-y-2 pt-3 border-t border-orange-500/10">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-orange-400" /> Maintenance Health
              </span>
              <span className="font-mono font-bold text-foreground">
                {minutesSince} / {serviceInterval} min ({percentUsed}%)
              </span>
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-2 overflow-hidden border border-orange-500/20">
              <div
                className={`h-full transition-all duration-500 ${
                  needsService ? "bg-amber-500" : percentUsed > 80 ? "bg-amber-400" : "bg-orange-500"
                }`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
            {needsService && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Service recommended (interval reached)</span>
              </div>
            )}
          </div>
        )}

        {/* Total airtime stat for quads */}
        {isQuad && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground bg-secondary/30 px-3 py-1.5 rounded-md border border-orange-500/10">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-orange-400" /> Total Flight Time
            </span>
            <span className="font-mono font-semibold text-foreground">
              {gear.total_minutes || 0} mins ({Math.round((gear.total_minutes || 0) / 60 * 10) / 10} hrs)
            </span>
          </div>
        )}

        {/* Components / Upgrades section */}
        <div className="mt-4 pt-3 border-t border-orange-500/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-medium tracking-wider uppercase text-orange-400">
              {isTransmitter || isGoggles ? "Accessories & Modules" : "Installed Components"} ({parts.length})
            </span>
            <Dialog open={partOpen} onOpenChange={setPartOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                >
                  <Plus className="h-3 w-3 mr-0.5" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="border-orange-500/30 bg-background/95 backdrop-blur-xl">
                <DialogHeader>
                  <DialogTitle className="text-foreground font-display">
                    Add component to {gear.name}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {isTransmitter ? (
                    <>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select value={partCategory} onValueChange={setPartCategory}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTROLLER_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Part / Upgrade Name</Label>
                        <Input
                          value={newPartName}
                          onChange={(e) => setNewPartName(e.target.value)}
                          placeholder={
                            CONTROLLER_CATEGORIES.find((c) => c.value === partCategory)?.placeholder || "e.g. AG01"
                          }
                        />
                      </div>
                    </>
                  ) : isGoggles ? (
                    <>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select value={partCategory} onValueChange={setPartCategory}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GOGGLES_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Accessory Name</Label>
                        <Input
                          value={newPartName}
                          onChange={(e) => setNewPartName(e.target.value)}
                          placeholder={
                            GOGGLES_CATEGORIES.find((c) => c.value === partCategory)?.placeholder || "e.g. RapidFire"
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label>Component Name</Label>
                      <Input
                        value={newPartName}
                        onChange={(e) => setNewPartName(e.target.value)}
                        placeholder="e.g. T-Motor F60 Pro V"
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleAddPartSubmit}
                    disabled={!newPartName.trim()}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Add Component
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {parts.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {parts.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-secondary/50 border border-orange-500/20 text-foreground group/part"
                >
                  <span className="font-medium">{p.name}</span>
                  <button
                    onClick={() => onRemovePart(p.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors ml-0.5"
                    title="Remove component"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/60 italic">No components registered.</p>
          )}
        </div>
      </div>

      {/* Maintenance Logs footer */}
      {!isBattery && (
        <div className="mt-5 pt-3 border-t border-orange-500/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-medium tracking-wider uppercase text-orange-400">
              Maintenance History ({logs.length})
            </span>
            <Dialog open={logOpen} onOpenChange={setLogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                >
                  <Wrench className="h-3 w-3 mr-1" /> Log Service
                </Button>
              </DialogTrigger>
              <DialogContent className="border-orange-500/30 bg-background/95 backdrop-blur-xl">
                <DialogHeader>
                  <DialogTitle className="text-foreground font-display">
                    Log Maintenance for {gear.name}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Service Description</Label>
                    <Input
                      value={logDesc}
                      onChange={(e) => setLogDesc(e.target.value)}
                      placeholder="e.g. Replaced arm, soldered new ESC, swapped props"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cost ($ optional)</Label>
                    <Input
                      type="number"
                      value={logCost}
                      onChange={(e) => setLogCost(e.target.value)}
                      placeholder="e.g. 24.99"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Logging service will automatically reset the maintenance service clock back to 0.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleAddLogSubmit}
                    disabled={!logDesc.trim()}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Save & Reset Clock
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {logs.length > 0 ? (
            <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
              {logs.slice(0, 3).map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between text-xs bg-secondary/30 px-2.5 py-1.5 rounded border border-orange-500/10"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-medium text-foreground truncate">{l.description}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-0.5">
                        <Calendar className="h-2.5 w-2.5" /> {new Date(l.performed_on).toLocaleDateString()}
                      </span>
                      {l.cost ? (
                        <span className="flex items-center gap-0.5 text-emerald-400 font-mono">
                          <DollarSign className="h-2.5 w-2.5" /> {l.cost.toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveLog(l.id)}
                    className="text-muted-foreground hover:text-red-400 p-1 shrink-0"
                    title="Remove log"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/60 italic">No service logs recorded.</p>
          )}
        </div>
      )}
    </div>
  );
}
