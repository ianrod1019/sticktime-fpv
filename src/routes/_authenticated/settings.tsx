import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Download, LockKeyhole, Palette } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { usePilot } from "@/hooks/use-pilot";
import { ACCENTS, downloadFile, toCsv, toSqlInserts, type Accent } from "@/lib/fpv";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — StickTime FPV" }] }),
  component: Settings,
});

const accentLabels: Record<Accent, string> = {
  ember: "Ember",
  lime: "Lime",
  cyan: "Cyan",
  magenta: "Magenta",
  amber: "Amber",
};

function Settings() {
  const { profile, email, updateProfile } = usePilot();
  const [goal, setGoal] = useState(String(profile?.weekly_goal_hours ?? 5));
  const [privateProfile, setPrivateProfile] = useState(profile?.is_private ?? false);

  async function saveProfile() {
    try {
      await updateProfile.mutateAsync({
        weekly_goal_hours: Math.max(0.5, Number(goal) || 5),
        is_private: privateProfile,
      });
      toast.success("Pilot settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    }
  }

  async function setAccent(accent: Accent) {
    try {
      await updateProfile.mutateAsync({ accent_color: accent });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update accent");
    }
  }

  async function exportData(kind: "csv" | "sql") {
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
  }

  return (
    <>
      <PageHeader
        title="Pilot settings"
        subtitle="Tune your cockpit, privacy, and data portability."
      />
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hud-panel p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="label-mono">Profile controls</span>
              <h2 className="mt-2 text-xl font-semibold">{profile?.callsign || "Pilot"}</h2>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
          <div className="mt-6 space-y-5">
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
            <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="font-medium">Private pilot profile</p>
                <p className="text-sm text-muted-foreground">
                  Hide your public callsign and profile details.
                </p>
              </div>
              <Switch
                checked={privateProfile}
                onCheckedChange={setPrivateProfile}
                aria-label="Private pilot profile"
              />
            </div>
            <Button onClick={saveProfile} disabled={updateProfile.isPending}>
              <Check className="mr-2 h-4 w-4" />
              Save settings
            </Button>
          </div>
        </section>

        <section className="hud-panel p-5">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            <span className="label-mono">Accent signal</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {ACCENTS.map((accent) => (
              <Button
                key={accent}
                variant={profile?.accent_color === accent ? "default" : "outline"}
                className="justify-start"
                onClick={() => setAccent(accent)}
              >
                <span className="mr-2 h-3 w-3 rounded-full bg-primary" />
                {accentLabels[accent]}
              </Button>
            ))}
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-primary" />
              <span className="label-mono">Data export</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Take your logbook with you in portable formats.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportData("csv")}>
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button variant="outline" onClick={() => exportData("sql")}>
                <Download className="mr-2 h-4 w-4" />
                SQL
              </Button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
