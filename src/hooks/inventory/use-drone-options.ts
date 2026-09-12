import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DroneOption {
  id: string;
  name: string;
}

/**
 * Every airframe the pilot owns, for drone pickers. Runs through PostgREST
 * directly (RLS scopes rows to the owning user) and is safe to call with an
 * `enabled` flag so pickers only fetch when they are actually visible.
 */
export function useDroneOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["drone-options"],
    queryFn: async (): Promise<DroneOption[]> => {
      const { data, error } = await supabase
        .schema("personal_gear")
        .from("drones")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as DroneOption[];
    },
    enabled,
    staleTime: 60_000,
  });
}
