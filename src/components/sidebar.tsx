import { Link, useRouterState } from "@tanstack/react-router";
import { PilotProfile } from "@/hooks/use-pilot";
import {
  LayoutDashboard,
  Timer,
  Wrench,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
  BarChart3,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";

const BASE_NAV = [
  { to: "/dashboard", icon: LayoutDashboard },
  { to: "/log", icon: Timer },
  { to: "/hanger", icon: Wrench },
  { to: "/ledger", icon: BarChart3 },
  { to: "/squadron", icon: Users },
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
    <div className="flex h-full flex-col overflow-hidden">
      <Link to="/" className="mb-8 flex items-center justify-center px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
          <DroneIcon className="h-5 w-5" />
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {BASE_NAV.map(({ to, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex items-center justify-center rounded-md px-3 py-2 transition-colors",
              pathname === to && "bg-sidebar-accent text-primary font-semibold",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
          </Link>
        ))}

        {isClientReady && effectiveAdmin && (
          <Link
            to="/admin"
            className={cn(
              "flex items-center justify-center rounded-md px-3 py-2 transition-colors",
              pathname === "/admin" &&
                "bg-sidebar-accent text-primary font-semibold",
            )}
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          </Link>
        )}
      </nav>

      <Link
        to="/settings"
        className={cn(
          "flex items-center justify-center rounded-md px-3 py-2 transition-colors",
          pathname === "/settings" &&
            "bg-sidebar-accent text-primary font-semibold",
        )}
      >
        <Settings className="h-4 w-4 shrink-0 text-sidebar-foreground/70" />
      </Link>

      <button
        type="button"
        className="mt-2 flex items-center justify-center rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() => signOut()}
      >
        <LogOut className="h-4 w-4 shrink-0 text-sidebar-foreground/70" />
      </button>
    </div>
  );
}
