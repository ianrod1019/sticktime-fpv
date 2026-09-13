import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plane, KeyRound } from "lucide-react";
import { db_request } from "@/lib/db_request";

export const Route = createFileRoute("/update-password")({
  // Recovery links land here with a session in the URL fragment;
  // detectSessionInUrl picks it up before this check runs.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      // Expired/used link (otp_expiry = 30 min) or navigation without a
      // recovery session: back to the landing page's auth modal.
      throw redirect({ to: "/" });
    }
  },
  component: UpdatePasswordComponent,
});

function UpdatePasswordComponent() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // The recovery link's session was issued for the reset flow only —
      // every OTHER session dies now (stolen-link hygiene), and this event
      // lands in the admin's security view.
      await supabase.auth.signOut({ scope: "others" });
      await db_request({
        mode: "rpc",
        rpcFunction: "log_security_event",
        operation: "select",
        rpcParams: {
          p_action: "recovery_completed",
          p_detail: "update-password",
        },
      });

      toast.success("Password updated. Other sessions were signed out.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update password",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-2xl border">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Other sessions will be signed out after the change.
          </p>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            <Plane className="mr-2 h-4 w-4" />
            {loading ? "Updating..." : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
