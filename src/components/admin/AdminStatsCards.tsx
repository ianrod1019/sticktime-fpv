import { useQuery } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Wrench, Activity } from "lucide-react";

export function AdminStatsCards() {
  const { data: profilesCount } = useQuery({
    queryKey: ["admin-profiles-count"],
    queryFn: async () => {
      const { count, error } = await db_request({
        mode: "query",
        schema: "public",
        table: "profiles",
        operation: "count",
        count: "exact",
        requireAdmin: true,
      });
      if (error) return 0;
      return count || 0;
    },
  });

  const { data: gearCount } = useQuery({
    queryKey: ["admin-gear-count"],
    queryFn: async () => {
      const gearTables = [
        "batteries",
        "drones",
        "transmitters",
        "goggles",
        "other_gear",
      ];
      const promises = gearTables.map(async (table) => {
        const { count } = await db_request({
          mode: "query",
          schema: "personal_gear",
          table,
          operation: "count",
          count: "exact",
        });
        return count ?? 0;
      });
      const counts = await Promise.all(promises);
      const total = counts.reduce((sum, count) => sum + count, 0);
      return total;
    },
  });

  const { data: sessionsCount } = useQuery({
    queryKey: ["admin-sessions-count"],
    queryFn: async () => {
      const { count, error } = await db_request({
        mode: "query",
        schema: "public",
        table: "sessions",
        operation: "count",
        count: "exact",
        requireAdmin: true,
      });
      if (error) return 0;
      return count || 0;
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="border-border bg-card/60 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Synced Pilot Accounts
          </CardTitle>
          <Users className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{profilesCount ?? "..."}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Managed via public.profiles
          </p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/60 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Global Fleet Hangar
          </CardTitle>
          <Wrench className="h-4 w-4 text-secondary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{gearCount ?? "..."}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Total registered aircraft & gear
          </p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/60 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Flight Logs
          </CardTitle>
          <Activity className="h-4 w-4 text-chart-1" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{sessionsCount ?? "..."}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Recorded flight telemetry sessions
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
