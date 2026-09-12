import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Download,
  Settings as SettingsIcon,
  ShieldAlert,
  UserX,
  Loader2,
  CalendarClock,
  Undo2,
  AlertTriangle,
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
import { downloadFile, toCsv } from "@/lib/fpv";
import { db_request } from "@/lib/db_request";
import { scrubUuidsFromRows } from "@/lib/export-scrub";
export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — StickTime FPV" }] }),
  component: Settings,
});

interface DeletionStatus {
  pending: boolean;
  requested_at?: string;
  scheduled_for?: string;
  grace_days?: number;
}

function Settings() {
  const { profile, email, updateProfile } = usePilot();
  const queryClient = useQueryClient();

  // Pilot profile states
  const [goal, setGoal] = useState("5");
  const [privateProfile, setPrivateProfile] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);

  // ---------------------------------------------------------------------------
  // Account deletion: three explicit confirmations, then a 30-day grace period.
  // Nothing is purged until the scheduled date; the pilot can cancel any time
  // from the pending-deletion card that replaces this section.
  // ---------------------------------------------------------------------------
  const step1Phrase = "delete my account";
  const step2Phrase = "this is not reversible";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);
  const [step1Input, setStep1Input] = useState("");
  const [step2Input, setStep2Input] = useState("");
  const [step3Ack1, setStep3Ack1] = useState(false);
  const [step3Ack2, setStep3Ack2] = useState(false);

  function resetDeleteFlow() {
    setDeleteStep(1);
    setStep1Input("");
    setStep2Input("");
    setStep3Ack1(false);
    setStep3Ack2(false);
  }

  // Pending deletion status — kept fresh so the cancel card never lies.
  const { data: deletion } = useQuery<DeletionStatus>({
    queryKey: ["account-deletion-status"],
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_account_deletion_status",
        operation: "select",
      });
      if (error) throw new Error(error.message);
      return (data ?? { pending: false }) as DeletionStatus;
    },
    refetchInterval: 60_000,
  });
  const pendingDeletion = deletion?.pending === true;

  const requestDeletion = useMutation({
    mutationFn: async () => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "request_account_deletion",
        operation: "select",
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-deletion-status"] });
      setDeleteOpen(false);
      toast.success(
        "Deletion scheduled. Your account will be permanently deleted in 30 days — cancel any time before then from Settings.",
        { duration: 8000 },
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to schedule deletion",
      );
    },
  });

  const cancelDeletion = useMutation({
    mutationFn: async () => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "cancel_account_deletion",
        operation: "select",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-deletion-status"] });
      toast.success("Deletion cancelled. Your account is safe.");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel deletion",
      );
    },
  });

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

  function formatDeletionDate(iso?: string) {
    if (!iso) return "in 30 days";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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

          {/* Danger zone — account deletion (GDPR Art. 17, 30-day grace) */}
          {pendingDeletion ? (
            <section className="hud-panel p-6 border-destructive/50 relative overflow-hidden">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-destructive" />
                <span className="label-mono text-destructive">
                  Deletion pending
                </span>
              </div>
              <p className="mt-3 text-sm">
                Your account is scheduled for permanent deletion on{" "}
                <strong className="font-mono">
                  {formatDeletionDate(deletion?.scheduled_for)}
                </strong>
                .
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Everything — sessions, gear, parts, logs and your identity —
                will be erased on that date. This is your grace period: cancel
                now and nothing happens.
              </p>
              <Button
                variant="outline"
                className="mt-5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary/90"
                disabled={cancelDeletion.isPending}
                onClick={() => cancelDeletion.mutate()}
              >
                {cancelDeletion.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="mr-2 h-4 w-4" />
                )}
                Cancel deletion
              </Button>
            </section>
          ) : (
            <section className="hud-panel p-6 border-destructive/30 relative overflow-hidden">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                <span className="label-mono text-destructive">
                  Danger zone
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Delete your account and everything in it — sessions, gear,
                parts, maintenance logs and records. Deletion is scheduled 30
                days after you confirm, and can be cancelled any time before
                then.
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
                  {deleteStep === 1 && (
                    <>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Step 1 of 3 — Confirm it's you
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p>
                              This starts the deletion process for{" "}
                              <strong>{email}</strong>. Three more
                              confirmations follow this one.
                            </p>
                            <div>
                              <Label
                                htmlFor="delete-step1"
                                className="text-xs"
                              >
                                Type{" "}
                                <span className="font-mono text-foreground">
                                  {step1Phrase}
                                </span>
                              </Label>
                              <Input
                                id="delete-step1"
                                value={step1Input}
                                onChange={(e) =>
                                  setStep1Input(e.target.value)
                                }
                                placeholder={step1Phrase}
                                autoComplete="off"
                                className="mt-1.5 font-mono"
                              />
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep my account</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={step1Input !== step1Phrase}
                          onClick={(e) => {
                            e.preventDefault();
                            setDeleteStep(2);
                          }}
                        >
                          Continue
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </>
                  )}

                  {deleteStep === 2 && (
                    <>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Step 2 of 3 — What happens next
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <ul className="list-disc pl-4 space-y-1 text-xs">
                              <li>
                                Deletion is scheduled for{" "}
                                <strong>30 days from now</strong>
                              </li>
                              <li>
                                You keep using the platform normally until
                                then
                              </li>
                              <li>
                                You can cancel from Settings any time during
                                those 30 days
                              </li>
                              <li>
                                On the scheduled date everything is erased
                                permanently
                              </li>
                            </ul>
                            <p className="text-xs">
                              Want a copy first?{" "}
                              <button
                                type="button"
                                className="underline underline-offset-2 text-primary hover:text-primary/80"
                                onClick={() => {
                                  void exportFullJson();
                                }}
                              >
                                Export everything (JSON)
                              </button>
                            </p>
                            <div>
                              <Label
                                htmlFor="delete-step2"
                                className="text-xs"
                              >
                                Type{" "}
                                <span className="font-mono text-foreground">
                                  {step2Phrase}
                                </span>
                              </Label>
                              <Input
                                id="delete-step2"
                                value={step2Input}
                                onChange={(e) =>
                                  setStep2Input(e.target.value)
                                }
                                placeholder={step2Phrase}
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
                          disabled={step2Input !== step2Phrase}
                          onClick={() => setDeleteStep(3)}
                        >
                          Schedule deletion
                        </Button>
                      </AlertDialogFooter>
                    </>
                  )}

                  {deleteStep === 3 && (
                    <>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Step 3 of 3 — Final confirmation
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p className="text-xs flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                              Last check. After this, the deletion date is
                              locked in and only you can stop it.
                            </p>
                            <label className="flex items-start gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={step3Ack1}
                                onChange={(e) =>
                                  setStep3Ack1(e.target.checked)
                                }
                                className="mt-0.5"
                              />
                              <span>
                                All logged sessions, gear, parts, maintenance
                                history and my identity will be permanently
                                erased.
                              </span>
                            </label>
                            <label className="flex items-start gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={step3Ack2}
                                onChange={(e) =>
                                  setStep3Ack2(e.target.checked)
                                }
                                className="mt-0.5"
                              />
                              <span>
                                I understand the purge runs on{" "}
                                {formatDeletionDate()} and can only be
                                prevented by me, before that date.
                              </span>
                            </label>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep my account</AlertDialogCancel>
                        <Button
                          variant="destructive"
                          disabled={
                            !step3Ack1 || !step3Ack2 || requestDeletion.isPending
                          }
                          onClick={() => requestDeletion.mutate()}
                        >
                          {requestDeletion.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Scheduling…
                            </>
                          ) : (
                            <>
                              <UserX className="mr-2 h-4 w-4" />
                              I understand — schedule deletion
                            </>
                          )}
                        </Button>
                      </AlertDialogFooter>
                    </>
                  )}
                </AlertDialogContent>
              </AlertDialog>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
