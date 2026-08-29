import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth-context";

export function usePilot() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["pilot_settings", user?.id],
    queryFn: async () => {
      if (!user) return null;
      let { data, error } = await supabase
        .from("pilot_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      // If no settings exist yet, auto-insert one
      if (!data) {
        const defaultCallsign = user.email ? user.email.split("@")[0] : "Pilot";
        const { data: inserted, error: insertError } = await supabase
          .from("pilot_settings")
          .insert({ user_id: user.id, callsign: defaultCallsign })
          .select()
          .single();

        if (!insertError && inserted) {
          data = inserted;
        }
      }

      return data;
    },
    enabled: !!user,
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      if (!user) throw new Error("No user logged in");
      const { data, error } = await supabase
        .from("pilot_settings")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pilot_settings", user?.id] });
    },
  });

  return {
    user,
    userId: user?.id,
    email: user?.email,
    profile,
    isLoading,
    updateProfile,
  };
}
