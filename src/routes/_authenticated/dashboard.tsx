import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Flame, Timer, Gauge, Battery, Cpu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePilot } from "@/hooks/use-pilot";
import { PageHeader } from "@/components/app-shell";
import { Heatmap } from "@/components/heatmap";
import { Progress } from "@/components/ui/progress";
import { computeStreak, formatHours, monthlyVolume, type SessionRow } from "@/lib/fpv";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — StickTime FPV" },
      { name: "description", content: "Your FPV flight hours, streak and airtime analytics." },
      { property: "og:title", content: "Dashboard — StickTime FPV" },
      {
        property: "og:description",
        content: "Your FPV flight hours, streak and airtime analytics.",
      },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="hud-panel p-5">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Dashboard() {
  const { profile, isPro } = usePilot();

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [sessions, gear] = await Promise.all([
        supabase.from("sessions").select("*").order("flown_on", { ascending: false }),
        supabase.from("gear").select("id,name,total_minutes,retired"),
      ]);
      return {
        sessions: (sessions.data ?? []) as unknown as SessionRow[],
        gear: gear.data ?? [],
      };
    },
  });

  const sessions = data?.sessions ?? [];
  const gear = data?.gear ?? [];

  const totalMinutes = sessions.reduce((a, s) => a + s.duration_minutes, 0);
  const simMinutes = sessions
    .filter((s) => s.session_type === "sim")
    .reduce((a, s) => a + s.duration_minutes, 0);
  const realMinutes = totalMinutes - simMinutes;
  const packs = sessions.reduce((a, s) => a + (s.packs_flown ?? 0), 0);
  const streak = computeStreak(sessions);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekMinutes = sessions
    .filter((s) => new Date(`${s.flown_on}T00:00:00`) >= weekStart)
    .reduce((a, s) => a + s.duration_minutes, 0);
  const goalHours = profile?.weekly_goal_hours ?? 5;
  const goalPct = Math.min(100, Math.round((weekMinutes / 60 / Math.max(goalHours, 0.1)) * 100));

  const donut = [
    { name: "Simulator", value: simMinutes },
    { name: "Real world", value: realMinutes },
  ];

  const rigUsage = gear
    .map((g) => ({
      name: g.name,
      hours:
        Math.round(
          (sessions
            .filter((s) => s.gear_id === g.id)
            .reduce((a, s) => a + s.duration_minutes, 0) /
            60) *
            10,
        ) / 10,
    }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title={`Welcome back${profile?.callsign ? `, ${profile.callsign}` : ""}`}
        subtitle="Your airtime at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Timer}
          label="Total airtime"
          value={formatHours(totalMinutes)}
          hint={`${sessions.length} sessions logged`}
        />
        <StatCard
          icon={Flame}
          label="Current streak"
          value={`${streak} ${streak === 1 ? "day" : "days"}`}
          hint="Consecutive days flown"
        />
        <StatCard icon={Battery} label="Packs flown" value={String(packs)} hint="Real-world packs" />
        <StatCard
          icon={Cpu}
          label="Active rigs"
          value={String(gear.filter((g) => !g.retired).length)}
          hint="In the garage"
        />
      </div>

      <div className="mt-4 hud-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="label-mono">Weekly goal</span>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatHours(weekMinutes)} of {goalHours}h this week
            </p>
          </div>
          <Gauge className="h-4 w-4 text-primary" />
        </div>
        <Progress value={goalPct} className="mt-4" />
      </div>

      <div className="mt-4 hud-panel p-5">
        <span className="label-mono">Consistency grid — last 12 months</span>
        <div className="mt-4">
          <Heatmap sessions={sessions} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="hud-panel p-5">
          <span className="label-mono">Sim vs real airtime</span>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius={62} outerRadius={92} paddingAngle={3}>
                  <Cell fill="var(--sim)" />
                  <Cell fill="var(--primary)" />
                </Pie>
                <RTooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => `${Math.round((v / 60) * 10) / 10} h`}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="hud-panel p-5">
          <span className="label-mono">Monthly volume (hours)</span>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyVolume(sessions)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <RTooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Legend />
                <Bar dataKey="sim" stackId="a" fill="var(--sim)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="real" stackId="a" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-4 hud-panel p-5">
        <div className="flex items-center justify-between">
          <span className="label-mono">Rig usage (hours)</span>
          {!isPro && <span className="text-xs text-muted-foreground">Pro unlocks deeper analytics</span>}
        </div>
        <div className="mt-4 h-64">
          {rigUsage.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Log a session against a rig to see usage here.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rigUsage} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="hours" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
