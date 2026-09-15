import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dev")({
  beforeLoad: async () => {
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      throw redirect({ to: "/" });
    }

    const userId = userData.user.id;
    let isAllowed = false;

    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (!profileError && profileData?.role) {
        const r = profileData.role.toLowerCase();
        if (r === "admin" || r === "dev" || r === "tester") {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        const { data: rpcData, error: rpcError } =
          await supabase.rpc("check_is_admin");
        if (!rpcError && rpcData === true) {
          isAllowed = true;
        }
      }
    } catch (err) {
      console.error("Error checking dev/QA privilege:", err);
    }

    if (!isAllowed) {
      throw redirect({ to: "/dashboard" });
    }

    return { user: userData.user };
  },
});
