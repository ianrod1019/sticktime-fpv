/**
 * Org roster for the per-person board. Callsigns are directory PII, so
 * they resolve server-side via the entsched_roster RPC (SECURITY
 * DEFINER, org-membership-gated). The team_members fallback only
 * exists for backends where the migration hasn't landed yet; it
 * degrades to opaque ids instead of leaking names.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BoardPerson {
  user_id: string;
  callsign: string;
  org_role: string;
}

export function useOrgRoster(orgId: string | null) {
  return useQuery({
    queryKey: ["entsched", "roster", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<BoardPerson[]> => {
      const { data, error } = await supabase.rpc("entsched_roster", {
        _org: orgId!,
      });
      if (!error && data) return data as BoardPerson[];

      // RPC missing (un-migrated backend): degrade to ids via the org bridge.
      const { data: org } = await supabase
        .schema("public")
        .from("organizations")
        .select("team_id")
        .eq("id", orgId!)
        .maybeSingle();
      if (!org?.team_id) return [];
      const { data: members, error: mErr } = await supabase
        .from("team_members")
        .select("user_id, team_role")
        .eq("team_id", org.team_id);
      if (mErr) throw mErr;
      return (members ?? []).map((m) => ({
        user_id: m.user_id,
        callsign: `pilot-${String(m.user_id).slice(0, 8)}`,
        org_role: m.team_role ?? "member",
      }));
    },
  });
}
