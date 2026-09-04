import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserRoleTier {
  role: string;
  tier: string;
  isAdminOrDev: boolean;
  userId: string;
}

export interface AdminStatus {
  isAdminOrDev: boolean;
  userId: string;
}

/**
 * Fetches the current user's role and tier from public.profiles strictly for their own ID.
 * Cached for 15 minutes (900,000ms).
 */
export function useRoleAndTier(userId: string | undefined) {
  return useQuery<Pick<UserRoleTier, "role" | "tier" | "userId">>({
    queryKey: ["role-and-tier", userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 30,
    queryFn: async () => {
      if (!userId) throw new Error("No user ID provided");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, tier")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Profile not found");

      return {
        role: (data.role || "user").toLowerCase(),
        tier: (data.tier || "free").toLowerCase(),
        userId: data.id,
      };
    },
  });
}

/**
 * Fetches admin/dev status from public.profiles strictly for their own ID.
 * Cached for 5 minutes (300,000ms).
 */
export function useAdminStatus(userId: string | undefined) {
  return useQuery<AdminStatus>({
    queryKey: ["admin-status", userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    queryFn: async () => {
      if (!userId) throw new Error("No user ID provided");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Profile not found");

      const role = (data.role || "user").toLowerCase();
      const isAdminOrDev = role === "admin" || role === "dev";

      return {
        isAdminOrDev,
        userId: data.id,
      };
    },
  });
}

/**
 * Combined hook for role verification using strict self-ID matching.
 */
export function useRoleVerification(userId: string | undefined) {
  const roleAndTier = useRoleAndTier(userId);
  const adminStatus = useAdminStatus(userId);

  return {
    data: roleAndTier.data && adminStatus.data
      ? {
          role: roleAndTier.data.role,
          tier: roleAndTier.data.tier,
          isAdminOrDev: adminStatus.data.isAdminOrDev,
          userId: roleAndTier.data.userId,
        }
      : undefined,
    isLoading: roleAndTier.isLoading || adminStatus.isLoading,
    isError: roleAndTier.isError || adminStatus.isError,
    error: roleAndTier.error || adminStatus.error,
    refetch: () => {
      roleAndTier.refetch();
      adminStatus.refetch();
    },
    roleAndTier,
    adminStatus,
  };
}

export function isAdminOrDev(role: string | undefined): boolean {
  return role?.toLowerCase() === "admin" || role?.toLowerCase() === "dev";
}

export function isProOrHigher(tier: string | undefined, role: string | undefined): boolean {
  if (isAdminOrDev(role)) return true;
  const t = tier?.toLowerCase();
  return t === "pro" || t === "premium";
}

export function isAdmin(role: string | undefined): boolean {
  return isAdminOrDev(role);
}

export function requireAdmin(role: string | undefined): void {
  if (!isAdmin(role)) {
    throw new Error("Admin access required");
  }
}

export function requirePro(role: string | undefined, tier: string | undefined): void {
  if (!isProOrHigher(tier, role)) {
    throw new Error("Pro subscription required");
  }
}

export async function verifyAdminAccess(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return false;

  const role = (data.role || "user").toLowerCase();
  return data.id === userId && (role === "admin" || role === "dev");
}
