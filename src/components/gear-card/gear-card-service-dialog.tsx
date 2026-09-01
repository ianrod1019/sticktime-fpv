import { useState, useEffect } from "react";
import { Check, X, Wrench, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { GearItem } from "./types";

interface GearCardServiceDialogProps {
  gear: GearItem;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onService: (gearId: string, minutes: number, notes: string) => void;
  isDeleting: boolean;
}

export function GearCardServiceDialog({
  gear,
  isOpen,
  onOpenChange,
  onService,
  isDeleting,
}: GearCardServiceDialogProps) {
  const [serviceMinutes, setServiceMinutes] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [isFullReset, setIsFullReset] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setServiceMinutes(gear.service_interval_minutes.toString());
      setServiceNotes("");
      setIsFullReset(false);
    }
  }, [isOpen, gear.service_interval_minutes]);

  const handleService = () => {
    const minutes = parseInt(serviceMinutes, 10);
    if (!isNaN(minutes) && minutes > 0) {
      onService(gear.id, minutes, serviceNotes);
      onOpenChange(false);
    }
  };

  const handleFullReset = () => {
    onService(gear.id, gear.service_interval_minutes, "Full service reset");
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="border-orange-500/30 bg-background/95 backdrop-blur-xl max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-display">
            <Wrench className="h-5 w-5 text-orange-500" />
            Service {gear.name}
          </DialogTitle>
          <DialogDescription>
            Log a service interval. This will add the minutes to "minutes since last service".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="smin">Minutes to add</Label>
            <Input
              id="smin"
              type="number"
              min="1"
              value={serviceMinutes}
              onChange={(e) => setServiceMinutes(e.target.value)}
              placeholder={gear.service_interval_minutes.toString()}
              disabled={isFullReset}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="snotes">Notes (optional)</Label>
            <Input
              id="snotes"
              value={serviceNotes}
              onChange={(e) => setServiceNotes(e.target.value)}
              placeholder="e.g. Bearing replacement, frame inspection"
            />
          </div>

          <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/30 border border-orange-500/10">
            <input
              type="checkbox"
              id="full-reset"
              checked={isFullReset}
              onChange={(e) => {
                setIsFullReset(e.target.checked);
                if (e.target.checked) setServiceMinutes(gear.service_interval_minutes.toString());
              }}
              className="h-4 w-4 rounded border-orange-500 text-orange-600 focus:ring-orange-500"
            />
            <Label htmlFor="full-reset" className="text-sm cursor-pointer">
              Full service reset (set to {gear.service_interval_minutes} min)
            </Label>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2">
          <Button
            onClick={handleService}
            disabled={isDeleting || isFullReset || !serviceMinutes || parseInt(serviceMinutes, 10) <= 0}
            className="bg-orange-500 hover:bg-orange-600 text-white w-full"
          >
            {isFullReset ? "Full reset" : "Log service"}
          </Button>
          {isFullReset && (
            <Button
              variant="outline"
              onClick={() => setIsFullReset(false)}
              disabled={isDeleting}
              className="w-full"
            >
              Cancel full reset
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
