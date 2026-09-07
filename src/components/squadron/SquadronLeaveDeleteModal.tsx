import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, Trash2, AlertTriangle } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface SquadronLeaveDeleteModalProps {
  squadronId: string;
  squadronName: string;
  isOwner: boolean;
  userId: string;
  userCallsignOrName: string;
}

export function SquadronLeaveDeleteModal({
  squadronId,
  squadronName,
  isOwner,
  userId,
  userCallsignOrName,
}: SquadronLeaveDeleteModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async () => {
    setIsLoading(true);
    try {
      if (isOwner) {
        if (confirmText.trim() !== squadronName.trim()) {
          toast.error("Squadron name does not match. Confirmation cancelled.");
          setIsLoading(false);
          return;
        }

        console.log("Invoking dissolve_squadron RPC for team ID:", squadronId);

        const { error } = await supabase.rpc("dissolve_squadron", {
          _team_id: squadronId,
        });

        if (error) {
          console.error("Failed to dissolve squadron:", error);
          throw new Error(error.message || "Failed to dissolve squadron.");
        }

        toast.success(`Squadron "${squadronName}" has been permanently dissolved.`);
      } else {
        console.log("Invoking leave_squadron RPC for team ID:", squadronId);

        const { error } = await supabase.rpc("leave_squadron", {
          _team_id: squadronId,
        });

        if (error) {
          console.error("Failed to leave squadron:", error);
          throw new Error(error.message || "Failed to leave squadron.");
        }

        toast.success("Successfully left the squadron.");
      }

      // Invalidate queries so the portal updates immediately
      await queryClient.invalidateQueries({ queryKey: ["user-squadrons"] });
      await queryClient.invalidateQueries({ queryKey: ["squadron-hq-details", squadronId] });

      setOpen(false);
      navigate({ to: "/squadron" });
    } catch (err: any) {
      console.error("Squadron action error:", err);
      toast.error(err?.message || "Failed to process request.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isOwner ? (
          <Button variant="destructive" size="sm" className="w-full gap-2">
            <Trash2 className="h-4 w-4" /> Dissolve Squadron
          </Button>
        ) : (
          <Button variant="destructive" size="sm" className="w-full gap-2">
            <LogOut className="h-4 w-4" /> Leave Squadron
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {isOwner ? "Dissolve Squadron HQ?" : "Leave Squadron?"}
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm">
            {isOwner ? (
              <>
                You are about to permanently delete <span className="font-semibold text-foreground">{squadronName}</span> and remove all member associations. This action cannot be undone.
              </>
            ) : (
              <>
                You will lose access to shared telemetry logs and hangar equipment for <span className="font-semibold text-foreground">{squadronName}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="space-y-3 py-3">
            <Label htmlFor="confirm-name" className="text-xs text-muted-foreground">
              To confirm, type the squadron name <span className="font-mono text-foreground font-bold">{squadronName}</span> below:
            </Label>
            <Input
              id="confirm-name"
              placeholder={squadronName}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        )}

        <DialogFooter className="sm:justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleAction}
            disabled={isLoading || (isOwner && confirmText.trim() !== squadronName.trim())}
          >
            {isLoading ? "Processing..." : isOwner ? "Dissolve Squadron" : "Leave Squadron"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
