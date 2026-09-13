import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import {
  type OrgRoleGrant,
  parseOrgRole,
  permissionsForRole,
} from "@/lib/org_role";

export interface OrgRoleResolution extends OrgRoleGrant {
  teamId: string;
  /** False while loading or when the caller has no squadron role. */
  isMember: boolean;
  isLoading: boolean;
}

const NOT_MEMBER: Omit<OrgRoleResolution, "teamId" | "isLoading"> = {
  role: "member",
  canWrite: false,
  canEditMoney: false,
  canManageMembers: false,
  canViewLedger: false,
  canViewAnalytics: false,
  isMember: false,
};

/**
 * The caller's typed squadron role + resolved permission flags, straight
 * from the server contract (public.get_my_org_role). The flags are the
 * same ones RLS and the money-lock triggers enforce, so UI gated on them
 * matches what the server will actually allow.
 */
export function useOrgRole(teamId: string | null | undefined): OrgRoleResolution {
  const { data, isLoading } = useQuery({
    queryKey: ["org-role", teamId],
    enabled: !!teamId,
    staleTime: 60_000,
    queryFn: async (): Promise<Omit<OrgRoleResolution, "teamId" | "isLoading">> => {
      const res = await db_request({
        mode: "rpc",
        rpcFunction: "get_my_org_role",
        rpcParams: { _team_id: teamId },
      });

      const rows = (Array.isArray(res.data) ? res.data : res.data ? [res.data] : []) as Array<{
        role: unknown;
        can_write: boolean;
        can_edit_money: boolean;
        can_manage_members: boolean;
        can_view_ledger: boolean;
        can_view_analytics: boolean;
      }>;

      const row = rows[0];
      const role = row ? parseOrgRole(row.role) : null;
      if (!row || !role) return NOT_MEMBER;

      return {
        role,
        canWrite: !!row.can_write,
        canEditMoney: !!row.can_edit_money,
        canManageMembers: !!row.can_manage_members,
        canViewLedger: !!row.can_view_ledger,
        canViewAnalytics: !!row.can_view_analytics,
        isMember: true,
      };
    },
  });

  if (!teamId) {
    return { ...NOT_MEMBER, teamId: "", isLoading: false };
  }

  return {
    ...(data ?? {
      // Optimistic first paint: derive from the role alone until the RPC
      // resolves (mirrors permissionsForRole with no staff knowledge yet).
      ...permissionsForRole("member"),
      role: "member" as const,
      isMember: false,
    }),
    teamId,
    isLoading,
  };
}
