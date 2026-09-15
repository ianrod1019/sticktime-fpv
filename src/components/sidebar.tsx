import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PilotProfile } from "@/hooks/use-pilot";
import {
  LayoutDashboard,
  Timer,
  Wrench,
  CalendarClock,
  Boxes,
  CircleDollarSign,
  Users,
  ActivitySquare,
  ShieldCheck,
  Settings,
  LogOut,
  BookOpen,
  Command,
  ChevronRight,
  ChevronsUpDown,
  Search,
  Building2,
  Briefcase,
  Orbit,
  FlaskConical,
  CircuitBoard,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { db_request } from "@/lib/db_request";
import { useAuth } from "@/context/auth-context";

const PRIMARY_NAV = [
  {
    to: "/dashboard",
    icon: LayoutDashboard,
    label: "Overview",
    detail: "Fleet command",
  },
  {
    to: "/log",
    icon: Timer,
    label: "Flight logs",
    detail: "Sessions & hours",
  },
  {
    to: "/scheduling",
    icon: CalendarClock,
    label: "Scheduling",
    detail: "Dispatch board",
  },
  {
    to: "/hanger",
    icon: Wrench,
    label: "Fleet hanger",
    detail: "Airframes & service",
  },
  {
    to: "/gear/inventory",
    icon: Boxes,
    label: "Bench inventory",
    detail: "Parts & stock",
  },
  {
    to: "/analytics",
    icon: ActivitySquare,
    label: "Analytics",
    detail: "Failure intelligence",
  },
  {
    to: "/ledger",
    icon: CircleDollarSign,
    label: "Cost ledger",
    detail: "Spend & utilization",
  },
  {
    to: "/squadron",
    icon: Users,
    label: "Squadrons",
    detail: "People & permissions",
  },
  {
    to: "/jha",
    icon: ClipboardCheck,
    label: "Pre-flight JHA",
    detail: "Hazard checklist",
  },
  {
    to: "/firmware",
    icon: CircuitBoard,
    label: "Firmware",
    detail: "Config & airworthiness",
  },
] as const;

function navMatch(to: string, pathname: string): boolean {
  if (pathname === to || pathname.startsWith(`${to}/`)) return true;
  if (to === "/squadron" && pathname.startsWith("/squadron/")) return true;
  if (
    to === "/gear/inventory" &&
    pathname.startsWith("/squadron/") &&
    pathname.endsWith("/inventory")
  )
    return true;
  if (
    to === "/analytics" &&
    pathname.startsWith("/squadron/") &&
    pathname.endsWith("/analytics")
  )
    return true;
  return false;
}

export function SidebarNavigation({
  isClientReady,
  effectiveAdmin,
  canAccessDevConsole,
  profile,
  qaMode = false,
}: {
  isClientReady: boolean;
  /** admin/dev only — gates the Admin console link. */
  effectiveAdmin: boolean;
  /** admin/dev/tester — matches the /dev route's access check. */
  canAccessDevConsole: boolean;
  profile: PilotProfile | null | undefined;
  /** QA mode active — show the badge so testers never mistake fixtures for real data. */
  qaMode?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { signOut } = useAuth();
  const callsign = profile?.callsign || "Pilot";

  // Enterprise members get the District HQ entry. Server-resolved: the
  // discovery RPC returns rows only for enterprise org memberships, so
  // non-enterprise users never see the item (and the route re-checks).
  const { data: enterpriseMemberships } = useQuery({
    queryKey: ["enterprises", "my-enterprises"],
    staleTime: 60_000,
    enabled: isClientReady,
    queryFn: async (): Promise<unknown[]> => {
      const res = await db_request({
        mode: "rpc",
        rpcFunction: "get_my_enterprises",
      });
      if (res.error) throw res.error;
      return (res.data ?? []) as unknown[];
    },
  });
  const showDistrictNav = (enterpriseMemberships?.length ?? 0) > 0;
  const navItem = (item: (typeof PRIMARY_NAV)[number]) => {
    const active = navMatch(item.to, pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200",
          active
            ? "border border-primary/20 bg-primary/[0.1] text-zinc-100 shadow-[0_0_22px_-14px_var(--primary)]"
            : "text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200",
        )}
      >
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-md border",
            active
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-white/[0.08] bg-white/[0.025] text-zinc-500 group-hover:text-zinc-300",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
            {item.label}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-zinc-600">
            {item.detail}
          </span>
        </span>
        {active && <ChevronRight className="h-3.5 w-3.5 text-primary" />}
      </Link>
    );
  };

  return (
    <aside className="flex h-full flex-col">
      <Link
        to="/"
        className="mb-3 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]"
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
          <Orbit className="h-5 w-5" />
        </span>
        <span>
          <span className="block font-display text-base font-semibold tracking-[-0.04em] text-zinc-100">
            StickTime
          </span>
          <span className="mt-0.5 block font-mono text-[8px] tracking-[0.18em] text-primary">
            FLIGHT OPS
          </span>
        </span>
      </Link>
      <button
        type="button"
        className="mb-3 flex w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-left hover:bg-white/[0.05]"
      >
        <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary">
          <Command className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-zinc-200">
            StickTime Workspace
          </span>
          <span className="block font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
            Personal + squadron
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-600" />
      </button>
      <div className="mb-4 flex items-center gap-2 rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-1.5">
        <Search className="h-3 w-3 text-zinc-600" />
        <span className="font-mono text-[9px] text-zinc-600">
          Search workspace
        </span>
        <kbd className="ml-auto rounded border border-white/10 px-1 font-mono text-[8px] text-zinc-600">
          ⌘K
        </kbd>
      </div>
      <nav
        className="min-h-0 flex-1 space-y-1 overflow-y-auto"
        aria-label="Main navigation"
      >
        <p className="mb-2 px-3 font-mono text-[9px] tracking-[0.18em] text-zinc-700">
          OPERATIONS
        </p>
        {PRIMARY_NAV.map(navItem)}
        {isClientReady && showDistrictNav && (
          <>
            <Link
              to="/district"
              className={cn(
                "group mt-4 flex items-center gap-3 rounded-lg border px-3 py-2.5",
                pathname.startsWith("/district")
                  ? "border-primary/20 bg-primary/[0.1] text-zinc-100"
                  : "border-transparent text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200",
              )}
            >
              <span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025]">
                <Building2 className="h-4 w-4" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                District HQ
              </span>
            </Link>
            <Link
              to="/clients"
              className={cn(
                "group flex items-center gap-3 rounded-lg border px-3 py-2.5",
                pathname.startsWith("/clients")
                  ? "border-primary/20 bg-primary/[0.1] text-zinc-100"
                  : "border-transparent text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200",
              )}
            >
              <span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025]">
                <Briefcase className="h-4 w-4" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Client jobs
              </span>
            </Link>
          </>
        )}
        {isClientReady && effectiveAdmin && (
          <Link
            to="/admin"
            className={cn(
              "group mt-4 flex items-center gap-3 rounded-lg border px-3 py-2.5",
              pathname.startsWith("/admin")
                ? "border-primary/20 bg-primary/[0.1] text-zinc-100"
                : "border-transparent text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200",
            )}
          >
            <span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
              Admin console
            </span>
          </Link>
        )}
        {isClientReady && canAccessDevConsole && (
          <Link
            to="/dev"
            className={cn(
              "group flex items-center gap-3 rounded-lg border px-3 py-2.5",
              pathname.startsWith("/dev")
                ? "border-primary/20 bg-primary/[0.1] text-zinc-100"
                : "border-transparent text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200",
            )}
          >
            <span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025]">
              <FlaskConical className="h-4 w-4" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
              Dev & QA console
            </span>
          </Link>
        )}
      </nav>
      <div className="shrink-0 space-y-1 border-t border-white/[0.08] pt-4">
        <Link
          to="/docs/$slug"
          params={{ slug: "introduction" }}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-zinc-500 transition-colors hover:bg-white/[0.045] hover:text-zinc-200"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025]">
            <BookOpen className="h-4 w-4" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
            Operations docs
          </span>
        </Link>
        <Link
          to="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-zinc-500 transition-colors hover:bg-white/[0.045] hover:text-zinc-200"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025]">
            <Settings className="h-4 w-4" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
            Settings
          </span>
        </Link>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 font-mono text-xs text-primary">
            {callsign.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-zinc-300">
              {callsign}
            </span>
            <span className="mt-0.5 block font-mono text-[8px] tracking-[0.12em] text-zinc-600">
              {qaMode ? (
                <span className="font-mono text-[8px] tracking-[0.12em] text-warning">
                  QA MODE — FAKE DATA
                </span>
              ) : (
                "PILOT ACCOUNT"
              )}
            </span>
          </span>
          <button
            type="button"
            onClick={() => signOut()}
            aria-label="Sign out"
            className="text-zinc-600 transition-colors hover:text-primary"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
