import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldAlert, Users, Calendar, Settings } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/squadron/$squadronId")({
  head: () => ({ meta: [{ title: `Squad HQ — StickTime FPV` }] }),
  component: SquadronHQPage,
});

function SquadronHQPage() {
  const { squadronId } = Route.useParams();
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: squadData, isLoading, error } = useQuery({
    queryKey: ["squadron-hq-details", squadronId, user?.id],
    enabled: !!user?.id && !!squadronId,
    queryFn: async () => {
      const teamRes = await supabase
        .from("teams")
        .select("id, name, description, owner_id, created_at")
        .eq("id", squadronId)
        .single();

      if (teamRes.error) throw new Error("Squadron not found or access denied.");

      const memberRes = await supabase
        .from("team_members")
        .select("team_role, joined_at")
        .eq("team_id", squadronId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!memberRes.data) {
        throw new Error("Unauthorized: You are not a member of this squadron.");
      }

      const membersRes = await supabase
        .from("team_members")
        .select(`
          team_role,
          joined_at,
          user_id
        `)
        .eq("team_id", squadronId);

      return {
        team: teamRes.data,
        membership: memberRes.data,
        members: membersRes.data || [],
      };
    },
  });

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground font-mono animate-pulse">
        Establishing secure telemetry uplink to Squadron HQ...
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
          {error?.message || "You do not have clearance to access this Squadron HQ."}
        </p>
        <Button onClick={() => navigate({ to: "/teams" })} className="w-full gap-2">
          <ArrowLeft className="h-4 w-4" /> Return to Squad Portal
        </Button>
      </div>
    );
  }

  const { team, membership, members } = squadData;
  const isOwner = membership.team_role === "owner" || team.owner_id === user?.id;
  const isManagerOrOwner = isOwner || membership.team_role === "manager";

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/teams" })}
          className="text-muted-foreground hover:text-foreground gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Squad Portal
        </Button>

        {isManagerOrOwner && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate({ to: "/squadron/manage/$uuid", params: { uuid: squadronId } })}
            className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
          >
            <Settings className="h-4 w-4" /> Squadron Management
          </Button>
        )}
      </div>

      <PageHeader
        title={team.name}
        subtitle={team.description || "Squadron Command & Telemetry Hub"}
      />

      <div className="grid gap-6 md:grid-cols-3 mt-6">
        <div className="md:col-span-3 space-y-6">
          <div className="hud-panel p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-bl-full pointer-events-none" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Squadron Roster ({members.length})
              </h2>
              <span className="text-xs uppercase px-2.5 py-1 rounded bg-primary/10 text-primary font-semibold">
                Role: {membership.team_role}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
              {members.map((m: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-card/60 border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                      P{idx + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium font-mono text-foreground">Pilot ID: {m.user_id.substring(0, 8)}...</p>
                      <p className="text-xs text-muted-foreground">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground uppercase font-mono">
                    {m.team_role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="hud-panel p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" /> Squadron Flight Logs & Gear
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Shared squad telemetry, synchronized lipo logs, and fleet maintenance records for {team.name} are active.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-lg bg-card/40 border border-border/60">
                <h3 className="font-semibold text-sm mb-1">Squadron Hangar Gear</h3>
                <p className="text-xs text-muted-foreground">Browse shared quads, spare props, and VTX gear across squadron pilots.</p>
                <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => navigate({ to: "/garage" })}>
                  View Fleet
                </Button>
              </div>
              <div className="p-4 rounded-lg bg-card/40 border border-border/60">
                <h3 className="font-semibold text-sm mb-1">Squadron Flight Logbook</h3>
                <p className="text-xs text-muted-foreground">Review session telemetry, spotter notes, and spot records.</p>
                <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => navigate({ to: "/log" })}>
                  View Logs
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
