import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Clock,
  Battery,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import type { HangerItem } from "@/hooks/useHangerItem";

interface DroneFlightLedgerProps {
  item: HangerItem;
}

export function DroneFlightLedger({ item }: DroneFlightLedgerProps) {
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getRatingLabel = (rating: number | null) => {
    if (rating === null) return "N/A";
    if (rating >= 4.5) return "Excellent";
    if (rating >= 3.5) return "Good";
    if (rating >= 2.5) return "Fair";
    return "Poor";
  };

  const getRatingColor = (rating: number | null) => {
    if (rating === null) return "bg-muted text-muted-foreground";
    if (rating >= 4.5) return "bg-green-500/20 text-green-400";
    if (rating >= 3.5) return "bg-blue-500/20 text-blue-400";
    if (rating >= 2.5) return "bg-amber-500/20 text-amber-400";
    return "bg-red-500/20 text-red-400";
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Activity className="h-4 w-4" /> Flight Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/30 border border-primary/10 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div className="text-2xl font-mono font-bold text-foreground">
                {formatDuration(item.total_minutes)}
              </div>
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mt-1">
                Total Flight Time
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 border border-primary/10 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Battery className="h-5 w-5 text-primary" />
              </div>
              <div className="text-2xl font-mono font-bold text-foreground">
                {item.pack_count}
              </div>
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mt-1">
                Packs Flown
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 border border-primary/10 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
              </div>
              <div className="text-2xl font-mono font-bold text-foreground">
                {item.crash_count}
              </div>
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mt-1">
                Crashes
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 border border-primary/10 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div className="text-2xl font-mono font-bold text-foreground">
                {item.total_minutes > 0 ? Math.round(item.pack_count / (item.total_minutes / 60)) : 0}
              </div>
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mt-1">
                Packs/Hour
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="text-primary">Flight History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { id: "1", flown_on: "2024-01-15", duration_minutes: 25, packs_flown: 3, crashes: 0, rating: 4.5 },
              { id: "2", flown_on: "2024-01-12", duration_minutes: 18, packs_flown: 2, crashes: 1, rating: 3.0 },
              { id: "3", flown_on: "2024-01-10", duration_minutes: 32, packs_flown: 4, crashes: 0, rating: 4.8 },
              { id: "4", flown_on: "2024-01-08", duration_minutes: 15, packs_flown: 2, crashes: 0, rating: 4.2 },
              { id: "5", flown_on: "2024-01-05", duration_minutes: 28, packs_flown: 3, crashes: 0, rating: 4.0 },
            ].map((flight) => (
              <div
                key={flight.id}
                className="flex items-center justify-between p-3 bg-muted/20 border border-primary/5 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="text-sm font-mono text-foreground">
                    {flight.flown_on}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDuration(flight.duration_minutes)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Battery className="h-3 w-3" />
                    {flight.packs_flown} packs
                  </div>
                  {flight.crashes > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      {flight.crashes} crash{flight.crashes > 1 ? "es" : ""}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${getRatingColor(flight.rating)}`}
                  >
                    {getRatingLabel(flight.rating)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {item.notes && (
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="text-primary">Flight Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/80">{item.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
