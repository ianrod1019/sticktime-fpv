import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Calendar } from "lucide-react";
import { ProfileWithEmail } from "./AdminPilotsTable";
import { toast } from "sonner";

interface BanPilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  pilot: ProfileWithEmail | null;
  onConfirmBan: (
    pilot: ProfileWithEmail,
    reason: string,
    banUntil: string | null,
  ) => void;
  isLoading?: boolean;
}

export function BanPilotModal({
  isOpen,
  onClose,
  pilot,
  onConfirmBan,
  isLoading,
}: BanPilotModalProps) {
  const [reason, setReason] = useState("");
  const [banType, setBanType] = useState<"permanent" | "temporary">(
    "permanent",
  );
  const [banUntilDate, setBanUntilDate] = useState("");

  if (!pilot) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("A mandatory ban reason is required.");
      return;
    }

    let finalBanUntil: string | null = null;
    if (banType === "temporary") {
      if (!banUntilDate) {
        toast.error(
          "Please specify a valid expiration date for temporary suspension.",
        );
        return;
      }
      finalBanUntil = new Date(banUntilDate).toISOString();
    }

    onConfirmBan(pilot, reason.trim(), finalBanUntil);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <DialogTitle className="font-mono text-lg">
                Ban Pilot: {pilot.email}
              </DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground text-xs font-mono">
              This action restricts pilot access. A mandatory reason must be
              provided and will be logged securely for administrator review
              only.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor="ban-reason"
                className="text-xs font-mono font-medium text-foreground"
              >
                Mandatory Ban Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ban-reason"
                placeholder="e.g. Violation of community safety guidelines, reckless behavior in multi-player lobbies..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="resize-none h-24 text-xs font-mono bg-background/50"
                required
              />
            </div>

            <div className="space-y-3 pt-2">
              <Label className="text-xs font-mono font-medium text-foreground">
                Ban Duration
              </Label>
              <RadioGroup
                value={banType}
                onValueChange={(v) =>
                  setBanType(v as "permanent" | "temporary")
                }
                className="flex flex-col gap-2"
              >
                <div className="flex items-center space-x-2 border border-border/60 rounded-md p-2.5 bg-background/30 hover:bg-muted/30 cursor-pointer">
                  <RadioGroupItem value="permanent" id="perm" />
                  <Label
                    htmlFor="perm"
                    className="text-xs font-mono cursor-pointer flex-1"
                  >
                    Permanent Ban (Indefinite)
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border border-border/60 rounded-md p-2.5 bg-background/30 hover:bg-muted/30 cursor-pointer">
                  <RadioGroupItem value="temporary" id="temp" />
                  <Label
                    htmlFor="temp"
                    className="text-xs font-mono cursor-pointer flex-1 flex items-center gap-2"
                  >
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                    Temporary Suspension
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {banType === "temporary" && (
              <div className="space-y-2 pt-1 pl-6">
                <Label
                  htmlFor="ban-date"
                  className="text-[11px] font-mono text-muted-foreground"
                >
                  Ban Until Date & Time
                </Label>
                <Input
                  id="ban-date"
                  type="datetime-local"
                  value={banUntilDate}
                  onChange={(e) => setBanUntilDate(e.target.value)}
                  className="text-xs font-mono h-9 bg-background/50"
                  required={banType === "temporary"}
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="text-xs font-mono"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isLoading || !reason.trim()}
              className="text-xs font-mono gap-1.5"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {isLoading ? "Processing..." : "Confirm Secure Ban"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
