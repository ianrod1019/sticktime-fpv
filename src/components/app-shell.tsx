import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, Orbit, Search, X } from "lucide-react";
import { usePilot } from "@/hooks/use-pilot";
import { useAuth } from "@/context/auth-context";
import { purgePersistedCache } from "@/lib/query-client";
import { useRealtimeInvalidation } from "@/lib/realtime-invalidation";
import { SidebarNavigation } from "@/components/sidebar";
import { AmbientBackdrop } from "@/components/three/ambient-backdrop";
import { Button } from "@/components/ui/button";
import { useQaMode } from "@/hooks/use-qa-mode";
import { clearQaMode } from "@/lib/qa-mode";
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
    <div className="mb-7 flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 font-mono text-[9px] tracking-[0.2em] text-primary">
          FLIGHT OPERATIONS / LIVE WORKSPACE
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.045em] text-zinc-100 sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
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
  const [mobileNav, setMobileNav] = useState(false);
  useRealtimeInvalidation(user?.id ?? profile?.id ?? null);
  const isAdminRoute = pathname.startsWith("/admin");
  const effectiveAdmin = isAdminOrDev;
  // The /dev route admits admin/dev/tester; the sidebar link must match or
  // testers who can reach the console by URL get no visible entry point.
  const canAccessDevConsole =
    effectiveAdmin || profile?.role === "tester";
  const qaMode = useQaMode();

  useEffect(() => {
    if (isAdminRoute && !!user && !effectiveAdmin)
      navigate({ to: "/dashboard", replace: true });
  }, [isAdminRoute, user, effectiveAdmin, navigate]);

  async function signOut() {
    purgePersistedCache();
    queryClient.clear();
    clearQaMode();
    await authSignOut();
    navigate({ to: "/", replace: true });
  }

  if (isAdminRoute && !user)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Verifying security clearance...
          </p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#08080a] md:pl-[232px]">
      {qaMode && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 bg-warning/70" />
      )}
      <AmbientBackdrop />
      <div className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-white/[0.08] bg-[#0b0b0e]/92 px-3 py-4 backdrop-blur-xl md:block">
        <SidebarNavigation
          isClientReady={true}
          effectiveAdmin={effectiveAdmin}
          canAccessDevConsole={canAccessDevConsole}
          profile={profile}
          qaMode={qaMode}
        />
      </div>
      <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/[0.08] bg-[#0b0b0e]/88 px-4 backdrop-blur-xl md:hidden">
        <button
          type="button"
          onClick={() => setMobileNav(true)}
          className="rounded-md border border-white/[0.1] p-2 text-zinc-400"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
            <Orbit className="h-4 w-4" />
          </span>
          <span className="font-display font-semibold text-zinc-100">
            StickTime
          </span>
        </Link>
        <div
          className="rounded-md border border-white/[0.1] p-2 text-zinc-600"
          aria-label="Search workspace is available from the desktop sidebar"
          role="status"
        >
          <Search className="h-4 w-4" />
        </div>
      </div>
      {mobileNav && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="relative h-full w-[290px] border-r border-white/[0.1] bg-[#0b0b0e] px-4 py-5">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => setMobileNav(false)}
                className="rounded-md p-2 text-zinc-500 hover:text-zinc-100"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNavigation
              isClientReady={true}
              effectiveAdmin={effectiveAdmin}
              canAccessDevConsole={canAccessDevConsole}
              profile={profile}
              qaMode={qaMode}
            />
          </div>
        </div>
      )}
      <main className="relative mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
