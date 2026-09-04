import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Wrench, Activity } from "lucide-react";

export function AdminStatsCards() {
  const { data: profilesCount } = useQuery({
    queryKey: ["admin-profiles-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      if (error) return 0;
      return count || 0;
    },
  });

  const { data: gearCount } = useQuery({
    queryKey: ["admin-gear-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("gear").select("*", { count: "exact", head: true });
      if (error) return 0;
      return count || 0;
    },
  });

  const { data: sessionsCount } = useQuery({
    queryKey: ["admin-sessions-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("sessions").select("*", { count: "exact", head: true });
      if (error) return 0;
      return count || 0;
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="border-border bg-card/60 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Synced Pilot Accounts</CardTitle>
          <Users className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{profilesCount ?? "..."}</div>
          <p className="text-xs text-muted-foreground mt-1">Managed via public.profiles</p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/60 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Global Fleet Hangar</CardTitle>
          <Wrench className="h-4 w-4 text-secondary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{gearCount ?? "..."}</div>
          <p className="text-xs text-muted-foreground mt-1">Total registered aircraft & gear</p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/60 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Flight Logs</CardTitle>
          <Activity className="h-4 w-4 text-chart-1" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{sessionsCount ?? "..."}</div>
          <p className="text-xs text-muted-foreground mt-1">Recorded flight telemetry sessions</p>
        </CardContent>
      </Card>
    </div>
  );
}
