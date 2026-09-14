/**
 * useSchedulingAccess — resolves the caller's scheduling access for an
 * org in one server call (tier, add-on purchase, manage rights). The
 * UI gate renders from this; the server enforces it regardless.
 */

import { useQuery } from "@tanstack/react-query";
import { getSchedulingAccess } from "@/lib/scheduling/api";
import { supabase } from "@/integrations/supabase/client";
import type { SchedulingAccess } from "@/lib/scheduling/types";

const IDLE_ACCESS: SchedulingAccess = {
  enabled: false,
  tier_ok: false,
  addon_purchased: false,
  can_manage: false,
  org_role: null,
};

export function useSchedulingAccess(teamId: string | null) {
  // Key is user-scoped: access is per-person (tier + role + grants), so a
  // persisted cache entry from a previous login on this machine must never
  // render for the current one.
  const { data: userId } = useQuery({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user?.id ?? null;
    },
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: ["scheduling-access", userId, teamId],
    queryFn: () => getSchedulingAccess(teamId as string),
    enabled: !!teamId && !!userId,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    access: query.data ?? IDLE_ACCESS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
