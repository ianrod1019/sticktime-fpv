import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Timer,
  Wrench,
  Users,
  Settings,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { usePilot } from "@/hooks/use-pilot";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const BASE_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/log", label: "Flight Logs", icon: Timer },
  { to: "/garage", label: "Garage", icon: Wrench },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function DroneIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
      <line x1="4" y1="4" x2="9" y2="9" />
      <line x1="20" y1="4" x2="15" y2="9" />
      <line x1="4" y1="20" x2="9" y2="15" />
      <line x1="20" y1="20" x2="15" y2="15" />
      <circle cx="3.5" cy="3.5" r="2" />
      <circle cx="20.5" cy="3.5" r="2" />
      <circle cx="3.5" cy="20.5" r="2" />
      <circle cx="20.5" cy="20.5" r="2" />
    </svg>
  );
}

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
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = usePilot();
  const { user, signOut: authSignOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [isAdminAllowed, setIsAdminAllowed] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAdminStatus() {
      if (!user?.id) {
        if (isMounted) setIsAdminAllowed(false);
        return;
      }

      const roleCacheKey = `sticktime_user_role_${user.id}`;
      const cacheTimestampKey = `${roleCacheKey}_ts`;
      const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

      try {
        const cachedRole = sessionStorage.getItem(roleCacheKey);
        const cachedTimestamp = sessionStorage.getItem(cacheTimestampKey);
        const now = Date.now();

        if (cachedRole !== null && cachedTimestamp !== null) {
          const age = now - Number(cachedTimestamp);
          if (age < CACHE_TTL_MS) {
            if (isMounted) {
              const roleLower = cachedRole.toLowerCase();
              setIsAdminAllowed(roleLower === "admin" || roleLower === "dev");
            }
            return;
          }
        }

        let resolvedRole = "user";

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!error && data?.role) {
          resolvedRole = data.role;
        } else {
          const { data: rpcData, error: rpcError } = await supabase.rpc("check_is_admin");
          if (!rpcError && rpcData === true) {
            resolvedRole = "admin";
          }
        }

        const roleLower = resolvedRole.toLowerCase();
        const allowed = roleLower === "admin" || roleLower === "dev";

        if (isMounted) {
          setIsAdminAllowed(allowed);
        }

        sessionStorage.setItem(roleCacheKey, resolvedRole);
        sessionStorage.setItem(cacheTimestampKey, String(now));
      } catch (err) {
        console.error("Admin check error:", err);
        if (isMounted) setIsAdminAllowed(false);
      }
    }

    checkAdminStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  async function signOut() {
    sessionStorage.clear();
    await authSignOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Link to="/dashboard" className="mb-8 flex items-center gap-2.5 px-2 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 group-hover:bg-primary/20 transition-colors">
            <DroneIcon className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">StickTime</span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {BASE_NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                pathname === to && "bg-sidebar-accent text-primary font-semibold"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}

          {/* 🛡️ ADMIN PANEL (DESKTOP SIDEBAR - ALIGNED NEXT TO SETTINGS) */}
          {isAdminAllowed && (
            <Link
              to="/admin"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                pathname === "/admin" && "bg-sidebar-accent text-primary font-semibold"
              )}
            >
              <ShieldCheck className="h-4 w-4 text-primary" />
              Admin Panel
            </Link>
          )}
        </nav>

        <div className="mt-4 rounded-lg border border-sidebar-border bg-card/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="truncate font-mono text-xs">
              {profile?.callsign || profile?.display_name || "Pilot"}
            </span>
            <Badge variant="default" className="text-[10px]">
              {profile?.role?.toUpperCase() || "PILOT"}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-foreground" onClick={signOut}>
            <LogOut className="mr-1 h-3 w-3" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <DroneIcon className="h-4 w-4" />
            </div>
            <span className="font-display font-bold tracking-tight">StickTime</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Mobile Nav Bar */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 lg:hidden">
          {BASE_NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground",
                pathname === to && "bg-accent text-primary font-semibold"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}

          {/* 🛡️ ADMIN PANEL (MOBILE NAV - ALIGNED NEXT TO SETTINGS) */}
          {isAdminAllowed && (
            <Link
              to="/admin"
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground",
                pathname === "/admin" && "bg-accent text-primary font-semibold"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Admin Panel
            </Link>
          )}
        </nav>

        {/* Desktop Header */}
        <header className="hidden lg:sticky lg:top-0 lg:z-30 lg:flex lg:items-center lg:justify-between lg:border-b lg:border-border lg:bg-background/85 lg:px-8 lg:py-3 lg:backdrop-blur">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 group-hover:bg-primary/20 transition-colors">
              <DroneIcon className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">StickTime</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
