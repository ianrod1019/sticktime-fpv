import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Timer,
  Wrench,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePilot } from "@/hooks/use-pilot";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV = [
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
      {/* Central body */}
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
      {/* Rotors / Arms */}
      <line x1="4" y1="4" x2="9" y2="9" />
      <line x1="20" y1="4" x2="15" y2="9" />
      <line x1="4" y1="20" x2="9" y2="15" />
      <line x1="20" y1="20" x2="15" y2="15" />
      {/* Propeller circles */}
      <circle cx="3.5" cy="3.5" r="2" />
      <circle cx="20.5" cy="3.5" r="2" />
      <circle cx="3.5" cy="20.5" r="2" />
      <circle cx="20.5" cy="20.5" r="2" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = usePilot();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Link to="/dashboard" className="mb-8 flex items-center gap-2.5 px-2 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 group-hover:bg-primary/20 transition-colors">
            <DroneIcon className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">StickTime</span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                pathname === to && "bg-sidebar-accent text-primary",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-4 rounded-lg border border-sidebar-border bg-card/60 p-3">
          <div className="flex items-center justify-between">
            <span className="truncate font-mono text-xs">
              {profile?.callsign || profile?.display_name || "Pilot"}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              PILOT
            </Badge>
          </div>
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={signOut}>
            <LogOut className="mr-1 h-3 w-3" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <DroneIcon className="h-4 w-4" />
            </div>
            <span className="font-display font-bold tracking-tight">StickTime</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 lg:hidden">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground",
                pathname === to && "bg-accent text-primary",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-glow">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
