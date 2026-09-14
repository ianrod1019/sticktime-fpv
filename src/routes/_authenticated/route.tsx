import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/auth/protected-route";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/" });
      return { user: data.user };
    } catch (err) {
      // redirect() rejections must propagate untouched; anything else is a
      // transient auth-network failure — bounce to login instead of leaving
      // the route match rejected (which blanks the whole authenticated tree).
      if (err && typeof err === "object" && "to" in (err as object)) throw err;
      throw redirect({ to: "/", search: { showAuth: true } });
    }
  },
  component: () => (
    <ProtectedRoute>
      <AppShell>
        <Outlet />
      </AppShell>
    </ProtectedRoute>
  ),
});
