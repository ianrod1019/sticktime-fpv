import { useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

interface MonthlyVolumeChartProps {
  monthlyData: Array<{ month: string; sim: number; real: number }>;
}

const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

/** Stock recharts tooltip restyled to match the app's HUD panels. */
export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string | number;
    dataKey?: string | number;
    value?: number | string;
    color?: string;
  }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(
    (p) => typeof p.value === "number" && (p.value as number) > 0,
  );
  const total = payload.reduce(
    (sum, p) => sum + (typeof p.value === "number" ? (p.value as number) : 0),
    0,
  );
  return (
    <div className="hud-panel px-3 py-2 text-xs shadow-none">
      <p className="label-mono mb-1.5">{label}</p>
      {rows.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="capitalize text-muted-foreground">
            {String(p.dataKey)}
          </span>
          <span className="ml-auto pl-4 font-mono text-foreground">
            {typeof p.value === "number" ? p.value.toFixed(1) : p.value}h
          </span>
        </p>
      ))}
      {rows.length > 1 && total > 0 && (
        <p className="mt-1.5 border-t border-border/60 pt-1.5 flex items-center gap-2">
          <span className="text-muted-foreground">Total</span>
          <span className="ml-auto pl-4 font-mono text-foreground">
            {total.toFixed(1)}h
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Monthly airtime — stacked area with SVG gradient falloff, glow stroke on
 * the active series, quiet horizontal grid, and a HUD-styled tooltip.
 * Custom-styled axes (no default axis lines/ticks) per the reference
 * observability aesthetic.
 */
export function MonthlyVolumeChart({ monthlyData }: MonthlyVolumeChartProps) {
  // The RPC returns minutes; the panel is labeled in hours.
  const chartData = monthlyData.map((d) => ({
    month: d.month,
    sim: d.sim / 60,
    real: d.real / 60,
  }));
  const uid = useId().replace(/:/g, "");
  const simGrad = `grad-sim-${uid}`;
  const realGrad = `grad-real-${uid}`;
  const simGlow = `glow-sim-${uid}`;
  const realGlow = `glow-real-${uid}`;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart
        data={chartData}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={simGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sim)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--sim)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={realGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.38} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.03} />
          </linearGradient>
          <filter id={simGlow} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="3"
              floodColor="#60a5fa"
              floodOpacity="0.45"
            />
          </filter>
          <filter id={realGlow} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="3"
              floodColor="#f97316"
              floodOpacity="0.5"
            />
          </filter>
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="var(--border)"
          strokeDasharray="4 8"
          strokeOpacity={0.55}
        />
        <XAxis
          dataKey="month"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          dy={8}
          minTickGap={16}
        />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={34} />
        <RTooltip
          content={<ChartTooltip />}
          cursor={{
            stroke: "var(--muted-foreground)",
            strokeOpacity: 0.3,
            strokeWidth: 1,
          }}
        />
        <Area
          dataKey="sim"
          stackId="airtime"
          stroke="var(--sim)"
          strokeWidth={2}
          fill={`url(#${simGrad})`}
          type="monotoneX"
          filter={`url(#${simGlow})`}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
          dot={false}
          animationDuration={900}
        />
        <Area
          dataKey="real"
          stackId="airtime"
          stroke="var(--primary)"
          strokeWidth={2}
          fill={`url(#${realGrad})`}
          type="monotoneX"
          filter={`url(#${realGlow})`}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
          dot={false}
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
