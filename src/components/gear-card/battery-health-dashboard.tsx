import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Battery, Zap, AlertTriangle, TrendingDown, TrendingUp, Minus, Plus, BarChart2, RefreshCw, Lock, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import type { Database } from "@/integrations/supabase/types";

type BatteryPack = Database["public"]["Tables"]["battery_packs"]["Row"];
type BatteryHealthReading = Database["public"]["Tables"]["battery_health_readings"]["Row"];

interface BatteryHealthDashboardProps {
  gearId: string;
  packCount: number;
}

interface VoltageSagDataPoint {
  date: string;
  voltageAtRest: number;
  voltageUnderLoad: number;
  voltageSagPercent: number;
  internalResistance: number;
  currentDraw: number;
}

interface PackHealthSummary {
  pack: BatteryPack;
  readings: BatteryHealthReading[];
  trend: "improving" | "stable" | "degrading";
  avgVoltageSag: number;
  avgInternalResistance: number;
  readingCount: number;
}

export function BatteryHealthDashboard({ gearId, packCount }: BatteryHealthDashboardProps) {
  const [packs, setPacks] = useState<BatteryPack[]>([]);
  const [readings, setReadings] = useState<BatteryHealthReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [proAccess, setProAccess] = useState<{ hasAccess: boolean; userRole: string; userTier: string } | null>(null);
  const [showProWall, setShowProWall] = useState(false);

  useEffect(() => {
    checkProAccess();
    loadData();
  }, [gearId]);

  const checkProAccess = async () => {
    try {
      const { data, error } = await supabase.rpc("get_pro_access_details");
      if (!error && data?.[0]) {
        setProAccess(data[0]);
        if (!data[0].has_access) {
          setShowProWall(true);
        }
      }
    } catch (err) {
      console.error("Error checking pro access:", err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // First load packs
      const { data: packsData } = await db_request({
        mode: "query",
        table: "battery_packs",
        operation: "select",
        selectColumns: "*",
        filters: { gear_id: gearId },
      });
      
      // Then load readings based on pack IDs
      const { data: readingsData } = await db_request({
        mode: "query",
        table: "battery_health_readings",
        operation: "select",
        selectColumns: "*",
        filters: { battery_pack_id: { in: (packsData || []).map((p) => p.id) } },
      });

      if (packsData) setPacks(packsData);
      if (readingsData) setReadings(readingsData);
    } catch (err) {
      console.error("Error loading battery health data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getPackReadings = (packId: string): BatteryHealthReading[] => {
    return readings.filter((r) => r.battery_pack_id === packId);
  };

  const calculateTrend = (packReadings: BatteryHealthReading[]): "improving" | "stable" | "degrading" => {
    if (packReadings.length < 3) return "stable";
    const recent = packReadings.slice(-3);
    const older = packReadings.slice(0, 3);
    const recentAvgSag = recent.reduce((sum, r) => sum + (r.voltage_sag_percent || 0), 0) / recent.length;
    const olderAvgSag = older.reduce((sum, r) => sum + (r.voltage_sag_percent || 0), 0) / older.length;
    const diff = recentAvgSag - olderAvgSag;
    if (diff > 1) return "degrading";
    if (diff < -1) return "improving";
    return "stable";
  };

  const formatVoltageSagData = (packReadings: BatteryHealthReading[]): VoltageSagDataPoint[] => {
    return packReadings.map((r) => ({
      date: new Date(r.recorded_at).toLocaleDateString(),
      voltageAtRest: r.voltage_at_rest_volts,
      voltageUnderLoad: r.voltage_under_load_volts,
      voltageSagPercent: r.voltage_sag_percent || 0,
      internalResistance: r.calculated_internal_resistance_milliohm || 0,
      currentDraw: r.current_draw_amps,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        <span className="ml-2 text-xs text-muted-foreground">Loading battery health data...</span>
      </div>
    );
  }

  if (showProWall && proAccess) {
    return (
      <ProWallFeature
        featureName="LiPo Health & IR Tracking"
        description="Voltage sag curve analytics, pack degradation alerts, and internal resistance monitoring over time."
        userRole={proAccess.userRole}
        userTier={proAccess.userTier}
      />
    );
  }

  const packSummaries: PackHealthSummary[] = packs.map((pack) => {
    const packReadings = getPackReadings(pack.id);
    return {
      pack,
      readings: packReadings,
      trend: calculateTrend(packReadings),
      avgVoltageSag: packReadings.length > 0
        ? packReadings.reduce((sum, r) => sum + (r.voltage_sag_percent || 0), 0) / packReadings.length
        : 0,
      avgInternalResistance: packReadings.length > 0
        ? packReadings.reduce((sum, r) => sum + (r.calculated_internal_resistance_milliohm || 0), 0) / packReadings.length
        : 0,
      readingCount: packReadings.length,
    };
  });

  if (packs.length === 0) {
    return (
      <div className="text-center py-8">
        <Battery className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
        <h3 className="text-sm font-medium text-foreground">No Battery Packs Configured</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Add battery packs to this set to start tracking LiPo health and IR analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="text-xs">
            <Battery className="h-3 w-3 mr-1" /> Overview
          </TabsTrigger>
          <TabsTrigger value="voltage-sag" className="text-xs">
            <Zap className="h-3 w-3 mr-1" /> Voltage Sag
          </TabsTrigger>
          <TabsTrigger value="ir-tracking" className="text-xs">
            <BarChart2 className="h-3 w-3 mr-1" /> IR Tracking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {packSummaries.map((summary) => (
              <PackOverviewCard key={summary.pack.id} summary={summary} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="voltage-sag" className="space-y-4">
          <VoltageSagChart packs={packSummaries} selectedPack={selectedPack} onSelectPack={setSelectedPack} />
        </TabsContent>

        <TabsContent value="ir-tracking" className="space-y-4">
          <InternalResistanceChart packs={packSummaries} selectedPack={selectedPack} onSelectPack={setSelectedPack} />
        </TabsContent>
      </Tabs>

      <PackDegradationAlerts packs={packSummaries} />
    </div>
  );
}

function PackOverviewCard({ summary }: { summary: PackHealthSummary }) {
  const { pack, trend, avgVoltageSag, avgInternalResistance, readingCount } = summary;
  const healthColor = pack.health_percentage >= 80 ? "success" : pack.health_percentage >= 60 ? "warning" : "destructive";
  const trendIcon = trend === "improving" ? <TrendingUp className="h-3 w-3 text-success" /> : trend === "degrading" ? <TrendingDown className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-muted-foreground" />;

  return (
    <Card className="bg-card/50 border-primary/10">
      <CardContent className="p-3 pt-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Battery className="h-4 w-4 text-primary" />
            <span className="font-mono text-xs font-medium">Pack #{pack.pack_number}</span>
          </div>
          <Badge variant={healthColor === "success" ? "default" : healthColor === "warning" ? "secondary" : "destructive"} className="text-[10px]">
            {pack.health_percentage.toFixed(1)}%
          </Badge>
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Capacity</span>
            <span className="font-mono">
              {pack.current_capacity_mah > 0 ? `${pack.current_capacity_mah} mAh` : "N/A"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IR</span>
            <span className="font-mono">
              {avgInternalResistance > 0 ? `${avgInternalResistance.toFixed(1)} mΩ` : "N/A"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Sag</span>
            <span className="font-mono">
              {avgVoltageSag > 0 ? `${avgVoltageSag.toFixed(1)}%` : "N/A"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Trend</span>
            <span className="flex items-center gap-1">{trendIcon}<span className="capitalize">{trend}</span></span>
          </div>
          <div className="flex justify-between pt-1 border-t border-primary/10">
            <span className="text-muted-foreground">Readings</span>
            <span className="font-mono">{readingCount}</span>
          </div>
        </div>
        <Progress value={pack.health_percentage} className="mt-2 h-1.5" />
      </CardContent>
    </Card>
  );
}

function VoltageSagChart({ packs, selectedPack, onSelectPack }: { packs: PackHealthSummary[]; selectedPack: string | null; onSelectPack: (id: string | null) => void }) {
  const selectedPackData = packs.find((p) => p.pack.id === selectedPack) || packs[0];

  if (!selectedPackData || selectedPackData.readings.length === 0) {
    return (
      <Card className="bg-card/50 border-primary/10">
        <CardContent className="p-6 text-center">
          <Zap className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No voltage sag data available. Record flight sessions to build analytics.</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = selectedPackData.readings.map((r) => ({
    date: new Date(r.recorded_at).toLocaleDateString(),
    voltageAtRest: r.voltage_at_rest_volts,
    voltageUnderLoad: r.voltage_under_load_volts,
    voltageSagPercent: r.voltage_sag_percent || 0,
  }));

  return (
    <Card className="bg-card/50 border-primary/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-1">
            <Zap className="h-3 w-3" /> Voltage Sag Curve - Pack #{selectedPackData.pack.pack_number}
          </CardTitle>
          <select
            value={selectedPack || ""}
            onChange={(e) => onSelectPack(e.target.value || null)}
            className="text-xs border border-primary/20 bg-background px-2 py-1 rounded"
          >
            {packs.map((p) => (
              <option key={p.pack.id} value={p.pack.id}>
                Pack #{p.pack.pack_number} ({p.readingCount} readings)
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--primary) / 0.1)" />
              <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--primary) / 0.2)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
                formatter={(value: number, name: string) => {
                  if (name === "voltageSagPercent") return [`${value.toFixed(1)}%`, "Voltage Sag"];
                  if (name === "voltageAtRest" || name === "voltageUnderLoad") return [`${value.toFixed(2)}V`, name];
                  return [value, name];
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="voltageAtRest"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                dot={false}
                name="Voltage at Rest"
              />
              <Line
                type="monotone"
                dataKey="voltageUnderLoad"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                name="Voltage Under Load"
              />
              <Line
                type="monotone"
                dataKey="voltageSagPercent"
                stroke="hsl(var(--warning))"
                strokeWidth={2}
                dot={false}
                name="Voltage Sag %"
                yAxisId="right"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-success rounded" /> Rest</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary rounded" /> Load</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-warning rounded" /> Sag %</span>
        </div>
      </CardContent>
    </Card>
  );
}

function InternalResistanceChart({ packs, selectedPack, onSelectPack }: { packs: PackHealthSummary[]; selectedPack: string | null; onSelectPack: (id: string | null) => void }) {
  const selectedPackData = packs.find((p) => p.pack.id === selectedPack) || packs[0];

  if (!selectedPackData || selectedPackData.readings.length === 0) {
    return (
      <Card className="bg-card/50 border-primary/10">
        <CardContent className="p-6 text-center">
          <BarChart2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No internal resistance data available. Record flight sessions to build analytics.</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = selectedPackData.readings.map((r) => ({
    date: new Date(r.recorded_at).toLocaleDateString(),
    internalResistance: r.calculated_internal_resistance_milliohm || 0,
    currentDraw: r.current_draw_amps,
  }));

  return (
    <Card className="bg-card/50 border-primary/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-1">
            <BarChart2 className="h-3 w-3" /> Internal Resistance Tracking - Pack #{selectedPackData.pack.pack_number}
          </CardTitle>
          <select
            value={selectedPack || ""}
            onChange={(e) => onSelectPack(e.target.value || null)}
            className="text-xs border border-primary/20 bg-background px-2 py-1 rounded"
          >
            {packs.map((p) => (
              <option key={p.pack.id} value={p.pack.id}>
                Pack #{p.pack.pack_number} ({p.readingCount} readings)
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--primary) / 0.1)" />
              <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--primary) / 0.2)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
                formatter={(value: number, name: string) => {
                  if (name === "internalResistance") return [`${value.toFixed(1)} mΩ`, "Internal Resistance"];
                  if (name === "currentDraw") return [`${value.toFixed(1)}A`, "Current Draw"];
                  return [value, name];
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="internalResistance"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={false}
                name="Internal Resistance (mΩ)"
              />
              <Line
                type="monotone"
                dataKey="currentDraw"
                stroke="hsl(var(--primary))"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="Current Draw (A)"
                yAxisId="right"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-destructive rounded" /> IR (mΩ)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary rounded" style={{ strokeDasharray: "5 5" }} /> Current (A)</span>
        </div>
      </CardContent>
    </Card>
  );
}

function PackDegradationAlerts({ packs }: { packs: PackHealthSummary[] }) {
  const alerts = packs.flatMap((summary) => {
    const alerts: Array<{ pack: number; type: "warning" | "critical" | "info"; message: string; icon: React.ReactNode }> = [];
    const { pack, trend, avgVoltageSag, avgInternalResistance, readingCount } = summary;

    if (readingCount < 3) {
      alerts.push({
        pack: pack.pack_number,
        type: "info",
        message: `Only ${readingCount} reading(s) recorded. Need at least 3 for trend analysis.`,
        icon: <BarChart2 className="h-3 w-3" />,
      });
    }

    if (pack.health_percentage < 60) {
      alerts.push({
        pack: pack.pack_number,
        type: "critical",
        message: `Pack health critically low at ${pack.health_percentage.toFixed(1)}%. Consider retirement.`,
        icon: <AlertTriangle className="h-3 w-3" />,
      });
    } else if (pack.health_percentage < 80) {
      alerts.push({
        pack: pack.pack_number,
        type: "warning",
        message: `Pack health degraded to ${pack.health_percentage.toFixed(1)}%. Monitor closely.`,
        icon: <AlertTriangle className="h-3 w-3" />,
      });
    }

    if (avgInternalResistance > 15) {
      alerts.push({
        pack: pack.pack_number,
        type: "critical",
        message: `High internal resistance (${avgInternalResistance.toFixed(1)} mΩ avg). Performance severely impacted.`,
        icon: <Zap className="h-3 w-3" />,
      });
    } else if (avgInternalResistance > 8) {
      alerts.push({
        pack: pack.pack_number,
        type: "warning",
        message: `Elevated internal resistance (${avgInternalResistance.toFixed(1)} mΩ avg). Degradation detected.`,
        icon: <Zap className="h-3 w-3" />,
      });
    }

    if (avgVoltageSag > 15) {
      alerts.push({
        pack: pack.pack_number,
        type: "critical",
        message: `Severe voltage sag (${avgVoltageSag.toFixed(1)}% avg). Pack cannot deliver power under load.`,
        icon: <TrendingDown className="h-3 w-3" />,
      });
    } else if (avgVoltageSag > 8) {
      alerts.push({
        pack: pack.pack_number,
        type: "warning",
        message: `Elevated voltage sag (${avgVoltageSag.toFixed(1)}% avg). Reduced performance under load.`,
        icon: <TrendingDown className="h-3 w-3" />,
      });
    }

    if (trend === "degrading" && readingCount >= 3) {
      alerts.push({
        pack: pack.pack_number,
        type: "warning",
        message: "Degrading trend detected. Voltage sag and IR increasing over recent readings.",
        icon: <TrendingDown className="h-3 w-3" />,
      });
    } else if (trend === "improving" && readingCount >= 3) {
      alerts.push({
        pack: pack.pack_number,
        type: "info",
        message: "Improving trend detected. Recent readings show better performance.",
        icon: <TrendingUp className="h-3 w-3" />,
      });
    }

    return alerts;
  });

  if (alerts.length === 0) {
    return (
      <Card className="bg-card/50 border-primary/10">
        <CardContent className="p-4 text-center">
          <Badge variant="default" className="gap-1.5 text-success border-success/30 bg-success/10">
            <TrendingUp className="h-3 w-3" /> All Packs Healthy
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">No degradation alerts at this time.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-primary/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-warning" /> Degradation Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts
          .sort((a, b) => {
            const order = { critical: 0, warning: 1, info: 2 };
            return order[a.type] - order[b.type];
          })
          .map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 p-2.5 rounded-md text-xs ${
                alert.type === "critical"
                  ? "bg-destructive/10 border border-destructive/30 text-destructive"
                  : alert.type === "warning"
                  ? "bg-warning/10 border border-warning/30 text-warning"
                  : "bg-primary/10 border border-primary/30 text-primary"
              }`}
            >
              <span className="flex-shrink-0 mt-0.5">{alert.icon}</span>
              <span className="flex-1">
                <span className="font-medium">Pack #{alert.pack}:</span> {" "}
                {alert.message}
              </span>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function ProWallFeature({ featureName, description, userRole, userTier }: { featureName: string; description: string; userRole: string; userTier: string }) {
  const isAdmin = userRole === "admin" || userRole === "dev";

  return (
    <Card className="bg-card/50 border-primary/10">
      <CardContent className="p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-medium text-sm mb-1">{featureName}</h3>
        <p className="text-xs text-muted-foreground mb-4">{description}</p>
        <div className="flex items-center justify-center gap-2 mb-4 text-xs">
          <Badge variant="outline" className="gap-1">
            {isAdmin ? <Crown className="h-3 w-3" /> : <Battery className="h-3 w-3" />}
            Current: {userTier || "free"} {isAdmin ? "({userRole})" : ""}
          </Badge>
          <Badge variant="outline" className="gap-1 text-success">
            Required: Pro tier or Admin
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? "As an admin, you have access to all pro features. This feature is gated for non-admin users."
            : "Upgrade to Pro to unlock LiPo Health & IR Tracking analytics."}
        </p>
      </CardContent>
    </Card>
  );
}