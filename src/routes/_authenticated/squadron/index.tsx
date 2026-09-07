import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Key, Radio, Shield, ExternalLink, Trash2, Calendar, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/squadron/")({
  head: () => ({ meta: [{ title: `Squadron Portal — StickTime FPV` }] }),
  component: SquadronPortalPage,
});

function SquadronPortalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newSquadName, setNewSquadName] = useState("");
  const [newSquadDesc, setNewSquadDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: squadrons = [], isLoading } = useQuery({
    queryKey: ["user-squadrons", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: memberships, error: memberError } = await supabase
        .from("team_members")
        .select("team_id, team_role, joined_at")
        .eq("user_id", user!.id);

      if (memberError) throw memberError;
      if (!memberships || memberships.length === 0) return [];

      const teamIds = memberships.map((m) => m.team_id);
      const { data: teams, error: teamsError } = await supabase
        .from("teams")
        .select("*")
        .in("id", teamIds);

      if (teamsError) throw teamsError;

      return teams.map((team) => {
        const membership = memberships.find((m) => m.team_id === team.id);
        return {
          ...team,
          userRole: membership?.team_role || "member",
          joinedAt: membership?.joined_at,
        };
      });
    },
  });

  const createSquadronMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const { data, error } = await supabase.rpc("create_team_with_owner", {
        team_name: name,
        team_desc: description,
      });

      if (error) {
        // Fallback manual insert if RPC fails
        const teamRes = await supabase
          .from("teams")
          .insert([{ name, description, owner_id: user!.id }])
          .select()
          .single();
        if (teamRes.error) throw teamRes.error;
        
        await supabase.from("team_members").insert([
          { team_id: teamRes.data.id, user_id: user!.id, team_role: "owner" }
        ]);
        return teamRes.data;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-squadrons"] });
      toast.success("Squadron established successfully!");
      setShowCreateModal(false);
      setNewSquadName("");
      setNewSquadDesc("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create squadron.");
    },
  });

  const joinSquadronMutation = useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc("join_team_with_code", {
        invite_code_input: code.trim().toUpperCase(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-squadrons"] });
      toast.success("Successfully joined squadron!");
      setShowJoinModal(false);
      setJoinCode("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Invalid or expired invite code.");
    },
  });

  return (
    <>
      <PageHeader
        title="Squadron Portal"
        subtitle="Collaborate with pilots, share telemetry logs, and manage fleet gear together."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowJoinModal(true)} className="gap-2">
              <Key className="h-4 w-4" /> Join via Code
            </Button>
            <Button size="sm" onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Establish Squadron
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="p-12 text-center font-mono text-muted-foreground animate-pulse">
          Scanning frequencies for assigned squadrons...
        </div>
      ) : squadrons.length === 0 ? (
        <div className="hud-panel p-12 text-center max-w-lg mx-auto mt-12 space-y-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold">No Active Squadrons</h3>
          <p className="text-sm text-muted-foreground">
            You are currently flying solo. Establish your own FPV squadron or join an existing squadron via invite code to sync logs and gear.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowJoinModal(true)}>
              Enter Invite Code
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              Establish Squadron
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6">
          {squadrons.map((squad: any) => (
            <div key={squad.id} className="hud-panel p-6 flex flex-col justify-between relative overflow-hidden group hover:border-primary/50 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full pointer-events-none group-hover:bg-primary/10 transition-colors" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono uppercase font-semibold">
                    <Radio className="h-3 w-3 animate-pulse" /> {squad.userRole}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    Est. {new Date(squad.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-lg font-bold tracking-tight mb-1 text-foreground">{squad.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-4">
                  {squad.description || "No mission description provided."}
                </p>
              </div>

              <div className="pt-4 border-t border-border/60 flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Joined {new Date(squad.joinedAt || squad.created_at).toLocaleDateString()}
                </span>
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1.5 font-semibold text-xs"
                  onClick={() => navigate({ to: "/squadron/$squadronId", params: { squadronId: squad.id } })}
                >
                  Enter Squad HQ <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Squadron Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="hud-panel w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Establish New Squadron
            </h3>
            <p className="text-xs text-muted-foreground">
              Create an operational squadron base for your FPV crew to coordinate sessions and gear.
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Squadron Name</Label>
                <Input
                  value={newSquadName}
                  onChange={(e) => setNewSquadName(e.target.value)}
                  placeholder="e.g. Apex FPV Racers"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Mission Description (Optional)</Label>
                <Input
                  value={newSquadDesc}
                  onChange={(e) => setNewSquadDesc(e.target.value)}
                  placeholder="e.g. Freestyle & Cinematic pilots in the Midwest"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newSquadName.trim() || createSquadronMutation.isPending}
                onClick={() => createSquadronMutation.mutate({ name: newSquadName, description: newSquadDesc })}
              >
                {createSquadronMutation.isPending ? "Establishing..." : "Establish Squadron"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Join Squadron Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="hud-panel w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" /> Join Squadron via Invite Code
            </h3>
            <p className="text-xs text-muted-foreground">
              Enter the secure alphanumeric invite code provided by your squadron commander.
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Invite Code</Label>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. FPV-XXXX-2025"
                  className="mt-1 font-mono tracking-widest text-center text-lg uppercase"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowJoinModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!joinCode.trim() || joinSquadronMutation.isPending}
                onClick={() => joinSquadronMutation.mutate(joinCode)}
              >
                {joinSquadronMutation.isPending ? "Connecting Uplink..." : "Connect to Squadron"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
