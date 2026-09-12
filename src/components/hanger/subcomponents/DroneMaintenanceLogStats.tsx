import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench, DollarSign, RefreshCw, TrendingUp } from "lucide-react";

interface MaintenanceEntry {
  id: string;
  description: string;
  performed_on: string;
  cost: number;
  reset_service_clock: boolean;
  changed?: string[];
}

interface DroneMaintenanceLogStatsProps {
  maintenanceLogs: MaintenanceEntry[];
  serviceInterval?: number;
  minutesSinceService?: number;
}

export function DroneMaintenanceLogStats({
  maintenanceLogs,
  serviceInterval,
  minutesSinceService,
}: DroneMaintenanceLogStatsProps) {
  const totalSpent = maintenanceLogs.reduce((sum, log) => sum + (log.cost ?? 0), 0);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Card className="bg-card/50 border-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <Wrench className="h-4 w-4" /> Maintenance Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-muted/30 border border-primary/10 rounded-lg">
            <div className="text-2xl font-mono font-bold text-foreground">
              {maintenanceLogs.length}
            </div>
            <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mt-1">
              Total Entries
            </div>
          </div>
          <div className="text-center p-4 bg-muted/30 border border-primary/10 rounded-lg">
            <div className="flex items-center justify-center mb-2">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div className="text-2xl font-mono font-bold text-foreground">
              ${totalSpent.toFixed(2)}
            </div>
            <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mt-1">
              Total Spent
            </div>
          </div>
          <div className="text-center p-4 bg-muted/30 border border-primary/10 rounded-lg">
            <div className="flex items-center justify-center mb-2">
              <RefreshCw className="h-5 w-5 text-primary" />
            </div>
            <div className="text-2xl font-mono font-bold text-foreground">
              {maintenanceLogs.filter((l) => l.reset_service_clock).length}
            </div>
            <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mt-1">
              Service Resets
            </div>
          </div>
          {serviceInterval && serviceInterval > 0 && (
            <div className="text-center p-4 bg-muted/30 border border-primary/10 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div className="text-2xl font-mono font-bold text-foreground">
                {(serviceInterval ?? 0) - (minutesSinceService ?? 0)}
              </div>
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mt-1">
                Min Until Service
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}