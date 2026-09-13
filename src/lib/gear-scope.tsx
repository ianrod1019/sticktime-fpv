/**
 * Gear scope: which hanger is being viewed — the pilot's personal_gear data
 * or a squadron's shared org_gear fleet. Routes provide it via GearScopeProvider;
 * hooks and mutations read it to resolve schema, cache scope and ownership.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import { supabase } from "@/integrations/supabase/client";

export type GearScope = { kind: "personal" } | { kind: "org"; teamId: string };

export interface GearScopeResolution {
  schema: "personal_gear" | "org_gear";
  /** Delta-sync cache scope: user id or team id. */
  scopeId: string | null;
  /** Org hangers: the squadron's write/money-lock access. Personal: true. */
  canWrite: boolean;
  /** May add/edit/delete org gear (owner/manager or granted member). */
  canEditGear: boolean;
  /** May open squadron failure analytics. */
  canViewAnalytics: boolean;
  /** May open the squadron cost ledger. */
  canViewLedger: boolean;
  /** Org hangers: may touch money fields (owner/manager). Personal: true. */
  canEditMoney: boolean;
  /** Org metadata for the header (kind === "org" only). */
  teamName: string | null;
  teamRole: string | null;
  isLoading: boolean;
  /** False only for org scopes when the caller is not a team member. */
  isMember: boolean;
}

interface GearScopeContextValue {
  scope: GearScope;
  /** Extra scope for cache keys (e.g. the gear id for detail pages). */
  resolution: GearScopeResolution;
}

const GearScopeContext = createContext<GearScopeContextValue | null>(null);

export function useGearScopeContext(): GearScopeContextValue {
  const ctx = useContext(GearScopeContext);
  if (!ctx)
    throw new Error("useGearScope* must be used inside <GearScopeProvider>");
  return ctx;
}

/** The current gear scope, provided by the hanger routes. */
export function useGearScope(): GearScope {
  return useGearScopeContext().scope;
}

function usePersonalResolution(enabled: boolean): GearScopeResolution {
  const { profile } = usePilotProfile(enabled);
  return {
    schema: "personal_gear",
    scopeId: profile?.id ?? null,
    canWrite: true,
    canEditGear: true,
    canViewAnalytics: true,
    canViewLedger: true,
    canEditMoney: true,
    teamName: null,
    teamRole: null,
    isLoading: false,
    isMember: true,
  };
}

/** Minimal pilot hook so this module stays dependency-light. */
function usePilotProfile(enabled: boolean): { profile: { id: string } | null } {
  const { data: session } = useQuery({
    queryKey: ["auth-session"],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
    staleTime: 60_000,
  });
  return { profile: session?.user?.id ? { id: session.user.id } : null };
}

function useOrgResolution(teamId: string | null): GearScopeResolution {
  // One RPC answers everything: role, resolved flags (the same matrix the
  // server enforces via RLS + money locks) and membership. Team name is a
  // separate cheap lookup so the role RPC stays its single source of truth.
  const { data, isLoading } = useQuery({
    queryKey: ["gear-scope-org", teamId],
    enabled: !!teamId,
    staleTime: 60_000,
    queryFn: async (): Promise<GearScopeResolution> => {
      const { data: user } = await supabase.auth.getUser();
      const userId = user.user?.id;
      if (!userId || !teamId) {
        return {
          schema: "org_gear",
          scopeId: teamId,
          canWrite: false,
          canEditGear: false,
          canViewAnalytics: false,
          canViewLedger: false,
          canEditMoney: false,
          teamName: null,
          teamRole: null,
          isLoading: false,
          isMember: false,
        };
      }

      const { data: grant } = await db_request({
        mode: "rpc",
        rpcFunction: "get_my_org_role",
        rpcParams: { _team_id: teamId },
      });

      const row = Array.isArray(grant) ? grant[0] : grant;
      const teamRole =
        row && typeof row.role === "string" ? (row.role as string) : null;
      const isMember = teamRole !== null;

      let teamName: string | null = null;
      if (isMember) {
        const { data: team } = await db_request({
          mode: "query",
          table: "teams",
          operation: "select",
          selectColumns: "name",
          filters: { id: teamId },
          single: true,
        });
        teamName = (team as { name?: string } | null)?.name ?? null;
      }

      return {
        schema: "org_gear",
        scopeId: teamId,
        canWrite: isMember && row.can_write !== false,
        canEditGear: isMember && row.can_write !== false,
        canViewAnalytics: isMember && row.can_view_analytics === true,
        canViewLedger: isMember && row.can_view_ledger === true,
        canEditMoney: isMember && row.can_edit_money === true,
        teamName,
        teamRole,
        isLoading: false,
        isMember,
      };
    },
  });

  return (
    data ?? {
      schema: "org_gear",
      scopeId: teamId,
      canWrite: false,
      canEditGear: false,
      canViewAnalytics: false,
      canViewLedger: false,
      canEditMoney: false,
      teamName: null,
      teamRole: null,
      isLoading,
      isMember: false,
    }
  );
}

export function GearScopeProvider({
  scope,
  children,
}: {
  scope: GearScope;
  children: ReactNode;
}) {
  // Both resolvers always run (rules of hooks); each gates its own queries
  // internally — the personal session query only enables for personal scope,
  // the org membership query only when a teamId is provided.
  const personal = usePersonalResolution(scope.kind === "personal");
  const org = useOrgResolution(scope.kind === "org" ? scope.teamId : null);
  const resolution = scope.kind === "personal" ? personal : org;
  return (
    <GearScopeContext.Provider value={{ scope, resolution }}>
      {children}
    </GearScopeContext.Provider>
  );
}
