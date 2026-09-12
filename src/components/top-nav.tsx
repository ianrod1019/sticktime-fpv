import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DroneIcon } from "@/components/icons";
import { useAuth } from "@/context/auth-context";

const NAV_LINKS = [
  { to: "/dashboard", label: "Features" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

export function TopNav() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Auth state comes from localStorage-backed Supabase sessions, so it can
  // differ between server render and client hydration. Render the signed-out
  // UI during SSR/hydration, then let the client state take over — avoids a
  // React hydration mismatch without leaking auth decisions into the markup.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const openAuth = (mode: "login" | "signup") => {
    navigate({ to: "/", search: { showAuth: true, mode } });
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-background/70 backdrop-blur-xl backdrop-saturate-150 border-b border-border/70">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2">
          <DroneIcon className="h-8 w-8 text-primary" aria-hidden />
          <span className="text-xl font-bold">StickTime FPV</span>
        </Link>
        <div className="hidden md:flex space-x-6">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={label}
              to={to}
              className="text-foreground hover:text-primary transition-colors font-mono text-sm"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!mounted || loading ? (
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            role="status"
            aria-label="Loading"
          />
        ) : user ? (
          <Link to="/dashboard">
            <Button variant="default" size="sm">
              Dashboard
            </Button>
          </Link>
        ) : (
          <>
            <Button
              variant="default"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => openAuth("login")}
            >
              Sign in
            </Button>
            {/* Mobile nav */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle>StickTime FPV</SheetTitle>
                </SheetHeader>
                <div className="mt-4 flex flex-col gap-1">
                  {NAV_LINKS.map(({ to, label }) => (
                    <Link
                      key={label}
                      to={to}
                      onClick={() => setMobileOpen(false)}
                      className="rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      {label}
                    </Link>
                  ))}
                  <div className="my-3 border-t border-border" />
                  <Button
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
  );
}
