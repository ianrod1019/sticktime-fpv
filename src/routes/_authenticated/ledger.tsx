import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  Clock,
  TrendingUp,
  Shield,
  BarChart3,
  PieChart,
  BatteryCharging,
  Cpu,
  Radio,
  Glasses,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePilot } from "@/hooks/use-pilot";
import { formatHours } from "@/lib/fpv";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { LedgerEntry } from "@/hooks/use-cost-per-flight-hour-ledger";

interface SummaryData {
  total_investment: number;
  total_repairs: number;
  total_cost: number;
  total_flight_minutes: number;
  total_flight_hours: number;
  total_cost_per_hour: number;
  gear_count: number;
  flight_count: number;
}

function CostCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
            {label}
          </span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <p className="mt-2 text-2xl font-bold font-display">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const TYPE_COLORS: Record<string, string> = {
  quad: "#6366f1",
  transmitter: "#22c55e",
  goggles: "#f59e0b",
  battery: "#3b82f6",
  other: "#64748b",
};

export const Route = createFileRoute("/_authenticated/ledger")({
  head: () => ({
    meta: [
      { title: "Cost-per-Flight-Hour Ledger — StickTime FPV" },
      {
        name: "description",
        content:
          "Track your gear investments and repairs per flight hour. Pro feature.",
      },
      {
        property: "og:title",
        content: "Cost-per-Flight-Hour Ledger — StickTime FPV",
      },
      {
        property: "og:description",
        content: "Track your gear investments and repairs per flight hour.",
      },
    ],
  }),
  component: LedgerPage,
});

