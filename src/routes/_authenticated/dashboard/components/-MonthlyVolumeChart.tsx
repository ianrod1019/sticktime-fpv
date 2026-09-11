import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

interface MonthlyVolumeChartProps {
  monthlyData: Array<{
    month: string;
    total_sim_minutes: number;
    total_real_minutes: number;
  }>;
}

export function MonthlyVolumeChart({ monthlyData }: MonthlyVolumeChartProps) {
  const chartData = monthlyData
    .map((d) => ({
      month: d.month,
      sim: d.total_sim_minutes / 60,
      real: d.total_real_minutes / 60,
    }))
    .slice(-12);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
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
  );
}
