import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/teams/$teamId")({
  head: () => ({ meta: [{ title: `Squad HQ — StickTime FPV` }] }),
  component: SquadHQPage,
});

function SquadHQPage() {
  const { teamId } = Route.useParams();
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  // Backend membership and team validation check
  const { data: membershipData, isLoading, error } = useQuery({
    queryKey: ["squad-membership-check", teamId, user?.id],
    enabled: !!user?.id && !!teamId,
    queryFn: async () => {
      // Fetch team details
      const teamRes = await supabase
        .from("teams")
        .select("id, name, description, owner_id")
        .eq("id", teamId)
        .single();

      if (teamRes.error) throw new Error("Squad not found or access denied.");

      // Verify membership in team_members
      const memberRes = await supabase
        .from("team_members")
        .select("team_role, joined_at")
        .eq("team_id", teamId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!memberRes.data) {
        throw new Error("Unauthorized: You are not a member of this squad.");
      }

      return {
        team: teamRes.data,
        membership: memberRes.data,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground font-mono">
        Verifying squad clearance & telemetry channels...
      </div>
    );
  }

  if (error || !membershipData) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 hud-panel text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          {error?.message || "You do not have clearance to access this Squad HQ."}
        </p>
        <Button onClick={() => navigate({ to: "/teams" })} className="w-full gap-2">
          <ArrowLeft className="h-4 w-4" /> Return to Squad Portal
        </Button>
      </div>
    );
  }

  const { team } = membershipData;

  return (
    <>
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/teams" })}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Squad Portal
        </Button>
      </div>

      <PageHeader
        title="Squad HQ"
        subtitle={`Welcome to the command center for ${team.name}`}
      />

      <div className="hud-panel p-12 text-center space-y-4 mt-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-primary">Squad HQ</h2>
        <p className="text-muted-foreground max-w-md mx-auto text-sm">
          Secure backend telemetry verified. You are an authorized member of this squad. Feature modules coming online shortly.
        </p>
      </div>
    </>
  );
}
