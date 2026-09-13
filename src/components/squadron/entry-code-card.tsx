/**
 * EntryCodeCard — squad invite-code display, copy and regeneration.
 * Regeneration goes through the create_team_invite_code RPC
 * (owner/manager enforced server-side) and invalidates the manage
 * details query so the fresh code appears.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface InviteCode {
  code: string;
  expires_at: string;
  created_at?: string;
}

export function EntryCodeCard({
  squadronId,
  inviteCode,
}: {
  squadronId: string;
  inviteCode: InviteCode | null;
}) {
  const queryClient = useQueryClient();
  const [copiedCode, setCopiedCode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success("Invite code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleGenerateNewCode = async () => {
    setIsGenerating(true);
    try {
      const { error } = await supabase.rpc("create_team_invite_code", {
        _team_id: squadronId,
      });

      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: ["squadron-manage-details", squadronId],
      });
    } catch (err: any) {
      console.error("Failed to generate invite code:", err);
      toast.error(err?.message || "Failed to generate new invite code.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="hud-panel p-6">
      <h2 className="text-base font-bold mb-3 flex items-center gap-2 justify-between">
        <span className="flex items-center gap-2">
          <span className="text-primary">⌁</span> Squad Entry Code
        </span>
        <Button
          variant="outline"
          size="icon"
          title="Regenerate Invite Code"
          aria-label="Regenerate Invite Code"
          onClick={handleGenerateNewCode}
          disabled={isGenerating}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw
            className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`}
          />
        </Button>
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Share this invite code with fellow FPV pilots to grant them instant
        access to this Squadron HQ. Generating a new code invalidates
        previous codes.
      </p>
      {inviteCode ? (
        <div className="space-y-3">
          <div className="p-3 bg-card rounded-lg border border-primary/30 flex items-center justify-between font-mono text-lg font-bold tracking-widest text-primary text-center">
            <span className="flex-1">{inviteCode.code}</span>
            <Button
              size="icon"
              variant="ghost"
              title="Copy Invite Code"
              onClick={() => handleCopyCode(inviteCode.code)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              {copiedCode ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Expires: {new Date(inviteCode.expires_at).toLocaleDateString()}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No active invite code generated.
        </p>
      )}
    </div>
  );
}
