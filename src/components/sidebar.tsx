import { Link, useRouterState } from "@tanstack/react-router";
import { PilotProfile } from "@/hooks/use-pilot";
import {
  LayoutDashboard,
  Timer,
  Wrench,
  Boxes,
  CircleDollarSign,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { DroneIcon } from "@/components/icons";

const BASE_NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/log", icon: Timer, label: "Flight Logs" },  { to: "/hanger", icon: Wrench, label: "Gear Hanger" },
  { to: "/gear/inventory", icon: Boxes, label: "Bench Inventory" },
  { to: "/gear/ledger", icon: CircleDollarSign, label: "Cost Ledger" },
  { to: "/squadron", icon: Users, label: "Squadrons" },
] as const;

export function SidebarNavigation({
  isClientReady,
  effectiveAdmin,
  profile,
}: {
  isClientReady: boolean;
  effectiveAdmin: boolean;
  profile: PilotProfile | null | undefined;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { signOut } = useAuth();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col overflow-hidden">
        <Link to="/" className="mb-8 flex items-center justify-center px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            <DroneIcon className="h-5 w-5" aria-hidden />
          </div>
        </Link>

        <nav
          className="flex flex-1 flex-col gap-1"
          aria-label="Main navigation"
        >
          {BASE_NAV.map(({ to, icon: Icon, label }) => (
            <Tooltip key={to}>
              <TooltipTrigger asChild>
                <Link
                  to={to}
                  aria-label={label}
                  aria-current={pathname === to ? "page" : undefined}
                  className={cn(
                    "relative flex items-center justify-center rounded-md px-3 py-2 transition-colors duration-200",
                    pathname === to
                      ? "bg-sidebar-accent text-primary font-semibold shadow-[inset_0_0_0_1px_oklch(0.72_0.19_35/0.18),0_0_12px_-4px_var(--primary)]"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {pathname === to && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-primary"
                      aria-hidden
                    />
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ))}

          {isClientReady && effectiveAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/admin"
                  aria-label="Admin"
                  aria-current={pathname === "/admin" ? "page" : undefined}
                  className={cn(
                    "relative flex items-center justify-center rounded-md px-3 py-2 transition-colors duration-200",
                    pathname === "/admin"
                      ? "bg-sidebar-accent text-primary font-semibold shadow-[inset_0_0_0_1px_oklch(0.72_0.19_35/0.18),0_0_12px_-4px_var(--primary)]"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                  {pathname === "/admin" && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-primary"
                      aria-hidden
                    />
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Admin</TooltipContent>
            </Tooltip>
          )}
        </nav>

        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/settings"
              aria-label="Settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={cn(
                "relative flex items-center justify-center rounded-md px-3 py-2 transition-colors duration-200",
                pathname === "/settings"
                  ? "bg-sidebar-accent text-primary shadow-[inset_0_0_0_1px_oklch(0.72_0.19_35/0.18),0_0_12px_-4px_var(--primary)]"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
              )}
            >
              <Settings className="h-4 w-4 shrink-0" aria-hidden />
              {pathname === "/settings" && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-primary"
                  aria-hidden
                />
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mt-2 flex items-center justify-center rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label="Sign out"
              onClick={() => signOut()}
            >
              <LogOut
                className="h-4 w-4 shrink-0 text-sidebar-foreground/70"
                aria-hidden
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Sign out</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
