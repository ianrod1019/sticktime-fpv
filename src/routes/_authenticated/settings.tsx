import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Check, Download, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePilot } from "@/hooks/use-pilot";
import { downloadFile, toCsv, toSqlInserts } from "@/lib/fpv";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — StickTime FPV" }] }),
  component: Settings,
});

function Settings() {
  const { profile, email, updateProfile } = usePilot();
  
  // Pilot profile states
  const [goal, setGoal] = useState("5");
  const [privateProfile, setPrivateProfile] = useState(false);

  useEffect(() => {
    if (profile) {
      if (profile.weekly_goal_hours !== undefined && profile.weekly_goal_hours !== null) {
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
      toast.error(error instanceof Error ? error.message : "Could not save profile");
    }
  }

  async function exportData(kind: "csv" | "sql") {
    try {
      const [sessions, gear, parts, records] = await Promise.all([
        supabase.from("sessions").select("*"),
        supabase.from("gear").select("*"),
        supabase.from("gear_parts").select("*"),
        supabase.from("personal_records").select("*"),
      ]);
      const tables = [
        ["sessions", sessions.data ?? []],
        ["gear", gear.data ?? []],
        ["gear_parts", parts.data ?? []],
        ["personal_records", records.data ?? []],
      ] as const;
      const content =
        kind === "csv"
          ? tables
              .map(([table, rows]) => `# ${table}\n${toCsv(rows as Record<string, unknown>[])}`)
              .join("\n\n")
          : tables
              .map(
                ([table, rows]) =>
                  `-- ${table}\n${toSqlInserts(table, rows as Record<string, unknown>[])}`,
              )
              .join("\n\n");
      downloadFile(`sticktime-export.${kind}`, content, kind === "csv" ? "text/csv" : "text/sql");
      toast.success(`${kind.toUpperCase()} export ready`);
    } catch (err) {
      toast.error("Failed to export data");
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="text-foreground">Pilot <span className="text-orange-500">Settings</span></span>}
        subtitle="Tune your cockpit privacy and data portability."
      />
      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-8">
          {/* Profile & Goals */}
          <section className="hud-panel p-6 relative overflow-hidden group hover:border-orange-500/40 transition-colors shadow-lg">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full pointer-events-none" />
            <div className="flex items-center justify-between">
              <div>
                <span className="label-mono text-orange-400">Profile controls</span>
                <h2 className="mt-2 text-xl font-semibold">{profile?.callsign || email || "Pilot"}</h2>
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
                    Hide your public callsign and profile details from leaderboards.
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
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Save profile
                </Button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          {/* Data Export */}
          <section className="hud-panel p-6 relative overflow-hidden group hover:border-orange-500/40 transition-colors shadow-lg">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full pointer-events-none" />
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-orange-500" />
              <span className="label-mono text-orange-400">Data export</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Take your logbook, gear, and pilot records with you in portable formats.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300" onClick={() => exportData("csv")}>
                <Download className="mr-2 h-4 w-4" />
                CSV Export
              </Button>
              <Button variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300" onClick={() => exportData("sql")}>
                <Download className="mr-2 h-4 w-4" />
                SQL Inserts
              </Button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
