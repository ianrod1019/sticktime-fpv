import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { usePilot } from "@/hooks/use-pilot";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
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
  const { user, isAdminOrDev: authIsAdminOrDev, signOut: authSignOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [isAdminAllowed, setIsAdminAllowed] = useState<boolean>(authIsAdminOrDev);
  const [isClientReady, setIsClientReady] = useState<boolean>(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState<boolean>(true);

  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    if (authIsAdminOrDev) {
      setIsAdminAllowed(true);
      setIsCheckingAdmin(false);
      return;
    }

    let isMounted = true;

    async function checkAdminStatus() {
      if (!user?.id) {
        if (isMounted) {
          setIsAdminAllowed(false);
          setIsCheckingAdmin(false);
        }
        return;
      }

      try {
        let allowed = false;

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!error && data?.role) {
          const r = data.role.toLowerCase();
          if (r === "admin" || r === "dev") {
            allowed = true;
          }
        }

        if (!allowed) {
          const { data: rpcData, error: rpcError } = await supabase.rpc("check_is_admin");
          if (!rpcError && rpcData === true) {
            allowed = true;
          }
        }

        if (isMounted) {
          setIsAdminAllowed(allowed);
          setIsCheckingAdmin(false);
        }

        if (isAdminRoute && !allowed) {
          navigate({ to: "/dashboard", replace: true });
        }
      } catch (err) {
        console.error("Admin check error in AppShell:", err);
        if (isMounted) {
          setIsAdminAllowed(authIsAdminOrDev);
          setIsCheckingAdmin(false);
        }
        if (isAdminRoute && !authIsAdminOrDev) {
          navigate({ to: "/dashboard", replace: true });
        }
      }
    }

    checkAdminStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.id, pathname, navigate, isAdminRoute, authIsAdminOrDev]);

  async function signOut() {
    sessionStorage.clear();
    await authSignOut();
    navigate({ to: "/", replace: true });
  }

  const effectiveAdmin = Boolean(isAdminAllowed || authIsAdminOrDev || (profile?.role && ["admin", "dev"].includes(profile.role.toLowerCase())));

  if (isAdminRoute && isCheckingAdmin && !effectiveAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-mono text-xs text-muted-foreground tracking-wider uppercase">Verifying Security Clearance...</p>
        </div>
      </div>
    );
  }

return (
     <div className="min-h-screen md:flex relative">
       <div className="fixed left-0 inset-y-0 w-20 bg-sidebar border-r border-sidebar-border p-4 z-20">
         <SidebarNavigation
           isClientReady={isClientReady}
           effectiveAdmin={effectiveAdmin}
           profile={profile}
         />
       </div>

       <div className="flex-1 pl-20">
         <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">{children}</main>
       </div>
     </div>
   );
}