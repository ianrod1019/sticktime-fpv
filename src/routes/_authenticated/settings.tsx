import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Check,
  Download,
  Settings as SettingsIcon,
  ShieldAlert,
  UserX,
  Loader2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePilot } from "@/hooks/use-pilot";
import { useAuth } from "@/context/auth-context";
import { downloadFile, toCsv } from "@/lib/fpv";
import { db_request } from "@/lib/db_request";
import { scrubUuidsFromRows } from "@/lib/export-scrub";
export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — StickTime FPV" }] }),
  component: Settings,
});

function Settings() {
  const { profile, email, updateProfile } = usePilot();
  const { signOut } = useAuth();

  // Pilot profile states
  const [goal, setGoal] = useState("5");
  const [privateProfile, setPrivateProfile] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);

  // Danger zone: typed confirmation + brief countdown before delete fires.
  const confirmText = "delete my account";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [countdown, setCountdown] = useState(0);

  function resetDeleteFlow() {
    setDeleteConfirmInput("");
    setCountdown(0);
  }

  useEffect(() => {
    if (!deleteOpen || deleteConfirmInput !== confirmText) return;
    setCountdown(5);
    const timer = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [deleteOpen, deleteConfirmInput]);

  useEffect(() => {
    if (profile) {
      if (
        profile.weekly_goal_hours !== undefined &&
        profile.weekly_goal_hours !== null
      ) {
        setGoal(String(profile.weekly_goal_hours));
      }
      if (profile.is_private !== undefined) {
        setPrivateProfile(profile.is_private);
      }
    }
  }, [profile]);

  async function saveProfile() {
    try {
      await updateProfile.mutateAsync({
        weekly_goal_hours: Math.max(0.5, Number(goal) || 5),
        is_private: privateProfile,
      });
      toast.success("Pilot profile saved successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save profile",
      );
    }
  }

  async function exportData() {
    try {
      const [
        sessions,
        batteries,
        drones,
        transmitters,
        goggles,
        otherGear,
        droneParts,
        transmitterParts,
        gogglesParts,
        otherParts,
      ] = await Promise.all([
        db_request({ mode: "query", table: "sessions", operation: "select" }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "batteries",
          operation: "select",
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "drones",
          operation: "select",
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "transmitters",
          operation: "select",
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "goggles",
          operation: "select",
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "other_gear",
          operation: "select",
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "drone_parts",
          operation: "select",
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "transmitter_parts",
          operation: "select",
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "goggles_parts",
          operation: "select",
        }),
        db_request({
          mode: "query",
          schema: "personal_gear",
          table: "other_parts",
          operation: "select",
        }),
      ]);

      // Combine all gear tables into one gear array
      const gear = [
        ...(batteries.data ?? []),
        ...(drones.data ?? []),
        ...(transmitters.data ?? []),
        ...(goggles.data ?? []),
        ...(otherGear.data ?? []),
      ];

      // Combine all parts tables into one parts array
      const parts = [
        ...(droneParts.data ?? []),
        ...(transmitterParts.data ?? []),
        ...(gogglesParts.data ?? []),
        ...(otherParts.data ?? []),
      ];

      const tables = [
        ["sessions", scrubUuidsFromRows(sessions.data ?? [])],
        ["gear", scrubUuidsFromRows(gear)],
        ["gear_parts", scrubUuidsFromRows(parts)],
      ] as const;
      const content = tables
        .map(
          ([table, rows]) =>
            `# ${table}\n${toCsv(rows as Record<string, unknown>[])}`,
        )
        .join("\n\n");
      downloadFile("sticktime-export.csv", content, "text/csv");
      toast.success("CSV export ready");
    } catch (err) {
      toast.error("Failed to export data");
    }
  }

  // GDPR Art. 15/20: full structured export of everything stored about the
  // caller, via the SECURITY DEFINER RPC (server-side scoped to auth.uid()).
  async function exportFullJson() {
    setExportingJson(true);
    try {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "export_my_data",
        operation: "select",
      });
      if (error) throw new Error(error.message);
      downloadFile(
        `sticktime-export-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(data, null, 2),
        "application/json",
      );
      toast.success("Full data export ready (JSON)");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to export full data",
      );
    } finally {
      setExportingJson(false);
    }
  }

  // GDPR Art. 17: self-service erasure. Hard-deletes all content, then
  // irreversibly pseudonymizes the identity row. Signs the pilot out.
  async function anonymizeAccount() {
    setAnonymizing(true);
    try {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "anonymize_my_data",
        operation: "select",
      });
      if (error) throw new Error(error.message);
      toast.success(
        "Account deleted. Your data has been permanently erased.",
      );
      await signOut();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete account",
      );
    } finally {
      setAnonymizing(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Pilot Settings"
        subtitle="Tune your cockpit privacy and data portability."
      />
      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-8">
          {/* Profile & Goals */}
          <section className="hud-panel p-6 relative overflow-hidden group hover:border-primary/40 transition-colors shadow-lg">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none" />
            <div className="flex items-center justify-between">
              <div>
                <span className="label-mono text-primary">
                  Profile controls
                </span>
                <h2 className="mt-2 text-xl font-semibold">
                  {profile?.callsign || email || "Pilot"}
                </h2>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
            </div>
            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="goal">Weekly flight goal (hours)</Label>
                <Input
                  id="goal"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
                <div>
                  <p className="font-medium">Private pilot profile</p>
                  <p className="text-sm text-muted-foreground">
                    Hide your public callsign and profile details from
                    leaderboards.
                  </p>
                </div>
                <Switch
                  checked={privateProfile}
                  onCheckedChange={setPrivateProfile}
                  aria-label="Private pilot profile"
                />
              </div>
              <div className="pt-2">
                <Button
                  onClick={saveProfile}
                  disabled={updateProfile?.isPending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Save profile
                </Button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          {/* Settings */}
          <section className="hud-panel p-6 relative overflow-hidden group hover:border-primary/40 transition-colors shadow-lg">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none" />
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4 text-primary" />
              <span className="label-mono text-primary">Settings</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Export your logbook, gear, and pilot records.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary/90"
                onClick={() => exportData()}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary/90"
                onClick={exportFullJson}
                disabled={exportingJson}
              >
                {exportingJson ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export everything (JSON)
              </Button>
            </div>
          </section>

          {/* Danger zone — account deletion (GDPR Art. 17) */}
          <section className="hud-panel p-6 border-destructive/30 relative overflow-hidden">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <span className="label-mono text-destructive">Danger zone</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Permanently delete your account and everything in it — sessions,
              gear, parts, maintenance logs and records. This cannot be
              undone.
            </p>
            <AlertDialog
              open={deleteOpen}
              onOpenChange={(o) => {
                setDeleteOpen(o);
                if (!o) resetDeleteFlow();
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="mt-5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <UserX className="mr-2 h-4 w-4" />
                  Delete account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>
                        This permanently erases all of your flights, gear,
                        parts and maintenance history, and anonymizes your
                        profile. <strong>It cannot be reversed — even by
                        platform admins.</strong>
                      </p>
                      <ul className="list-disc pl-4 space-y-1 text-xs">
                        <li>All logged sessions and airtime are erased</li>
                        <li>All gear, parts and service history are erased</li>
                        <li>Your callsign and email become unrecoverable</li>
                        <li>You are signed out immediately</li>
                      </ul>
                      <p className="text-xs">
                        Want a copy first?{" "}
                        <button
                          type="button"
                          className="underline underline-offset-2 text-primary hover:text-primary/80"
                          onClick={() => {
                            setDeleteOpen(false);
                            void exportFullJson();
                          }}
                        >
                          Export everything (JSON)
                        </button>
                      </p>
                      <div className="pt-1">
                        <Label htmlFor="delete-confirm" className="text-xs">
                          Type{" "}
                          <span className="font-mono text-foreground">
                            {confirmText}
                          </span>{" "}
                          to confirm
                        </Label>
                        <Input
                          id="delete-confirm"
                          value={deleteConfirmInput}
                          onChange={(e) => setDeleteConfirmInput(e.target.value)}
                          placeholder={confirmText}
                          autoComplete="off"
                          className="mt-1.5 font-mono"
                        />
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep my account</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    disabled={
                      deleteConfirmInput !== confirmText ||
                      anonymizing ||
                      countdown > 0
                    }
                    onClick={anonymizeAccount}
                  >
                    {anonymizing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting…
                      </>
                    ) : countdown > 0 ? (
                      `Hold on… (${countdown})`
                    ) : (
                      <>
                        <UserX className="mr-2 h-4 w-4" />
                        Delete forever
                      </>
                    )}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>
        </div>
      </div>
    </>
  );
}