function LedgerPage() {
  const { profile } = usePilot();
  const userId = profile?.id ?? null;

  const { data: hasAccess, isLoading: accessLoading } = useQuery({
    queryKey: ["check-pro-access", userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data, error } = await supabase.rpc("check_pro_access");
      if (error) throw error;
      return data as boolean;
    },
    enabled: !!userId,
  });

  const isPro = hasAccess ?? false;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cost-per-flight-hour-ledger", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.rpc(
        "get_cost_per_flight_hour_ledger",
        {
          p_user_id: userId,
        },
      );
      if (error) throw error;
      return data as LedgerEntry[];
    },
    enabled: !!userId && isPro,
  });

  const summary: SummaryData =
    data && data.length > 0
      ? {
          total_investment: data.reduce((sum, g) => sum + (g.purchase_cost ?? 0), 0),
          total_repairs: data.reduce((sum, g) => sum + (g.repair_cost ?? 0), 0),
          total_cost: data.reduce((sum, g) => sum + (g.total_cost ?? 0), 0),
          total_flight_minutes: data.reduce(
            (sum, g) => sum + (g.flight_minutes ?? 0),
            0,
          ),
          total_flight_hours: data.reduce((sum, g) => sum + (g.flight_hours ?? 0), 0),
          total_cost_per_hour:
            data.reduce((sum, g) => sum + (g.flight_minutes ?? 0), 0) > 0
              ? data.reduce((sum, g) => sum + (g.total_cost ?? 0), 0) /
                (data.reduce((sum, g) => sum + (g.flight_minutes ?? 0), 0) / 60)
              : 0,
          gear_count: data.length,
          flight_count: data.reduce((sum, g) => sum + (g.flight_count ?? 0), 0),
        }
      : {
          total_investment: 0,
          total_repairs: 0,
          total_cost: 0,
          total_flight_minutes: 0,
          total_flight_hours: 0,
          total_cost_per_hour: 0,
          gear_count: 0,
          flight_count: 0,
        };

  // Split data by gear type
  const batteryData = data?.filter((g) => g.gear_type === "battery") ?? [];
  const quadData = data?.filter((g) => g.gear_type === "quad") ?? [];
  const transmitterData = data?.filter((g) => g.gear_type === "transmitter") ?? [];
  const goggleData = data?.filter((g) => g.gear_type === "goggles") ?? [];

  const pieData = data
    ? data.map((g) => ({
        name: g.gear_name,
        value: g.total_cost ?? 0,
        color: TYPE_COLORS[g.gear_type] ?? "#64748b",
      }))
    : [];

  const barData = data
    ? data.map((g) => ({
        name: g.gear_name.length > 12 ? g.gear_name.slice(0, 12) + "…" : g.gear_name,
        cost_per_hour: Math.round((g.cost_per_hour ?? 0) * 100) / 100,
        total_cost: Math.round((g.total_cost ?? 0) * 100) / 100,
        flight_hours: Math.round((g.flight_hours ?? 0) * 100) / 100,
      }))
    : [];

  if (!isPro) {
    return (
      <>
        <PageHeader
          title="Cost-per-Flight-Hour Ledger"
          subtitle="Advanced financial tracking per flight hour"
        />
        <div className="hud-panel p-8 text-center border-primary/20 max-w-xl mx-auto my-12">
          <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">
            Pro Feature
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            The Cost-per-Flight-Hour Ledger is a Pro-tier feature that tracks
            your total gear investments and repair costs divided by flight
            hours, giving you a precise cost-per-hour metric per rig and
            aggregate analytics.
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            Your current tier: <Badge variant="outline">{profile?.tier ?? "free"}</Badge>
          </p>
          <Button asChild>
            <Link to="/settings">Upgrade to Pro</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Cost-per-Flight-Hour Ledger"
        subtitle="Track gear investments and repairs per flight hour"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mt-4">
        <CostCard
          icon={DollarSign}
          label="Total Investment"
          value={`$${summary.total_investment.toFixed(2)}`}
          hint={`Across ${summary.gear_count} gear items`}
        />
        <CostCard
          icon={TrendingUp}
          label="Repair Costs"
          value={`$${summary.total_repairs.toFixed(2)}`}
          hint={`${summary.flight_count} logged flights`}
        />
        <CostCard
          icon={Clock}
          label="Total Flight Time"
          value={formatHours(summary.total_flight_minutes)}
          hint={`${(summary.total_flight_hours ?? 0).toFixed(1)}h logged`}
        />
        <CostCard
          icon={BarChart3}
          label="Cost per Hour"
          value={`$${summary.total_cost_per_hour.toFixed(2)}/h`}
          hint={`Total cost: $${(summary.total_cost ?? 0).toFixed(2)}`}
        />
      </div>

      {isError && (
        <div className="mt-4 hud-panel p-6 text-center text-sm text-destructive">
          Failed to load ledger data. Please try again.
        </div>
      )}

      {isLoading && (
        <div className="mt-4 hud-panel p-6 text-center text-sm text-muted-foreground">
          Loading ledger data…
        </div>
      )}

      {data && data.length === 0 && (
        <div className="mt-4 hud-panel p-8 text-center text-sm text-muted-foreground">
          No gear with flight hours recorded yet. Log sessions against your gear
          in the hanger and flight log to populate this ledger.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="mt-6 space-y-6">
          {/* Gear Categories */}
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="text-lg font-semibold mb-3">
                Gear Categories
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-3 rounded bg-white/50">
                  <BatteryCharging className="h-6 w-6 text-muted-foreground mb-2" />
                  <div className="font-semibold">{batteryData.length}</div>
                  <div className="text-xs text-muted-foreground">
                    Batteries
                  </div>
                </div>
                <div className="text-center p-3 rounded bg-white/50">
                  <Cpu className="h-6 w-6 text-muted-foreground mb-2" />
                  <div className="font-semibold">{quadData.length}</div>
                  <div className="text-xs text-muted-foreground">
                    Drones (Quads)
                  </div>
                </div>
                <div className="text-center p-3 rounded bg-white/50">
                  <Radio className="h-6 w-6 text-muted-foreground mb-2" />
                  <div className="font-semibold">{transmitterData.length}</div>
                  <div className="text-xs text-muted-foreground">
                    Transmitters
                  </div>
                </div>
                <div className="text-center p-3 rounded bg-white/50">
                  <Glasses className="h-6 w-6 text-muted-foreground mb-2" />
                  <div className="font-semibold">{goggleData.length}</div>
                  <div className="text-xs text-muted-foreground">
                    Goggles
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cost per Hour by Gear (Bar Chart) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Cost per Hour by Gear
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ left: 24 }}
                >
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
                    formatter={(value: number) => [
                      `$${value.toFixed(2)}`,
                      "Cost/Hour",
                    ]}
                  />
                  <Bar
                    dataKey="cost_per_hour"
                    fill="var(--primary)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cost Distribution by Gear (Pie Chart) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Cost Distribution by Gear
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <RePieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    outerRadius={100}
                    fill="#6366f1"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                    formatter={(value: number) => [
                      `$${value.toFixed(2)}`,
                      "Total Cost",
                    ]}
                  />
                  <Legend />
                </RePieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Per-Gear Ledger Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Per-Gear Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs uppercase font-semibold text-muted-foreground">
                      Gear
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase font-semibold text-muted-foreground">
                      Type
                    </th>
                    <th className="text-right py-2 px-3 text-xs uppercase font-semibold text-muted-foreground">
                      Purchase
                    </th>
                    <th className="text-right py-2 px-3 text-xs uppercase font-semibold text-muted-foreground">
                      Repairs
                    </th>
                    <th className="text-right py-2 px-3 text-xs uppercase font-semibold text-muted-foreground">
                      Total Cost
                    </th>
                    <th className="text-right py-2 px-3 text-xs uppercase font-semibold text-muted-foreground">
                      Flight Hrs
                    </th>
                    <th className="text-right py-2 px-3 text-xs uppercase font-semibold text-muted-foreground">
                      Cost/Hr
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((gear) => (
                    <tr
                      key={gear.gear_id}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="py-2 px-3 font-medium">{gear.gear_name}</td>
                      <td className="py-2 px-3 capitalize text-muted-foreground">
                        {gear.gear_type}
                      </td>
                      <td className="text-right py-2 px-3 font-mono">
                        ${(gear.purchase_cost ?? 0).toFixed(2)}
                      </td>
                      <td className="text-right py-2 px-3 font-mono text-destructive">
                        ${(gear.repair_cost ?? 0).toFixed(2)}
                      </td>
                      <td className="text-right py-2 px-3 font-mono font-semibold">
                        ${(gear.total_cost ?? 0).toFixed(2)}
                      </td>
                      <td className="text-right py-2 px-3 font-mono">
                        {(gear.flight_hours ?? 0).toFixed(1)}h
                      </td>
                      <td className="text-right py-2 px-3 font-mono text-primary font-bold">
                        ${(gear.cost_per_hour ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-muted/20">
                    <td colSpan={2} className="py-2 px-3 text-right">
                      Totals
                    </td>
                    <td className="text-right py-2 px-3 font-mono">
                      ${summary.total_investment.toFixed(2)}
                    </td>
                    <td className="text-right py-2 px-3 font-mono text-destructive">
                      ${summary.total_repairs.toFixed(2)}
                    </td>
                    <td className="text-right py-2 px-3 font-mono">
                      ${summary.total_cost.toFixed(2)}
                    </td>
                    <td className="text-right py-2 px-3 font-mono">
                      {summary.total_flight_hours.toFixed(1)}h
                    </td>
                    <td className="text-right py-2 px-3 font-mono text-primary">
                      ${summary.total_cost_per_hour.toFixed(2)}/h
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}