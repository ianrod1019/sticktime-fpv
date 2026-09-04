import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoleVerification } from "@/lib/role-verification";

export interface PilotProfile {
  id: string;
  user_id: string;
  weekly_goal_hours: number;
  is_private: boolean;
  callsign: string;
  display_name?: string | null;
  bio: string;
  tier: string;
  role?: string;
  accent_color?: string;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PilotSettings {
  user_id: string;
  weekly_goal_hours: number;
  is_private: boolean;
  callsign: string;
  bio: string;
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

  // Use centralized role verification strictly for own user id
  const { data: roleData } = useRoleVerification(userId);

  // Fetch combined profile data strictly for own user id
  const { data: profile, isLoading } = useQuery({
    queryKey: ["pilot-settings", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;

      let [{ data: settingsData, error: settingsError }, { data: profilesData, error: profilesError }] = await Promise.all([
        supabase.from("pilot_settings").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("id, role, tier, accent_color, avatar_url, display_name, created_at").eq("id", userId).maybeSingle(),
      ]);

      if (settingsError) {
        console.error("Error fetching pilot_settings:", settingsError);
      }
      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
      }

      if (!settingsData) {
        const defaultCallsign = email ? email.split("@")[0] : "Pilot";
        const newSettings = {
          user_id: userId,
          weekly_goal_hours: 5,
          is_private: false,
          callsign: defaultCallsign,
          bio: "",
        };
        const { data: inserted, error: insertError } = await supabase
          .from("pilot_settings")
          .insert(newSettings)
          .select()
          .single();

        if (!insertError && inserted) {
          settingsData = inserted;
        } else {
          settingsData = {
            ...newSettings,
            updated_at: new Date().toISOString(),
          };
        }
      }

      const merged: PilotProfile = {
        id: userId,
        user_id: userId,
        weekly_goal_hours: settingsData?.weekly_goal_hours ?? 5,
        is_private: settingsData?.is_private ?? false,
        callsign: settingsData?.callsign ?? (email ? email.split("@")[0] : "Pilot"),
        display_name: profilesData?.display_name ?? settingsData?.callsign ?? (email ? email.split("@")[0] : "Pilot"),
        bio: settingsData?.bio ?? "",
        tier: profilesData?.tier ?? "free",
        role: profilesData?.role ?? "user",
        accent_color: profilesData?.accent_color ?? "#6366f1",
        avatar_url: profilesData?.avatar_url ?? null,
        created_at: profilesData?.created_at ?? new Date().toISOString(),
        updated_at: settingsData?.updated_at ?? new Date().toISOString(),
      };

      return merged;
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: Partial<PilotProfile>) => {
      if (!userId) throw new Error("Not authenticated");

      const allowedUpdates: Partial<PilotSettings> = {};
      if (updates.weekly_goal_hours !== undefined) allowedUpdates.weekly_goal_hours = updates.weekly_goal_hours;
      if (updates.is_private !== undefined) allowedUpdates.is_private = updates.is_private;
      if (updates.callsign !== undefined) allowedUpdates.callsign = updates.callsign;
      if (updates.bio !== undefined) allowedUpdates.bio = updates.bio;

      if (Object.keys(allowedUpdates).length === 0) {
        return profile;
      }

      const payload = {
        ...allowedUpdates,
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

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
    role: roleData?.role,
    tier: roleData?.tier,
    isAdminOrDev: roleData?.isAdminOrDev ?? false,
  };
}
