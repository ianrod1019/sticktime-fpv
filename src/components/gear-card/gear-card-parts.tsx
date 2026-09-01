import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Plus, Check, X, Trash2 } from "lucide-react";
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
import { GearItem, GearPart, CONTROLLER_CATEGORIES, GOGGLES_CATEGORIES } from "./types";

interface GearCardPartsProps {
  gear: GearItem;
  parts: GearPart[];
  isTransmitter: boolean;
  isGoggles: boolean;
  isDeleting: boolean;
  onAddPart: (gearId: string, partName: string, category: string, description: string) => void;
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

  const [confirmingPartId, setConfirmingPartId] = useState<string | null>(null);
  const [deletingPartId, setDeletingPartId] = useState<string | null>(null);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const partTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (partTimeoutRef.current) clearTimeout(partTimeoutRef.current);
    };
  }, []);

  const handleStartPartDeletePrompt = (e: React.MouseEvent, partId: string) => {
    e.stopPropagation();
    if (confirmingPartId === partId) return;
    setConfirmingPartId(partId);
    setHoveredPartId(partId);

    if (partTimeoutRef.current) clearTimeout(partTimeoutRef.current);
    partTimeoutRef.current = setTimeout(() => {
      setConfirmingPartId(null);
      setHoveredPartId(null);
    }, 3500);
  };

  const handleCancelPartDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (partTimeoutRef.current) clearTimeout(partTimeoutRef.current);
    setConfirmingPartId(null);
    setHoveredPartId(null);
  };

  const handleExecutePartDelete = (e: React.MouseEvent, partId: string) => {
    e.stopPropagation();
    if (partTimeoutRef.current) clearTimeout(partTimeoutRef.current);
    setDeletingPartId(partId);
    setHoveredPartId(partId);
    setTimeout(() => {
      onRemovePart(partId);
      setConfirmingPartId(null);
      setDeletingPartId(null);
      setHoveredPartId(null);
    }, 350);
  };

  const sectionLabel = isTransmitter
    ? "Upgrades"
    : isGoggles
    ? "Modules & Upgrades"
    : "Components";

  return (
    <div className="mt-4 pt-3 border-t border-orange-500/10">
      <div className="flex items-center justify-between mb-2">
        <div
          className="flex items-center gap-1.5 cursor-pointer select-none"
          onClick={() => setIsUpgradesCollapsed(!isUpgradesCollapsed)}
        >
          <span className="text-[11px] font-mono font-medium tracking-wider uppercase flex items-center gap-1 text-orange-400">
            {sectionLabel} ({parts.length})
            {isUpgradesCollapsed ? (
              <ChevronDown className="h-3 w-3 inline" />
            ) : (
              <ChevronUp className="h-3 w-3 inline" />
            )}
          </span>
        </div>

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
              className="h-6 px-2 text-[11px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
            >
              <Plus className="mr-0.5 h-3 w-3" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent className="border-orange-500/30 bg-background/95 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground font-display">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
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
                        const found = CONTROLLER_CATEGORIES.find((c) => c.value === val);
                        if (found) setPartName(found.label);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTROLLER_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            <span className="text-orange-500 font-medium mr-1.5">▪</span>
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
                        CONTROLLER_CATEGORIES.find((c) => c.value === partCategory)?.placeholder ||
                        "e.g. CNC Aluminum V2 Ends"
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
                        const found = GOGGLES_CATEGORIES.find((c) => c.value === val);
                        if (found) setPartName(found.label);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GOGGLES_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            <span className="text-orange-500 font-medium mr-1.5">▪</span>
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
                        GOGGLES_CATEGORIES.find((c) => c.value === partCategory)?.placeholder ||
                        "e.g. RapidFire Analog Module"
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
                className="bg-orange-500 hover:bg-orange-600 text-white w-full sm:w-auto"
              >
                {isTransmitter || isGoggles ? "Save upgrade" : "Track part"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div
        style={{
          transition: "max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
          maxHeight: isUpgradesCollapsed ? "0px" : "250px",
          opacity: isUpgradesCollapsed ? 0 : 1,
        }}
      >
        {parts.length > 0 ? (
          <div className="space-y-1.5 pt-1 pr-1 max-h-[110px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-secondary/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-orange-500/50 hover:[&::-webkit-scrollbar-thumb]:bg-orange-500">
            {parts.map((p) => {
              const isCustomMeta = isTransmitter || isGoggles;
              const isPartConfirming = confirmingPartId === p.id;
              const isPartDeleting = deletingPartId === p.id;
              const isPartHovered = hoveredPartId === p.id;
              const isPartActiveHighlight = isPartConfirming || isPartHovered || isPartDeleting;

              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs transition-all duration-300 ${
                    isPartDeleting
                      ? "opacity-0 scale-95 translate-x-2 pointer-events-none"
                      : isPartActiveHighlight
                      ? "bg-card/90 border-red-500/60 shadow-sm shadow-red-500/10 animate-subtle-shake ring-1 ring-red-500/40"
                      : "bg-secondary/30 border-orange-500/10"
                  }`}
                >
                  <div className="min-w-0 flex-1 truncate">
                    <div className="flex items-center gap-1.5">
                      {isCustomMeta && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] uppercase font-mono px-1 py-0 ${
                            isPartActiveHighlight
                              ? "border-red-500/30 text-red-400 bg-red-500/10"
                              : "border-orange-500/30 text-orange-400"
                          }`}
                        >
                          {p.category}
                        </Badge>
                      )}
                      <span
                        className={`truncate font-medium ${
                          isPartActiveHighlight ? "text-red-400" : "text-foreground"
                        }`}
                      >
                        {p.name}
                      </span>
                    </div>
                  </div>

                  {isPartConfirming ? (
                    <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/40 rounded px-1 py-0.5 animate-in fade-in zoom-in-95 duration-150 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[9px] font-medium bg-red-600 text-white hover:bg-red-700 hover:text-white rounded"
                        onClick={(e) => handleExecutePartDelete(e, p.id)}
                      >
                        <Check className="h-2.5 w-2.5 mr-0.5" /> Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded"
                        onClick={handleCancelPartDelete}
                        title="Cancel"
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isDeleting}
                      onMouseEnter={() => setHoveredPartId(p.id)}
                      onMouseLeave={() => {
                        if (!isPartConfirming && !isPartDeleting) {
                          setHoveredPartId(null);
                        }
                      }}
                      onClick={(e) => handleStartPartDeletePrompt(e, p.id)}
                      aria-label="Remove part"
                      className="h-6 w-6 transition-all duration-200 ease-out text-muted-foreground hover:text-red-400 hover:bg-red-500/20 hover:border-red-500/40 active:scale-[0.95] shrink-0 border border-transparent"
                    >
                      <Trash2 className="h-3 w-3 text-red-500" style={{ color: "#ef4444" }} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/60 italic pt-1">
            No components added yet.
          </p>
        )}
      </div>
    </div>
  );
}
