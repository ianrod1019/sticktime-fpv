import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Teams — StickTime FPV" }] }),
  component: Teams,
});
function Teams() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const { data } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];
      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.user.id);
      const ids = (memberships ?? []).map((m) => m.team_id);
      const result = ids.length
        ? await supabase.from("teams").select("*").in("id", ids)
        : await supabase.from("teams").select("*").eq("owner_id", user.user.id);
      return result.data ?? [];
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const { data: team, error } = await supabase
        .from("teams")
        .insert({ name, owner_id: user.user.id })
        .select("id")
        .single();
      if (error) throw error;
      const member = await supabase
        .from("team_members")
        .insert({ team_id: team.id, user_id: user.user.id, team_role: "team_admin" });
      if (member.error) throw member.error;
    },
    onSuccess: () => {
      toast.success("Team created");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const join = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("join_team_with_code", { _code: code });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Joined team");
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader
        title="Team portal"
        subtitle="Collaborate in private squad spaces with rotating entry codes."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="hud-panel p-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="label-mono">Create a squad</span>
          </div>
          <div className="mt-4 space-y-3">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Night Shift FPV"
            />
            <Button disabled={!name || create.isPending} onClick={() => create.mutate()}>
              Create team
            </Button>
          </div>
        </section>
        <section className="hud-panel p-5">
          <span className="label-mono">Join with entry code</span>
          <div className="mt-4 flex gap-2">
            <Input
              placeholder="7-day code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Button
              variant="outline"
              disabled={!code || join.isPending}
              onClick={() => join.mutate()}
            >
              Join
            </Button>
          </div>
        </section>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(data ?? []).map((team) => (
          <div key={team.id} className="hud-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{team.name}</h2>
              <Badge variant="secondary">Member</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Shared logs and gear stay scoped to this squad.
            </p>
          </div>
        ))}
        {!data?.length && (
          <p className="text-sm text-muted-foreground">
            Create or join a team to see your shared flight space.
          </p>
        )}
      </div>
    </>
  );
}
