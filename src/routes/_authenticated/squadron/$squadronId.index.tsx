import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ShieldAlert,
  Users,
  BatteryCharging,
  Settings,
  CircleDollarSign,
  Clock,
  ActivitySquare,
  Boxes,
  Wrench,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db_request } from "@/lib/db_request";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/inventory/use-org-role";

export const Route = createFileRoute("/_authenticated/squadron/$squadronId/")({
  head: () => ({ meta: [{ title: `Squad HQ — StickTime FPV` }] }),
  component: SquadronHQPage,
});

interface RosterMember {
  member_id: string;
  display_name: string;
  callsign: string | null;
  team_role: string;
  joined_at: string;
  session_count: number;
  flight_minutes: number;
  packs_flown: number;
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const ROLE_META: Record<string, { label: string; cls: string }> = {
  owner: {
    label: "Owner",
    cls: "border-primary/40 bg-primary/10 text-primary",
  },
  manager: {
    label: "Manager",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  },
  member: {
    label: "Pilot",
    cls: "border-border/60 bg-secondary/60 text-secondary-foreground",
  },
};

function SquadMetricTile({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
          accent ? "text-emerald-500" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

/**
 * Squad HQ header buttons, one per squadron surface. Rendered only when the
 * signed-in member has access: bench and hanger are membership-level;
 * the ledger and analytics are server-truth RBAC (owner/manager, or a
 * pilot the owner granted the matching permission).
 */
function SquadronHQPage() {
  const { squadronId } = Route.useParams();
  const navigate = useNavigate({ from: "/squadron/$squadronId" });

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const {
    data: squadData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["squadron-hq-details", squadronId, user?.id],
    enabled: !!user?.id && !!squadronId,
    queryFn: async () => {
      const teamRes = await supabase
        .from("teams")
        .select("id, name, description, owner_id, created_at")
        .eq("id", squadronId)
        .single();

      if (teamRes.error)
        throw new Error("Squadron not found or access denied.");

      const memberRes = await supabase
        .from("team_members")
        .select("team_role, joined_at")
        .eq("team_id", squadronId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!memberRes.data) {
        throw new Error("Unauthorized: You are not a member of this squadron.");
      }

      return {
        team: teamRes.data,
        membership: memberRes.data,
      };
    },
  });

  const isTeamContext = !!squadData && !error;

  const { data: roster } = useQuery({
    queryKey: ["squadron-roster", squadronId],
    enabled: isTeamContext,
    queryFn: async (): Promise<RosterMember[]> => {
      const { data, error: rpcError } = await db_request({
        mode: "rpc",
        rpcFunction: "get_squadron_overview",
        rpcParams: { _team_id: squadronId },
      });
      if (rpcError) throw rpcError;
      return (data ?? []) as RosterMember[];
    },
  });

  // Server-truth RBAC for the Ledger button: owner/manager always, plain
  // pilots only when the owner granted them ledger access (can_view_ledger,
  // set per member in Squadron Management). The ledger page's RPC enforces
  // the same gate; this only decides whether the button renders.
  const { data: ledgerAccess } = useQuery({
    queryKey: ["squadron-ledger-access", squadronId],
    enabled: isTeamContext,
    staleTime: 30_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error: rpcError } = await db_request({
        mode: "rpc",
        rpcFunction: "can_view_squadron_ledger",
        rpcParams: { _team_id: squadronId },
      });
      if (rpcError) throw rpcError;
      return Boolean(data);
    },
  });

