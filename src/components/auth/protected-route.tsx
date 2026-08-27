import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/auth-context";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: AppRole[];
  fallbackPath?: string;
  unauthorizedPath?: string;
  loadingFallback?: ReactNode;
};

export function ProtectedRoute({
  children,
  allowedRoles,
  fallbackPath = "/auth",
  unauthorizedPath = "/dashboard",
  loadingFallback = (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="label-mono">Checking authorization…</p>
    </main>
  ),
}: ProtectedRouteProps) {
  const navigate = useNavigate();
  const { user, loading, hasAnyRole } = useAuth();

  const isAuthorized = !allowedRoles?.length || hasAnyRole(allowedRoles);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate({ to: fallbackPath, replace: true });
      return;
    }

    if (!isAuthorized) {
      navigate({ to: unauthorizedPath, replace: true });
    }
  }, [fallbackPath, isAuthorized, loading, navigate, unauthorizedPath, user]);

  if (loading) return loadingFallback;
  if (!user || !isAuthorized) return null;
  return <>{children}</>;
}
