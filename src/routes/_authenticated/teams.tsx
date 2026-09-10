import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, Key, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Squads & Teams — StickTime FPV" }] }),
  component: Teams,
});

function Teams() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: myTeams = [], isLoading: isLoadingTeams } = useQuery({
    queryKey: ["my-teams", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "query",
        table: "team_members",
        operation: "select",
        selectColumns: `
          team_role,
          teams (
            id,
            name,
            description,
            created_at,
            owner_id
          )
        `,
        filters: { user_id: user!.id },
      });

      if (error) throw error;
      return data?.map((m) => ({ ...m.teams, team_role: m.team_role })) || [];
    },
  });

  const createTeam = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { data: team, error } = await db_request({
        mode: "query",
        table: "teams",
        operation: "upsert",
        data: { name, description, owner_id: user.id },
        single: true,
      });

      if (error) throw error;

      await db_request({
        mode: "query",
        table: "team_members",
        operation: "insert",
        data: { team_id: team.id, user_id: user.id, team_role: "owner" },
      });

      const randomCode = Math.random().toString(36).substring(2, 9).toUpperCase();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      await db_request({
        mode: "query",
        schema: "public",
        table: "team_invite_codes",
        operation: "insert",
        data: {
          team_id: team.id,
          code: randomCode,
          created_by: user.id,
          expires_at: expiresAt,
        },
      });

      return team.id;
    },
    onSuccess: (teamId) => {
      toast.success("Squad created successfully!");
      setName("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["my-teams"] });
      navigate({ to: "/squadron/$squadronId", params: { squadronId: teamId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const joinTeam = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("join_team_with_code", { _code: code.trim() });
      if (error) throw error;
      return data;
    },
    onSuccess: (teamId: string) => {
      toast.success("Successfully joined squad!");
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["my-teams"] });
      if (teamId) {
        navigate({ to: "/squadron/$squadronId", params: { squadronId: teamId } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Squad Portal"
        subtitle="Collaborate in private FPV squad spaces, maintain squad gear, and log squad flight sessions."
      />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Active Squads Section (if any) */}
        {!isLoadingTeams && myTeams.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
              Your Active Squads
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {myTeams.map((team: any) => (
                <div key={team.id} className="hud-panel p-6 flex flex-col justify-between border-primary/40 bg-card/60 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full pointer-events-none" />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-bold tracking-tight">{team.name}</h2>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium capitalize border border-primary/20">
                        {team.team_role}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-6">
                      {team.description || "No description provided for this squad."}
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate({ to: "/squadron/$squadronId", params: { squadronId: team.id } })}
                    className="w-full gap-2 mt-4 cursor-pointer"
                  >
                    Enter Squad HQ
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create and Join Grid */}
        <div className="grid gap-6 md:grid-cols-2 items-stretch">
          {/* Create Team Card */}
          <section className="hud-panel p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Plus className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Create New Squad</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="team-name">Squad Name</Label>
                  <Input
                    id="team-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Night Shift FPV Racers"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="team-desc">Description (Optional)</Label>
                  <Input
                    id="team-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Weekend freestyle sessions"
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>
            <Button
              disabled={!name.trim() || createTeam.isPending}
              onClick={() => createTeam.mutate()}
              className="w-full gap-2 mt-8"
            >
              <Plus className="h-4 w-4" />
              {createTeam.isPending ? "Creating Squad..." : "Create Squad"}
            </Button>
          </section>

          {/* Join Team Card */}
          <section className="hud-panel p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Key className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Join with Entry Code</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Enter a valid 7-day squad invite code shared by your squad leader or team admin to instantly access the squad hangar and shared flight logs.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="invite-code">Squad Invite Code</Label>
                  <Input
                    id="invite-code"
                    placeholder="e.g. FPV7X9Q"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="mt-1.5 font-mono text-center tracking-widest uppercase text-xl h-12"
                    maxLength={10}
                  />
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              disabled={!code.trim() || joinTeam.isPending}
              onClick={() => joinTeam.mutate()}
              className="w-full mt-8 gap-2 h-11"
            >
              {joinTeam.isPending ? "Joining Squad..." : "Join Squad"}
            </Button>
          </section>
        </div>
      </div>
    </>
  );
}
