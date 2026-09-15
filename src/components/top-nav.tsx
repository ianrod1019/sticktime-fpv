import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, Orbit, Radio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/context/auth-context";

const NAV_LINKS = [
  { to: "/features", label: "Platform" },
  { to: "/pricing", label: "Pricing" },
  { to: "/docs", label: "Resources" },
  { to: "/privacy", label: "Security" },
] as const;

/** Floating product bar used on the public surface. */
export function TopNav() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const openAuth = (mode: "login" | "signup") => {
    navigate({ to: "/", search: { showAuth: true, mode } });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <nav className="nav-scrolled mx-auto flex h-14 max-w-[1392px] items-center justify-between rounded-lg border border-white/[0.1] bg-zinc-950/60 px-3 shadow-[0_14px_50px_-26px_rgba(0,0,0,0.95)] backdrop-blur-xl backdrop-saturate-150 sm:px-4">
        <div className="flex min-w-0 items-center gap-5 lg:gap-9">
          <Link
            to="/"
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="StickTime home"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary transition-colors duration-200 group-hover:border-primary/50 group-hover:bg-primary/15">
              <Orbit className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="font-display text-base font-semibold tracking-[-0.04em] text-zinc-100">
              StickTime
            </span>
          </Link>
          <div className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map(({ to, label }) => (
              <Link
                key={label}
                to={to}
                className="rounded-md px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden items-center gap-2 border-r border-white/[0.1] pr-3 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500 sm:flex">
            <Radio className="h-3 w-3 text-primary" /> OPS ONLINE
          </div>
          {!mounted || loading ? (
            <span
              className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground sm:inline"
              role="status"
            >
              Checking session
            </span>
          ) : user ? (
            <Link to="/dashboard">
              <Button size="sm" className="h-8 rounded-md px-3 text-xs">
                Command center
              </Button>
            </Link>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden h-8 px-3 text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white sm:inline-flex"
                onClick={() => openAuth("login")}
              >
                Sign in
              </Button>
              <Button
                size="sm"
                className="hidden h-8 rounded-md px-3 text-xs sm:inline-flex"
                onClick={() => openAuth("signup")}
              >
                Start logbook
              </Button>
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-white/[0.13] bg-white/[0.03] lg:hidden"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-4 w-4" aria-hidden />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-[310px] border-l border-white/[0.1] bg-[#0c0c0f] p-0 text-zinc-100"
                >
                  <SheetHeader className="flex h-16 flex-row items-center justify-between border-b border-white/[0.08] px-5">
                    <SheetTitle className="flex items-center gap-2 font-display text-base text-zinc-100">
                      <Orbit className="h-5 w-5 text-primary" /> StickTime
                    </SheetTitle>
                    <button
                      type="button"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-md p-2 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
                      aria-label="Close navigation menu"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </SheetHeader>
                  <div className="p-4">
                    <div className="mb-5 flex items-center gap-2 rounded-md border border-primary/15 bg-primary/5 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-primary">
                      <Radio className="h-3.5 w-3.5" /> FLIGHT OPS ONLINE
                    </div>
                    <div className="flex flex-col gap-1">
                      {NAV_LINKS.map(({ to, label }) => (
                        <Link
                          key={label}
                          to={to}
                          onClick={() => setMobileOpen(false)}
                          className="rounded-md px-3 py-3 font-mono text-xs uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                        >
                          {label}
                        </Link>
                      ))}
                    </div>
                    <div className="my-5 border-t border-white/[0.08]" />
                    <Button
                      className="w-full"
                      onClick={() => {
                        setMobileOpen(false);
                        openAuth("signup");
                      }}
                    >
                      Start your logbook
                    </Button>
                    <Button
                      variant="outline"
                      className="mt-2 w-full border-white/[0.12]"
                      onClick={() => {
                        setMobileOpen(false);
                        openAuth("login");
                      }}
                    >
                      Sign in
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
