import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Flame, Timer, Gauge, Battery, Cpu } from "lucide-react";
import { Heatmap } from "@/components/heatmap";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/app-shell";
import { computeStreak, formatHours, type SessionRow } from "@/lib/fpv";
import { StatCard } from "./StatCard";
import { RatioBar } from "./RatioBar";

interface DashboardContentProps {
  simMinutes: number;
  realMinutes: number;
  totalMinutes: number;
  totalSessions: number;
  totalPacks: number;
  gear: Array<{
    id: string;
    name: string;
    gear_type: string;
    total_minutes: number;
    is_as_needed: boolean;
  }>;
  recentSessions: SessionRow[];
  heatmapData: Array<{ date: string; minutes: number }>;
  monthlyData: Array<{ month: string; sim: number; real: number }>;
  rigUsage: Array<{
    gear_id: string;
    name: string;
    hours: number;
  }>;
  activeRigs: number;
  profile: { callsign?: string; weekly_goal_hours?: number } | null;
}

export function DashboardContent({
  simMinutes,
  realMinutes,
  totalMinutes,
  totalSessions,
  totalPacks,
  gear,
  recentSessions,
  heatmapData,
  monthlyData,
  rigUsage,
  activeRigs,
  profile,
}: DashboardContentProps) {
  const goalHours = profile?.weekly_goal_hours ?? 5;

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekMinutes = recentSessions
    .filter((s) => new Date(`${s.flown_on}T00:00:00`) >= weekStart)
    .reduce((a, s) => a + s.duration_minutes, 0);
  const goalPct = Math.min(100, Math.round((weekMinutes / 60 / Math.max(goalHours, 0.1)) * 100));

  const packs = totalPacks;
  const streak = computeStreak(recentSessions);
  const activeDrones = activeRigs;

  const heatmapSessions = (heatmapData?.map((d) => ({ flown_on: d.date, duration_minutes: d.minutes })) ?? []) as SessionRow[];

  const fallbackMonths = Array.from({length: 12}, (_, i) => {
                   const d = new Date();
                   d.setMonth(d.getMonth() - i);
                   const month = d.getMonth() + 1;
                   return {
                     month: `${String(month).padStart(2, '0')}-${d.getFullYear()}`,
                     sim: 0,
                     real: 0,
                   };
                 }).reverse();

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
          hint={`${totalSessions} sessions logged`}
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
          value={String(activeDrones)}
          hint="Unique drones flown last 30d"
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
          <Heatmap sessions={heatmapSessions} />
        </div>
      </div>

      <div className="mt-4 hud-panel p-5">
        <span className="label-mono text-sm mb-2 block">AIRTIME CONSOLIDATED VIEW</span>
        <div className="flex flex-col items-start gap-4">
          <div className="w-full">
            <div className="flex justify-between text-sm text-muted-foreground mb-1">
              <span>Sim</span>
              <span>Real</span>
            </div>
            <RatioBar simMinutes={simMinutes} realMinutes={realMinutes} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatHours(simMinutes)} ({Math.round((simMinutes / totalMinutes) * 100)}%)</span>
              <span>{formatHours(realMinutes)} ({Math.round((realMinutes / totalMinutes) * 100)}%)</span>
            </div>
          </div>

          <div className="w-full">
            <span className="text-primary text-lg font-bold">{formatHours(totalMinutes)}</span>
          </div>

          <div className="w-full">
            <span className="label-mono">Monthly volume (hours)</span>
            <div className="mt-2">
<ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlyData.length > 0 ? monthlyData : fallbackMonths}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <RTooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                    formatter={(value) => formatHours(value as number)}
                  />
                  <Legend />
                  <Area
                    dataKey="sim"
                    stackId="a"
                    fill="var(--sim)"
                    stroke="var(--sim)"
                    strokeWidth={2}
                    type="monotone"
                    fillOpacity={0.6}
                  />
                  <Area
                    dataKey="real"
                    stackId="a"
                    fill="var(--primary)"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    type="monotone"
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 hud-panel p-5">
        <div className="flex items-center justify-between">
          <span className="label-mono">Rig usage (hours)</span>
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