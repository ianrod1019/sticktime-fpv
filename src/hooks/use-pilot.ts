import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PilotProfile {
  id: string;
  user_id: string;
  weekly_goal_hours: number;
  is_private: boolean;
  callsign: string;
  bio: string;
  subscription_tier: string;
  created_at: string;
  updated_at: string;
}

export function usePilot() {
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const userId = session?.user?.id;
  const email = session?.user?.email;

  const { data: profile, isLoading } = useQuery({
    queryKey: ["pilot-settings", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      let { data, error } = await supabase
        .from("pilot_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching pilot settings:", error);
      }

      if (!data) {
        // Initialize default profile row if not exists
        const newRecord = {
          user_id: userId,
          weekly_goal_hours: 5,
          is_private: false,
          callsign: email ? email.split("@")[0] : "Pilot",
          bio: "",
          subscription_tier: "free",
        };
        const { data: inserted, error: insertError } = await supabase
          .from("pilot_settings")
          .insert(newRecord)
          .select()
          .single();

        if (!insertError && inserted) {
          data = inserted;
        } else {
          // Fallback object if insert fails due to RLS or other constraints
          data = {
            id: userId,
            user_id: userId,
            weekly_goal_hours: 5,
            is_private: false,
            callsign: email ? email.split("@")[0] : "Pilot",
            bio: "",
            subscription_tier: "free",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
      }

      return data as PilotProfile;
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: Partial<PilotProfile>) => {
      if (!userId) throw new Error("Not authenticated");

      const payload = {
        ...updates,
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      // Upsert into pilot_settings
      const { data, error } = await supabase
        .from("pilot_settings")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pilot-settings", userId] });
    },
  });

  return {
    session,
    userId,
    email,
    profile,
    isLoading,
    updateProfile,
  };
}
