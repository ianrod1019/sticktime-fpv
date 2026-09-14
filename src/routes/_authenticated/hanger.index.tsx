import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  Users,
  Wrench,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db_request } from "@/lib/db_request";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/hanger/")({
  head: () => ({
    meta: [
      { title: "Hangers — StickTime FPV" },
      {
        name: "description",
        content:
          "Your personal gear hanger plus the shared hanger of every squadron you fly with.",
      },
    ],
  }),
  component: HangerHub,
});

interface SquadronHangerEntry {
  id: string;
  name: string;
  userRole: string;
}

interface MembershipRow {
  team_id: string;
  team_role: string;
}
interface TeamRow {
  id: string;
  name: string;
}

function HangerHub() {
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  // Squadrons the signed-in pilot belongs to. team_members is scoped by RLS,
  // so this list can only ever contain squads the user is actually in.
  const {
    data: squadrons,
    isLoading: squadronsLoading,
    error: squadronsError,
  } = useQuery({
    queryKey: ["hanger-squadrons", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<SquadronHangerEntry[]> => {
      const { data: memberships, error: memberError } = await db_request({
        mode: "query",
        table: "team_members",
        operation: "select",
        selectColumns: "team_id, team_role",
        filters: { user_id: user!.id },
      });
      if (memberError) throw memberError;
      if (!memberships || memberships.length === 0) return [];

      const memberRows = memberships as MembershipRow[];
      const teamIds = memberRows.map((m) => m.team_id);
      const { data: teams, error: teamsError } = await db_request({
        mode: "query",
        table: "teams",
        operation: "select",
        selectColumns: "id, name",
        filters: { id: teamIds },
      });
      if (teamsError) throw teamsError;

      const teamRows = (teams ?? []) as TeamRow[];
      return teamRows.map((team) => ({
        id: team.id,
        name: team.name,
        userRole:
          memberRows.find((m) => m.team_id === team.id)?.team_role ?? "member",
      }));
    },
  });

  return (
    <>
      <PageHeader
        title="Hangers"
        subtitle="Your personal fleet first, then the shared hanger of every squadron you fly with."
      />

      <div className="grid gap-5 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {/* ---------------- Personal hanger — always first ---------------- */}
        <Link to="/hanger/personal" className="group ops-card ops-card-primary">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Wrench className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-bold uppercase tracking-wider text-foreground">
              Personal Hanger
            </h2>
            <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
              Yours
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Quads, radios, goggles, battery sets and bench gear — sessions,
            maintenance and costs, all yours.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            Open personal hanger
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        {/* ---------------- Squadron hangers ---------------- */}
        {squadronsLoading && (
          <>
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </>
        )}

        {squadronsError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive sm:col-span-2 lg:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" aria-hidden />
              Couldn't load your squadrons
            </div>
            <p className="text-xs text-muted-foreground">
              {squadronsError.message}
            </p>
          </div>
        )}

        {!squadronsLoading &&
          (squadrons ?? []).map((sq) => (
            <Link
              key={sq.id}
              to="/hanger/squadron/$uuid"
              params={{ uuid: sq.id }}
              className="group ops-card"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-secondary/50 text-muted-foreground transition-colors group-hover:border-primary/25 group-hover:bg-primary/10 group-hover:text-primary">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold tracking-wider text-foreground">
                  {sq.name}
                </h2>
                <span className="rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-secondary-foreground">
                  {sq.userRole === "owner"
                    ? "Owner"
                    : sq.userRole === "manager"
                      ? "Manager"
                      : "Pilot"}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Shared squadron gear — check equipment out and back in with the
                whole squad watching the log.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                Open squadron hanger
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}

        {!squadronsLoading && (squadrons?.length ?? 0) === 0 && (
          <Link to="/squadron" className="group ops-card ops-card-dashed">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-secondary/40 text-muted-foreground">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="font-display text-base font-bold tracking-wider text-foreground">
              Squadron hangers
            </h2>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Join a squadron — or found one — and its shared gear hanger shows
              up here, right below your personal fleet.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              Go to the Squad Portal
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}
      </div>

      <div className="mb-16 flex justify-end">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/hanger/personal" search={{ add: "1" }}>
            <Plus className="h-4 w-4" /> Add personal gear
          </Link>
        </Button>
      </div>
    </>
  );
}
