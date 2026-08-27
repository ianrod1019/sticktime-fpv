import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Accent } from "@/lib/fpv";

export type Profile = {
  id: string;
  display_name: string | null;
  callsign: string | null;
  bio: string | null;
  is_private: boolean;
  accent_color: string;
  weekly_goal_hours: number;
  subscription_tier: string;
};

export function usePilot() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pilot"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      return {
        userId: user.id,
        email: user.email ?? "",
        profile: (profile ?? null) as Profile | null,
        roles: (roles ?? []).map((r) => r.role as string),
      };
    },
  });

  const accent = query.data?.profile?.accent_color ?? "ember";
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-accent", accent);
    }
  }, [accent]);

  const isPro =
    query.data?.profile?.subscription_tier === "pro" ||
    (query.data?.roles.includes("pro_user") ?? false);

  const updateProfile = useMutation({
    mutationFn: async (patch: Partial<Profile> & { accent_color?: Accent }) => {
      const id = query.data?.userId;
      if (!id) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pilot"] }),
  });

  return {
    ...query,
    userId: query.data?.userId ?? null,
    email: query.data?.email ?? "",
    profile: query.data?.profile ?? null,
    roles: query.data?.roles ?? [],
    isPro,
    isTeamAdmin: query.data?.roles.includes("team_admin") ?? false,
    updateProfile,
  };
}
