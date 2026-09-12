import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  Users,
  Activity,
  TrendingUp,
  ShieldAlert,
  Database,
  Eye,
  Lock,
} from "lucide-react";

/**
 * High-level platform analytics for admins. Backed exclusively by the
 * `admin_get_analytics` RPC, which returns aggregate counts/sums only — no
 * per-user rows exist in the payload, so this view cannot expose another
 * pilot's data even to an admin. Every load of this data is written to the
 * admin audit trail server-side.
 */

interface Analytics {
  revenue: {
    mrr_estimated_usd: number;
    paying_count: number;
    tier_counts: Record<string, number>;
  };
  growth: { week_start: string; signups: number }[];
  engagement: {
    active_7d: number;
    active_30d: number;
    sessions_24h: number;
    total_minutes_30d: number;
    total_gear: number;
  };
  accounts: { total: number; banned_now: number; admins: number };
  generated_at: string;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const TIER_ORDER = ["free", "pro", "elite", "enterprise"] as const;

function MetricTile({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className="border-border bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold font-mono tabular-nums ${accent ? "text-primary" : ""}`}
        >
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function AdminAnalyticsDashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async (): Promise<Analytics> => {
      const { data, error } = await supabase.rpc("admin_get_analytics");
      if (error) throw error;
      return data as Analytics;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="h-28 animate-pulse border-border bg-card/40" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-6 text-sm text-destructive">
          Analytics unavailable: {(error as Error | null)?.message ?? "unknown error"}
        </CardContent>
      </Card>
    );
  }

  const totalAccounts = Math.max(1, data.accounts.total);
  const payingPct = Math.round((data.revenue.paying_count / totalAccounts) * 100);
  const maxSignups = Math.max(1, ...data.growth.map((g) => g.signups));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
        <Lock className="h-3.5 w-3.5 text-success" />
        Aggregate data only — per-user rows are never exposed here, and every
        analytics view is audit-logged.
      </div>

      {/* Revenue & accounts */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile
          label="Estimated MRR"
          value={usd.format(data.revenue.mrr_estimated_usd)}
          hint="Tier price × pilot count"
          icon={<DollarSign className="h-4 w-4 text-success" />}
          accent
        />
        <MetricTile
          label="Paying pilots"
          value={String(data.revenue.paying_count)}
          hint={`${payingPct}% of ${data.accounts.total} accounts`}
          icon={<Users className="h-4 w-4 text-primary" />}
        />
        <MetricTile
          label="Active (30d)"
          value={String(data.engagement.active_30d)}
          hint={`${data.engagement.active_7d} in the last 7 days`}
          icon={<Activity className="h-4 w-4 text-chart-1" />}
        />
        <MetricTile
          label="Banned accounts"
          value={String(data.accounts.banned_now)}
          hint={`${data.accounts.admins} admin/dev accounts`}
          icon={<ShieldAlert className="h-4 w-4 text-destructive" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tier mix */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono">Tier distribution</CardTitle>
            <CardDescription>Where revenue comes from</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {TIER_ORDER.map((tier) => {
              const n = data.revenue.tier_counts[tier] ?? 0;
              const pct = Math.round((n / totalAccounts) * 100);
              const paid = tier !== "free";
              return (
                <div key={tier}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono uppercase tracking-wider text-muted-foreground">
                      {tier}
                    </span>
                    <span className="font-mono text-foreground">
                      {n} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${paid ? "bg-primary" : "bg-muted-foreground/40"}`}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Growth */}
        <Card className="border-border bg-card/60 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Signups — last 8
              weeks
            </CardTitle>
            <CardDescription>New pilot accounts per week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-32">
              {data.growth.map((week) => (
                <div
                  key={week.week_start}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${week.signups} signups — week of ${week.week_start}`}
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {week.signups}
                  </span>
                  <div
                    className="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors"
                    style={{
                      height: `${Math.max(4, (week.signups / maxSignups) * 100)}%`,
                    }}
                  />
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {new Date(week.week_start).toLocaleDateString("en-US", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Engagement detail */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile
          label="Sessions (24h)"
          value={String(data.engagement.sessions_24h)}
          hint="All flight modes"
          icon={<Activity className="h-4 w-4 text-chart-2" />}
        />
        <MetricTile
          label="Airtime (30d)"
          value={`${Math.round(data.engagement.total_minutes_30d / 60)}h`}
          hint="Total logged flight minutes"
          icon={<Activity className="h-4 w-4 text-chart-1" />}
        />
        <MetricTile
          label="Registered gear"
          value={String(data.engagement.total_gear)}
          hint="Quads, packs, radios, goggles"
          icon={<Database className="h-4 w-4 text-chart-3" />}
        />
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Data freshness
            </CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="font-mono text-[10px]">
              {new Date(data.generated_at).toLocaleTimeString()}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">
              Refreshes every 5 minutes
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
