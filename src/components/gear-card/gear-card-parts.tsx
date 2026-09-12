import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  GearItem,
  GearPart,
  CONTROLLER_CATEGORIES,
  GOGGLES_CATEGORIES,
} from "./types";

interface GearCardPartsProps {
  gear: GearItem;
  parts: GearPart[];
  isTransmitter: boolean;
  isGoggles: boolean;
  isDeleting: boolean;
  onAddPart: (
    gearId: string,
    partName: string,
    category: string,
    description: string,
  ) => void;
  onRemovePart: (partId: string) => void;
}

export function GearCardParts({
  gear,
  parts,
  isTransmitter,
  isGoggles,
  isDeleting,
  onAddPart,
  onRemovePart,
}: GearCardPartsProps) {
  const [partOpen, setPartOpen] = useState(false);
  const [partName, setPartName] = useState("");
  const [partCategory, setPartCategory] = useState<string>("stickends");
  const [partDescription, setPartDescription] = useState("");
  const [isUpgradesCollapsed, setIsUpgradesCollapsed] = useState(false);

  const sectionLabel = isTransmitter
    ? "Upgrades"
    : isGoggles
      ? "Modules & Upgrades"
      : "Components";

  return (
    <div className="pt-3 border-t border-primary/10">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          className="flex items-center gap-1.5 cursor-pointer select-none text-left"
          onClick={() => setIsUpgradesCollapsed(!isUpgradesCollapsed)}
          aria-expanded={!isUpgradesCollapsed}
        >
          <span className="text-[11px] font-mono font-medium tracking-wider uppercase flex items-center gap-1 text-primary">
            {sectionLabel} ({parts.length})
            {isUpgradesCollapsed ? (
              <ChevronDown className="h-3 w-3 inline" aria-hidden />
            ) : (
              <ChevronUp className="h-3 w-3 inline" aria-hidden />
            )}
          </span>
        </button>

        <Dialog
          open={partOpen}
          onOpenChange={(o) => {
            setPartOpen(o);
            if (isTransmitter && o) {
              setPartName("Stick Ends");
              setPartDescription("");
              setPartCategory("stickends");
            } else if (isGoggles && o) {
              setPartName("Receiver Module");
              setPartDescription("");
              setPartCategory("receiver");
            } else if (!isTransmitter && !isGoggles && o) {
              setPartName("");
              setPartCategory("motor");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isDeleting}
              className="h-6 px-2 text-[11px] text-primary hover:text-primary/80 hover:bg-primary/10"
            >
              <Plus className="mr-0.5 h-3 w-3" aria-hidden /> Add
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/30 bg-background/95">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground font-display">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                {isTransmitter
                  ? "Add controller upgrade"
                  : isGoggles
                    ? "Add goggle module or upgrade"
                    : "Track a component"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {isTransmitter ? (
                <>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={partCategory}
                      onValueChange={(val) => {
                        setPartCategory(val);
                        const found = CONTROLLER_CATEGORIES.find(
                          (c) => c.value === val,
                        );
                        if (found) setPartName(found.label);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTROLLER_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pname">Name</Label>
                    <Input
                      id="pname"
                      value={partName}
                      onChange={(e) => setPartName(e.target.value)}
                      placeholder="e.g. Stick Ends"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pdesc">Description</Label>
                    <Input
                      id="pdesc"
                      value={partDescription}
                      onChange={(e) => setPartDescription(e.target.value)}
                      placeholder={
                        CONTROLLER_CATEGORIES.find(
                          (c) => c.value === partCategory,
                        )?.placeholder || "e.g. CNC Aluminum V2 Ends"
                      }
                    />
                  </div>
                </>
              ) : isGoggles ? (
                <>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={partCategory}
                      onValueChange={(val) => {
                        setPartCategory(val);
                        const found = GOGGLES_CATEGORIES.find(
                          (c) => c.value === val,
                        );
                        if (found) setPartName(found.label);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GOGGLES_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pname">Name</Label>
                    <Input
                      id="pname"
                      value={partName}
                      onChange={(e) => setPartName(e.target.value)}
                      placeholder="e.g. Receiver Module"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pdesc">Description / Model</Label>
                    <Input
                      id="pdesc"
                      value={partDescription}
                      onChange={(e) => setPartDescription(e.target.value)}
                      placeholder={
                        GOGGLES_CATEGORIES.find((c) => c.value === partCategory)
                          ?.placeholder || "e.g. RapidFire Analog Module"
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pname">Name</Label>
                    <Input
                      id="pname"
                      value={partName}
                      onChange={(e) => setPartName(e.target.value)}
                      placeholder="e.g. Rear-left motor"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pcat">Category</Label>
                    <Input
                      id="pcat"
                      value={partCategory}
                      onChange={(e) => setPartCategory(e.target.value)}
                      placeholder="motor / prop / VTX"
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  onAddPart(gear.id, partName, partCategory, partDescription);
                  setPartOpen(false);
                  setPartName("");
                  setPartDescription("");
                }}
                disabled={!partName}
                className="bg-primary hover:bg-primary/80 text-primary-foreground w-full sm:w-auto"
              >
                {isTransmitter || isGoggles ? "Save upgrade" : "Track part"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          isUpgradesCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          {parts.length > 0 ? (
            <div className="space-y-1.5 pt-1 pr-1 max-h-[250px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-secondary/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/50 hover:[&::-webkit-scrollbar-thumb]:bg-primary">
              {parts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs bg-secondary/30 border-primary/10"
                >
                  <div className="min-w-0 flex-1 truncate">
                    <div className="flex items-center gap-1.5">
                      {(isTransmitter || isGoggles) && (
                        <Badge
                          variant="outline"
                          className="text-[9px] uppercase font-mono px-1 py-0 border-primary/30 text-primary"
                        >
                          {p.category}
                        </Badge>
                      )}
                      <span className="truncate font-medium text-foreground">
                        {p.name}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isDeleting}
                    onClick={() => onRemovePart(p.id)}
                    aria-label={`Remove ${p.name}`}
                    className="h-6 w-6 transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/20 shrink-0"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/60 italic pt-1">
              No components added yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
