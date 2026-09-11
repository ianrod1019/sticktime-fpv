import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ShieldAlert,
  Key,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SquadronLeaveDeleteModal } from "@/components/squadron/SquadronLeaveDeleteModal";

export const Route = createFileRoute("/_authenticated/squadron/manage/$uuid")({
  head: () => ({ meta: [{ title: `Squadron Management — StickTime FPV` }] }),
  component: SquadronManagePage,
});

function SquadronManagePage() {
  const { uuid: squadronId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copiedCode, setCopiedCode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, callsign")
        .eq("id", user!.id)
        .single();
      return data;
    },
  });

  // Strict role check: Must be owner or manager
  const {
    data: squadData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["squadron-manage-details", squadronId, user?.id],
    enabled: !!user?.id && !!squadronId,
    queryFn: async () => {
      const teamRes = await supabase
        .from("teams")
        .select("id, name, description, owner_id")
        .eq("id", squadronId)
        .single();

      if (teamRes.error) throw new Error("Squadron not found.");

      const memberRes = await supabase
        .from("team_members")
        .select("team_role")
        .eq("team_id", squadronId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!memberRes.data) {
        throw new Error("Unauthorized: You are not a member of this squadron.");
      }

      const role = memberRes.data.team_role;
      const isOwner = role === "owner" || teamRes.data.owner_id === user!.id;
      const isManager = role === "manager";

      if (!isOwner && !isManager) {
        throw new Error(
          "Access Denied: Only squadron managers and owners can access management controls.",
        );
      }

      // Fetch invite codes
      const codesRes = await supabase
        .from("team_invite_codes")
        .select("code, expires_at, created_at")
        .eq("team_id", squadronId)
        .order("created_at", { ascending: false })
        .limit(1);

      return {
        team: teamRes.data,
        isOwner,
        inviteCode: codesRes.data?.[0] || null,
      };
    },
  });

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

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground font-mono animate-pulse">
        Verifying managerial clearance...
      </div>
    );
  }

  if (error || !squadData) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 hud-panel text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          {error?.message ||
            "You do not have manager clearance for this squadron."}
        </p>
        <Button
          onClick={() =>
            navigate({ to: "/squadron/$squadronId", params: { squadronId } })
          }
          className="w-full gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Squad HQ
        </Button>
      </div>
    );
  }

  const { team, isOwner, inviteCode } = squadData;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigate({ to: "/squadron/$squadronId", params: { squadronId } })
          }
          className="text-muted-foreground hover:text-foreground gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Squad HQ
        </Button>
      </div>

      <PageHeader
        title={`Manage: ${team.name}`}
        subtitle="Squadron entry code controls and operational administrative settings."
      />

      <div className="grid gap-6 md:grid-cols-2 mt-6 max-w-4xl">
        {/* Entry Code Management */}
        <div className="hud-panel p-6">
          <h2 className="text-base font-bold mb-3 flex items-center gap-2 justify-between">
            <span className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" /> Squad Entry Code
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

        {/* Squadron Controls */}
        <div className="hud-panel p-6 border-destructive/30 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold mb-3 text-destructive flex items-center gap-2">
              Squadron Controls
            </h2>
            <p className="text-xs text-muted-foreground mb-6">
              {isOwner
                ? "As squad owner, you can manage team permissions or dissolve the squadron permanently."
                : "You can leave this squadron at any time."}
            </p>
          </div>
          {user && (
            <SquadronLeaveDeleteModal
              squadronId={squadronId}
              squadronName={team.name}
              isOwner={isOwner}
              userId={user.id}
              userCallsignOrName={
                profile?.callsign ||
                profile?.display_name ||
                user.email ||
                "Pilot"
              }
            />
          )}
        </div>
      </div>
    </>
  );
}
