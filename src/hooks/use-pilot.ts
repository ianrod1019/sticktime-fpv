import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth-context";
import { db_request, DbRequestResult } from "@/lib/db_request";

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

  // Role/tier come from the signed JWT app_metadata claims when present
  // (set by the custom-access-token-hook edge function; verified server-side
  // on every request). The profiles query is the fallback while claims are
  // not yet provisioned — the DB remains the source of truth either way.
  const jwtRole = (session?.user?.app_metadata?.["role"] as string) ?? null;
  const jwtTier = (session?.user?.app_metadata?.["tier"] as string) ?? null;
  const hasJwtClaims = !!jwtRole;

  // Auth context is the single client-side owner of role/tier/admin state;
  // this hook only falls back to it when JWT claims are absent.
  const { userRole: ctxRole, userTier: ctxTier } = useAuth();

  // Fetch combined profile data strictly for own user id
  const { data: profile, isLoading } = useQuery({
    queryKey: ["pilot-settings", userId],
    enabled: !!userId && !hasJwtClaims,
    queryFn: async () => {
      if (!userId) return null;

      const [
        { data: settingsData, error: settingsError },
        { data: profilesData, error: profilesError },
      ]: [
        DbRequestResult<Record<string, unknown>>,
        DbRequestResult<Record<string, unknown>>,
      ] = await Promise.all([
        db_request({
          mode: "query",
          table: "pilot_settings",
          operation: "select",
          selectColumns: "*",
          filters: { user_id: userId },
          head: true,
        }),
        db_request({
          mode: "query",
          table: "profiles",
          operation: "select",
          // Live profiles table only has: id, role, tier, created_at, updated_at
          selectColumns: "id, role, tier, created_at",
          filters: { id: userId },
          head: true,
        }),
      ]);

      if (settingsError) {
        console.error("Error fetching pilot_settings:", settingsError);
      }
      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
      }

      let effectiveSettings: PilotSettings | null =
        (settingsData as unknown as PilotSettings | null) ?? null;
      if (!effectiveSettings) {
        const defaultCallsign = email
          ? (email.split("@")[0] ?? "Pilot")
          : "Pilot";
        const newSettings = {
          user_id: userId,
          weekly_goal_hours: 5,
          is_private: false,
          callsign: defaultCallsign,
          bio: "",
        };
        const { data: inserted, error: insertError } = await db_request({
          mode: "query",
          table: "pilot_settings",
          operation: "insert",
          data: newSettings,
        });

        effectiveSettings =
          !insertError && inserted
            ? (inserted as unknown as PilotSettings)
            : {
                ...newSettings,
                updated_at: new Date().toISOString(),
              };
      }

      const profilesRow =
        (profilesData as unknown as {
          id?: string;
          role?: string | null;
          tier?: string | null;
          created_at?: string;
        } | null) ?? null;

      const merged: PilotProfile = {
        id: userId,
        user_id: userId,
        weekly_goal_hours: effectiveSettings?.weekly_goal_hours ?? 5,
        is_private: effectiveSettings?.is_private ?? false,
        callsign:
          effectiveSettings?.callsign ??
          (email ? (email.split("@")[0] ?? "Pilot") : "Pilot"),
        display_name:
          effectiveSettings?.callsign ??
          (email ? (email.split("@")[0] ?? "Pilot") : "Pilot"),
        bio: effectiveSettings?.bio ?? "",
        tier: profilesRow?.tier ?? "free",
        role: profilesRow?.role ?? "user",
        accent_color: "#6366f1",
        avatar_url: null,
        created_at: profilesRow?.created_at ?? new Date().toISOString(),
        updated_at: effectiveSettings?.updated_at ?? new Date().toISOString(),
      };

      return merged;
    },
  });

  // Effective role/tier: JWT claims win; then the profile row (fetched above
  // when claims are absent); then the auth-context's resolved values.
  const effectiveRole = (
    jwtRole ??
    profile?.role ??
    ctxRole ??
    "user"
  ).toLowerCase();
  const effectiveTier = (
    jwtTier ??
    profile?.tier ??
    ctxTier ??
    "free"
  ).toLowerCase();
  const effectiveIsAdmin = effectiveRole === "admin" || effectiveRole === "dev";

  const updateProfile = useMutation({
    mutationFn: async (updates: Partial<PilotProfile>) => {
      if (!userId) throw new Error("Not authenticated");

      const allowedUpdates: Partial<PilotSettings> = {};
      if (updates.weekly_goal_hours !== undefined)
        allowedUpdates.weekly_goal_hours = updates.weekly_goal_hours;
      if (updates.is_private !== undefined)
        allowedUpdates.is_private = updates.is_private;
      if (updates.callsign !== undefined)
        allowedUpdates.callsign = updates.callsign;
      if (updates.bio !== undefined) allowedUpdates.bio = updates.bio;

      if (Object.keys(allowedUpdates).length === 0) {
        return profile;
      }

      const payload = {
        ...allowedUpdates,
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db_request({
        mode: "query",
        table: "pilot_settings",
        operation: "upsert",
        data: payload,
      });

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
    role: effectiveRole,
    tier: effectiveTier,
    isAdminOrDev: effectiveIsAdmin,
  };
}
