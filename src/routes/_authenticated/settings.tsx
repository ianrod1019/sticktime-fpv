import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Check, Download, Settings as SettingsIcon, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePilot } from "@/hooks/use-pilot";
import { downloadFile, toCsv } from "@/lib/fpv";
import { db_request } from "@/lib/db_request";
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

  async function exportData() {
    try {
      const [sessions, batteries, drones, transmitters, goggles, otherGear, batteryParts, droneParts, transmitterParts, gogglesParts, otherParts, records] = await Promise.all([
        db_request({ mode: "query", table: "sessions", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "batteries", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "drones", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "transmitters", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "goggles", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "other_gear", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "battery_parts", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "drone_parts", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "transmitter_parts", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "goggles_parts", operation: "select" }),
        db_request({ mode: "query", schema: "personal_gear", table: "other_parts", operation: "select" }),
        db_request({ mode: "query", table: "personal_records", operation: "select" }),
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
        ...(batteryParts.data ?? []),
        ...(droneParts.data ?? []),
        ...(transmitterParts.data ?? []),
        ...(gogglesParts.data ?? []),
        ...(otherParts.data ?? []),
      ];

      const tables = [
        ["sessions", sessions.data ?? []],
        ["gear", gear],
        ["gear_parts", parts],
        ["personal_records", records.data ?? []],
      ] as const;
      const content =
        tables
          .map(([table, rows]) => `# ${table}\n${toCsv(rows as Record<string, unknown>[])}`)
          .join("\n\n");
      downloadFile("sticktime-export.csv", content, "text/csv");
      toast.success("CSV export ready");
    } catch (err) {
      toast.error("Failed to export data");
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
                <span className="label-mono text-primary">Profile controls</span>
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
              <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary/90" onClick={() => exportData()}>
                <Download className="mr-2 h-4 w-4" />
                Export Data
              </Button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
