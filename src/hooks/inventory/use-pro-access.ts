import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePilot } from "@/hooks/use-pilot";

export interface ProAccessResult {
  /** True when the user's tier is 'pro' (or they are admin/dev). */
  hasProAccess: boolean;
  isLoading: boolean;
  /** Raw tier string for UI badges ("free" | "pro" | ...). */
  tier: string;
}

/**
 * Central Pro-tier check for the inventory module. Uses the server-side
 * `check_pro_access` RPC as source of truth, with the pilot profile as an
 * optimistic fallback while the RPC resolves.
 */
export function useProAccess(): ProAccessResult {
  const { profile } = usePilot();

  const query = useQuery({
    queryKey: ["pro-access", profile?.id],
    enabled: !!profile?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_pro_access");
      if (error) throw error;
      return data === true;
    },
  });

  const role = (profile?.role ?? "").toLowerCase();
  const isElevated = role === "admin" || role === "dev";
  const profileSaysPro = (profile?.tier ?? "").toLowerCase() === "pro";

  // Profile-based signal resolves instantly; RPC confirms/corrects it.
  const optimistic = profileSaysPro || isElevated;
  const hasProAccess = query.data ?? optimistic;

  return {
    hasProAccess,
    isLoading: !!profile?.id && query.isLoading,
    tier: profile?.tier ?? "free",
  };
}
