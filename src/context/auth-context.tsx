import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  userTier: string | null;
  isAdminOrDev: boolean;
  signOut: () => Promise<void>;
  refreshRoleAndTier: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  userRole: null,
  userTier: null,
  isAdminOrDev: false,
  signOut: async () => {},
  refreshRoleAndTier: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<string | null>(null);
  const [isAdminOrDev, setIsAdminOrDev] = useState<boolean>(false);
  const queryClient = useQueryClient();

  const fetchRoleAndTier = useCallback(async (userId: string) => {
    try {
      // 1. Query profiles table
      const { data, error } = await db_request({
        mode: "query",
        table: "profiles",
        operation: "select",
        selectColumns: "role, tier, subscription_tier",
        filters: { id: userId },
        head: true,
      });

      if (error) {
        console.error("Error fetching role/tier for user:", userId, error);
      }

      let resolvedRole = "user";
      let resolvedTier = "free";

      if (data) {
        resolvedRole = (data.role || "user").toLowerCase();
        resolvedTier = (
          data.tier ||
          data.subscription_tier ||
          "free"
        ).toLowerCase();
      }

      // 2. Fallback check via RPC if role is still user
      if (resolvedRole === "user") {
        try {
          const { data: rpcData, error: rpcError } =
            await supabase.rpc("check_is_admin");
          if (!rpcError && rpcData === true) {
            resolvedRole = "admin";
          }
        } catch (rpcErr) {
          console.warn("check_is_admin RPC failed in auth-context:", rpcErr);
        }
      }

      const isAdm = resolvedRole === "admin" || resolvedRole === "dev";
      setUserRole(resolvedRole);
      setUserTier(resolvedTier);
      setIsAdminOrDev(isAdm);

      // Cache locally for instant reads
      try {
        sessionStorage.setItem(`sticktime_user_role_${userId}`, resolvedRole);
        sessionStorage.setItem(
          `sticktime_user_role_ts_${userId}`,
          String(Date.now()),
        );
      } catch {}
    } catch (err) {
      console.error("Exception fetching role/tier:", err);
      setUserRole("user");
      setUserTier("free");
      setIsAdminOrDev(false);
    }
  }, []);

  const refreshRoleAndTier = useCallback(async () => {
    if (user?.id) {
      await queryClient.invalidateQueries({
        queryKey: ["role-and-tier", user.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-status", user.id],
      });
      await fetchRoleAndTier(user.id);
    }
  }, [user?.id, queryClient, fetchRoleAndTier]);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      try {
        const {
          data: { session: activeSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Error getting initial session:", error);
        }

        if (mounted) {
          if (activeSession?.user) {
            setSession(activeSession);
            setUser(activeSession.user);
            await fetchRoleAndTier(activeSession.user.id);
          } else {
            setSession(null);
            setUser(null);
          }
        }
      } catch (err) {
        console.error("Exception in initializeAuth:", err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        await fetchRoleAndTier(currentSession.user.id);
      } else {
        setUserRole(null);
        setUserTier(null);
        setIsAdminOrDev(false);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRoleAndTier]);

  const signOut = async () => {
    try {
      sessionStorage.clear();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out:", err);
    } finally {
      setUser(null);
      setSession(null);
      setUserRole(null);
      setUserTier(null);
      setIsAdminOrDev(false);
      queryClient.clear();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        userRole,
        userTier,
        isAdminOrDev,
        signOut,
        refreshRoleAndTier,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