  // Server-truth analytics permission (owner/manager always; plain pilots
  // when granted — own switch or custom role template). The analytics RPC
  // re-checks server-side; this only decides whether the button renders.
  const { canViewAnalytics } = useOrgRole(squadronId);

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
          {error?.message ||
            "You do not have clearance to access this Squadron HQ."}
        </p>
        <Button
          onClick={() => navigate({ to: "/squadron" })}
          className="w-full gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Squad Portal
        </Button>
      </div>
    );
  }

  const { team, membership } = squadData;
  const isOwner =
    membership.team_role === "owner" || team.owner_id === user?.id;
  const isManagerOrOwner = isOwner || membership.team_role === "manager";

  // Per-button access: bench and hanger are membership-level; the ledger
  // and analytics are server-truth RBAC (see queries above).
  const hqNav = [
    {
      to: "/squadron/$squadronId/inventory" as const,
      label: "Squadron Bench",
      icon: Boxes,
      access: true,
      primary: false,
    },
    {
      to: "/hanger/squadron/$uuid" as const,
      label: "Gear Hanger",
      icon: Wrench,
      access: true,
      params: { uuid: squadronId },
      primary: false,
    },
    {
      to: "/ledger/squadron/$uuid" as const,
      label: "Fleet Ledger",
      icon: CircleDollarSign,
      access: ledgerAccess === true,
      params: { uuid: squadronId },
      primary: false,
    },
    {
      to: "/squadron/$squadronId/analytics" as const,
      label: "Failure Analytics",
      icon: ActivitySquare,
      access: canViewAnalytics,
      primary: true,
    },
  ];

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/squadron" })}
          className="text-muted-foreground hover:text-foreground gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Squad Portal
        </Button>

        {isManagerOrOwner && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigate({
                to: "/squadron/manage/$uuid",
                params: { uuid: squadronId },
              })
            }
            className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
          >
            <Settings className="h-4 w-4" /> Squadron Management
          </Button>
        )}
      </div>

      <PageHeader
        title={team.name}
        subtitle={team.description || "Squadron Command & Telemetry Hub"}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {hqNav
              .filter(({ access }) => access)
              .map(({ to, label, icon: Icon, primary, ...rest }) => (
                <Button
                  key={to}
                  asChild
                  size="sm"
                  variant={primary ? "default" : "outline"}
                  className="gap-2"
                >
                  <Link
                    to={to}
                    params={"params" in rest ? rest.params : { squadronId }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </Link>
                </Button>
              ))}
          </div>
        }
      />

      <Tabs value="roster" className="space-y-4">
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
        </TabsList>

        {/* ---------------- Roster ---------------- */}
        <TabsContent value="roster" className="space-y-4">
          {roster && roster.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <SquadMetricTile
                  label="Squad pilots"
                  value={String(roster.length)}
                  hint="Members with HQ access"
                  icon={<Users className="h-3.5 w-3.5" aria-hidden />}
                />
                <SquadMetricTile
                  label="Squad airtime"
                  value={`${(roster.reduce((s, m) => s + num(m.flight_minutes), 0) / 60).toFixed(1)}h`}
                  hint="Combined logged sessions"
                  icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
                />
                <SquadMetricTile
                  label="Squad packs"
                  value={String(
                    roster.reduce((s, m) => s + num(m.packs_flown), 0),
                  )}
                  hint="Real-world pack-cycles"
                  icon={<BatteryCharging className="h-3.5 w-3.5" aria-hidden />}
                />
              </div>

              <div className="hud-panel p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-bl-full pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" /> Squadron Roster
                  </h2>
                  <span className="text-xs uppercase px-2.5 py-1 rounded bg-primary/10 text-primary font-semibold">
                    You: {membership.team_role}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                  {roster.map((m) => {
                    const roleMeta =
                      ROLE_META[m.team_role] ?? ROLE_META["member"]!;
                    return (
                      <div
                        key={m.member_id}
                        className="p-4 rounded-lg bg-card/60 border border-border/50 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                              {(m.display_name || "P")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {m.display_name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Joined{" "}
                                {new Date(m.joined_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-mono border ${roleMeta.cls}`}
                          >
                            {roleMeta.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-center">
                          <div>
                            <div className="font-mono text-sm font-semibold text-foreground">
                              {m.session_count}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              sessions
                            </div>
                          </div>
                          <div>
                            <div className="font-mono text-sm font-semibold text-foreground">
                              {(num(m.flight_minutes) / 60).toFixed(1)}h
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              airtime
                            </div>
                          </div>
                          <div>
                            <div className="font-mono text-sm font-semibold text-foreground">
                              {m.packs_flown}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              packs
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <Skeleton className="h-64 rounded-xl" />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
