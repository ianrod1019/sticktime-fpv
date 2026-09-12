import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePilot } from "@/hooks/use-pilot";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { purgePersistedCache } from "@/lib/query-client";
import { useRealtimeInvalidation } from "@/lib/realtime-invalidation";
import { SidebarNavigation } from "@/components/sidebar";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {action}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { profile, isAdminOrDev } = usePilot();
  const { user, signOut: authSignOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Live catch-up: realtime events invalidate affected caches app-wide.
  useRealtimeInvalidation(user?.id ?? profile?.id ?? null);

  const isAdminRoute = pathname.startsWith("/admin");

  // Single source of truth for admin status: usePilot (JWT claims, falling
  // back to the profiles-backed role verification). No separate fetch here.
  const effectiveAdmin = isAdminOrDev;

  useEffect(() => {
    if (isAdminRoute && !!user && !effectiveAdmin) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isAdminRoute, user, effectiveAdmin, navigate]);

  async function signOut() {
    // Purge the local caches (persisted storage + memory) so the next user
    // on this machine can never see the previous one's data.
    purgePersistedCache();
    queryClient.clear();
    await authSignOut();
    navigate({ to: "/", replace: true });
  }

  if (isAdminRoute && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-mono text-xs text-muted-foreground tracking-wider uppercase">
            Verifying Security Clearance...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen md:flex relative">
      <div className="fixed left-0 inset-y-0 w-20 bg-sidebar border-r border-sidebar-border p-4 z-20">
        <SidebarNavigation
          isClientReady={true}
          effectiveAdmin={effectiveAdmin}
          profile={profile}
        />
      </div>

      <div className="flex-1 pl-20">
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
