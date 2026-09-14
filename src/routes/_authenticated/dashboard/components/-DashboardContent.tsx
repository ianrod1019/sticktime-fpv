import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Flame, Timer, Gauge, Battery, Cpu, Plus } from "lucide-react";
import { useState } from "react";
import { Heatmap } from "@/components/heatmap";
import { PageHeader } from "@/components/app-shell";
import { formatHours, type SessionRow } from "@/lib/fpv";
import { StatCard } from "./-StatCard";
import { RatioBar } from "./-RatioBar";
import { QuickAddSessionLogger } from "./-QuickAddSessionLogger";
import { MonthlyVolumeChart, ChartTooltip } from "./-MonthlyVolumeChart";
import { FlightReadiness } from "./-FlightReadiness";
import { FleetViewport } from "@/components/three/fleet-viewport";

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

      <div className="mb-4 grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <FleetViewport />
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
          <div className="rounded-2xl border border-white/[0.09] bg-[#121215] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <div className="flex items-center justify-between">
              <span className="label-mono">Mission brief</span>
              <span className="font-mono text-[9px] text-emerald-400">
                READY
              </span>
            </div>
            <h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.04em] text-zinc-100">
              Keep the fleet
              <br />
              in the green.
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              The viewport is a live operational model of your airframes. Select
              a rig to inspect readiness, utilization, and next action.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <div className="border border-white/[0.08] bg-white/[0.025] p-3">
                <div className="font-mono text-[9px] tracking-[0.14em] text-zinc-600">
                  NEXT SERVICE
                </div>
                <div className="mt-2 font-mono text-sm text-primary">
                  STK-02 / 04h
                </div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.025] p-3">
                <div className="font-mono text-[9px] tracking-[0.14em] text-zinc-600">
                  RISK FLAGS
                </div>
                <div className="mt-2 font-mono text-sm text-emerald-400">
                  00 OPEN
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.09] bg-[#101014] p-5">
            <div className="flex items-center justify-between">
              <span className="label-mono">Ops pulse</span>
              <span className="font-mono text-[9px] text-zinc-600">
                LAST 30 DAYS
              </span>
            </div>
            <div className="mt-5 flex items-end gap-1.5">
              {[42, 58, 51, 74, 64, 80, 71, 88, 78, 94, 83, 96].map(
                (height, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-t-sm bg-gradient-to-t from-primary/25 to-primary"
                    style={{
                      height: `${height / 1.5}px`,
                      opacity: 0.4 + i / 22,
                    }}
                  />
                ),
              )}
            </div>
            <div className="mt-4 flex justify-between font-mono text-[9px] text-zinc-600">
              <span>12.4H FLIGHT TIME</span>
              <span className="text-primary">+18.4%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
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
        <FlightReadiness
          activeDrones={activeDrones}
          totalMinutes={totalMinutes}
          packs={packs}
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
              <MonthlyVolumeChart
                monthlyData={
                  monthlyData.length > 0 ? monthlyData : fallbackMonths
                }
              />
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
                <defs>
                  <linearGradient id="rig-bar-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop
                      offset="0%"
                      stopColor="var(--primary)"
                      stopOpacity={0.95}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--primary)"
                      stopOpacity={0.55}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 8"
                  stroke="var(--border)"
                  strokeOpacity={0.55}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <RTooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "var(--muted)", fillOpacity: 0.3 }}
                />
                <Bar
                  dataKey="hours"
                  fill="url(#rig-bar-grad)"
                  radius={[0, 6, 6, 0]}
                  barSize={18}
                  animationDuration={900}
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
