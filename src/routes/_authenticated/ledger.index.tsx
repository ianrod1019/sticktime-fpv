import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, Users, Wrench, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { db_request } from "@/lib/db_request";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ledger hub at /ledger: the personal cost ledger first, then one card per
 * squadron whose fleet ledger the owner has granted this pilot access to.
 * Mirrors the hanger hub. The backend RPC re-checks the grant on every
 * read — this flag only controls card visibility.
 */
export const Route = createFileRoute("/_authenticated/ledger/")({
  head: () => ({
    meta: [
      { title: "Cost Ledgers — StickTime FPV" },
      {
        name: "description",
        content:
          "Your personal cost ledger plus the fleet ledger of every squadron that granted you access.",
      },
    ],
  }),
  component: LedgerHub,
});

interface SquadronLedgerEntry {
  id: string;
  name: string;
  userRole: string;
  hasAccess: boolean;
}
interface LedgerMembershipRow {
  team_id: string;
  team_name: string;
  team_role: string;
  can_view_ledger: boolean;
}
function LedgerHub() {
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  // One server-truth RPC: memberships with EFFECTIVE ledger access per
  // team (owner/manager, the member's own can_view_ledger switch, or a
  // custom role template — resolved server-side by get_my_org_memberships).
  const {
    data: squadrons,
    isLoading: squadronsLoading,
    error: squadronsError,
  } = useQuery({
    queryKey: ["ledger-squadrons", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<SquadronLedgerEntry[]> => {
      const { data, error: rpcError } = await db_request({
        mode: "rpc",
        rpcFunction: "get_my_org_memberships",
        rpcParams: {},
      });
      if (rpcError) throw rpcError;
      const rows = (data ?? []) as LedgerMembershipRow[];
      return rows.map((m) => ({
        id: m.team_id,
        name: m.team_name,
        userRole: m.team_role,
        hasAccess: m.can_view_ledger === true,
      }));
    },
  });

  const grantedSquadrons = (squadrons ?? []).filter((sq) => sq.hasAccess);

  return (
    <>
      <PageHeader
        title="Cost Ledgers"
        subtitle="Your personal ledger first, then the fleet ledger of every squadron that granted you access."
      />

      <div className="grid gap-5 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {/* ---------------- Personal ledger — always first ---------------- */}
        <Link to="/ledger/personal" className="group ops-card ops-card-primary">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Wrench className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-bold uppercase tracking-wider text-foreground">
              Personal Ledger
            </h2>
            <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
              Yours
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            What every hour — and every pack — actually costs across your own
            quads, radios, goggles and bench parts.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            Open personal ledger
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        {/* ---------------- Squadron ledgers ---------------- */}
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

        {grantedSquadrons.map((sq) => (
          <Link
            key={sq.id}
            to="/ledger/squadron/$uuid"
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
              The squadron's shared fleet — org gear, repairs and investment, as
              granted by the owner.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              Open squadron ledger
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
