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
import { Flame, Timer, Gauge, Battery, Cpu, Plus } from "lucide-react";
import { useState } from "react";
import { Heatmap } from "@/components/heatmap";
import { PageHeader } from "@/components/app-shell";
import { formatHours, type SessionRow } from "@/lib/fpv";
import { StatCard } from "./-StatCard";
import { RatioBar } from "./-RatioBar";
import { QuickAddSessionLogger } from "./-QuickAddSessionLogger";

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
    drone_id: string;
    name: string;
    hours: number;
  }>;
  activeRigs: number;
  profile: { callsign?: string; weekly_goal_hours?: number } | null;
  streak: { sim: number; real: number; combined: number };
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
  streak,
}: DashboardContentProps) {
  const goalHours = profile?.weekly_goal_hours ?? 5;
  // Removed weekly goal calculations and UI since they are not needed.

  const packs = totalPacks;
  const activeDrones = activeRigs;

  const heatmapSessions = (heatmapData?.map((d) => ({
    flown_on: d.date,
    duration_minutes: d.minutes,
  })) ?? []) as SessionRow[];

  const fallbackMonths = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const month = d.getMonth() + 1;
    return {
      month: `${String(month).padStart(2, "0")}-${d.getFullYear()}`,
      sim: 0,
      real: 0,
    };
  }).reverse();

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const percentOfTotal = (part: number) =>
    totalMinutes > 0 ? Math.round((part / totalMinutes) * 100) : 0;

  // QuickAddSessionLogger persists the session and invalidates the dashboard
  // queries itself; this callback only mirrors the open state.
  const handleQuickAddSubmit = (_session: SessionRow) => {
    setIsQuickAddOpen(false);
  };

  return (
    <>
      <PageHeader
        title={`Welcome back${profile?.callsign ? `, ${profile.callsign}` : ""}`}
        subtitle="Your airtime at a glance."
        action={
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 active:scale-[0.97] text-primary-foreground font-medium py-2 px-4 rounded-lg transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-[inset_0_1px_0_oklch(1_0_0/0.18),0_1px_2px_oklch(0_0_0/0.3),0_6px_16px_-8px_var(--primary)]"
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Quick Log
          </button>
        }
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
          value={`${streak.combined} ${streak.combined === 1 ? "day" : "days"}`}
          hint={`Sim: ${streak.sim}d, Real: ${streak.real}d`}
        />
        <StatCard
          icon={Battery}
          label="Packs flown"
          value={String(packs)}
          hint="Real-world packs"
        />
        <StatCard
          icon={Cpu}
          label="Active rigs"
          value={String(activeDrones)}
          hint="Unique drones flown last 30d"
        />
      </div>

      {/* Weekly goal section removed */}

      <div className="mt-4 hud-panel p-5">
        <span className="label-mono">Consistency grid — last 12 months</span>
        <div className="mt-4">
          <Heatmap sessions={heatmapSessions} />
        </div>
      </div>

      <div className="mt-4 hud-panel p-5">
        <span className="label-mono text-sm mb-2 block">
          AIRTIME CONSOLIDATED VIEW
        </span>
        <div className="flex flex-col items-start gap-4">
          <div className="w-full">
            <div className="flex justify-between text-sm text-muted-foreground mb-1">
              <span>Sim</span>
              <span>Real</span>
            </div>
            <RatioBar simMinutes={simMinutes} realMinutes={realMinutes} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {formatHours(simMinutes)} ({percentOfTotal(simMinutes)}%)
              </span>
              <span>
                {formatHours(realMinutes)} ({percentOfTotal(realMinutes)}%)
              </span>
            </div>
          </div>

          <div className="w-full">
            <span className="text-primary text-lg font-bold">
              {formatHours(totalMinutes)}
            </span>
          </div>

          <div className="w-full">
            <span className="label-mono">Monthly volume (hours)</span>
            <div className="mt-2">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={monthlyData.length > 0 ? monthlyData : fallbackMonths}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                  />
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
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
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
                <Bar
                  dataKey="hours"
                  fill="var(--primary)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <QuickAddSessionLogger
        open={isQuickAddOpen}
        onOpenChange={setIsQuickAddOpen}
        onSubmit={handleQuickAddSubmit}
      />
    </>
  );
}
