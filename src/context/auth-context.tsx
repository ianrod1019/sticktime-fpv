import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
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
      // STRICTLY check own user id on public.profiles using column 'tier' and 'role'
      const { data, error } = await supabase
        .from("profiles")
        .select("role, tier")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching role/tier for user:", userId, error);
      }

      if (data) {
        const role = (data.role || "user").toLowerCase();
        const tier = (data.tier || "free").toLowerCase();
        setUserRole(role);
        setUserTier(tier);
        setIsAdminOrDev(role === "admin" || role === "dev");
      } else {
        setUserRole("user");
        setUserTier("free");
        setIsAdminOrDev(false);
      }
    } catch (err) {
      console.error("Exception fetching role/tier:", err);
      setUserRole("user");
      setUserTier("free");
      setIsAdminOrDev(false);
    }
  }, []);

  const refreshRoleAndTier = useCallback(async () => {
    if (user?.id) {
      await queryClient.invalidateQueries({ queryKey: ["role-and-tier", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin-status", user.id] });
      await fetchRoleAndTier(user.id);
    }
  }, [user?.id, queryClient, fetchRoleAndTier]);

  useEffect(() => {
    let mounted = true;

    async function getInitialSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Error getting session:", error);
        }
        if (mounted && session?.user) {
          setSession(session);
          setUser(session.user);
          await fetchRoleAndTier(session.user.id);
        }
      } catch (err) {
        console.error("Exception in getInitialSession:", err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    getInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            await fetchRoleAndTier(session.user.id);
          } else {
            setUserRole(null);
            setUserTier(null);
            setIsAdminOrDev(false);
          }
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRoleAndTier]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setUserTier(null);
    setIsAdminOrDev(false);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, userTier, isAdminOrDev, signOut, refreshRoleAndTier }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
