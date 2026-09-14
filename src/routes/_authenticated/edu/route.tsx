import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyMemberships, type EduMembership } from "@/lib/edu";

export const Route = createFileRoute("/_authenticated/edu")({
  head: () => ({ meta: [{ title: `Classroom — StickTime FPV` }] }),
  component: EduLayout,
});

/**
 * Edu routes are gated server-side by RLS + guard-checked RPCs; this gate
 * only routes users with no institutional membership away from empty pages.
 * The server remains the authority — this is UX, not security.
 */
export function useEduMemberships() {
  return useQuery({
    queryKey: ["edu-memberships"],
    queryFn: getMyMemberships,
  });
}

function EduLayout() {
  const { data: userData } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: memberships, isLoading } = useEduMemberships();
  const navigate = useNavigate();

  useEffect(() => {
    if (!userData || isLoading) return;
    const hasAny = (memberships ?? []).some((m) => m.status === "active");
    if (!hasAny) navigate({ to: "/dashboard", replace: true });
  }, [userData, isLoading, memberships, navigate]);

  if (!userData || isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-500">
        Loading classroom…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-primary">
        <GraduationCap className="h-3.5 w-3.5" />
        INSTITUTIONAL WORKSPACE / FERPA-PROTECTED
      </div>
      <Outlet />
    </div>
  );
}

export type { EduMembership };
