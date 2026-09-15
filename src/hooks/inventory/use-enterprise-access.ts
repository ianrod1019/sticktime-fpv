import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePilot } from "@/hooks/use-pilot";
import { useQaMode } from "@/hooks/use-qa-mode";

export interface EnterpriseAccessResult {
  /** True when the user's tier is 'enterprise' (or they are admin/dev). */
  hasEnterpriseAccess: boolean;
  isLoading: boolean;
  /** Raw tier string for UI badges ("free" | "pro" | "enterprise" | ...). */
  tier: string;
}

/**
 * Enterprise-tier check — the gate above Pro. Mirrors `useProAccess`: the
 * server-side `check_enterprise_access` RPC is the source of truth, with the
 * pilot profile as an optimistic fallback while the RPC resolves.
 */
export function useEnterpriseAccess(): EnterpriseAccessResult {
  const { profile } = usePilot();
  const qaMode = useQaMode();

  const query = useQuery({
    queryKey: ["enterprise-access", profile?.id],
    enabled: !!profile?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_enterprise_access");
      if (error) throw error;
      return data === true;
    },
  });

  const role = (profile?.role ?? "").toLowerCase();
  const isElevated = role === "admin" || role === "dev";
  const profileSaysEnterprise =
    (profile?.tier ?? "").toLowerCase() === "enterprise";

  // Profile-based signal resolves instantly; RPC confirms/corrects it.
  const optimistic = profileSaysEnterprise || isElevated;
  // QA mode opens every tier gate — fixtures, no real data at risk.
  const hasEnterpriseAccess = qaMode || (query.data ?? optimistic);

  return {
    hasEnterpriseAccess,
    isLoading: !!profile?.id && query.isLoading,
    tier: profile?.tier ?? "free",
  };
}
