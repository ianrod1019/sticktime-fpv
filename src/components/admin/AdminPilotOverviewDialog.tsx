import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Eye, Lock, Activity, Wrench, Clock, CalendarDays } from "lucide-react";

/**
 * Admin support view for ONE pilot — deliberately aggregate-only. The
 * `admin_get_pilot_overview` RPC returns counts, totals and account flags,
 * never the pilot's actual sessions/gear/logs, so support staff can answer
 * "is this account active? what tier?" without reading private content.
 * Every invocation is audit-logged server-side (actor + target + time).
 */

interface PilotOverview {
  account: {
    id: string;
    callsign: string;
    tier: string;
    role: string;
    created_at: string;
    banned_now: boolean;
  } | null;
  usage: {
    session_count: number;
    total_minutes: number;
    last_activity: string | null;
    gear_count: number;
    maintenance_logs: number;
  };
}

export function AdminPilotOverviewDialog({
  pilotId,
  pilotEmail,
  open,
  onOpenChange,
}: {
  pilotId: string | null;
  pilotEmail?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-pilot-overview", pilotId],
    enabled: open && !!pilotId,
    staleTime: 60_000,
    queryFn: async (): Promise<PilotOverview> => {
      const { data, error } = await supabase.rpc("admin_get_pilot_overview", {
        p_user_id: pilotId!,
      });
      if (error) throw error;
      return data as PilotOverview;
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/30 bg-background/95 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-foreground">
            <Eye className="h-4 w-4 text-primary" /> Pilot overview
          </DialogTitle>
          <DialogDescription className="font-mono text-[11px]">
            {pilotEmail ?? pilotId?.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-success/25 bg-success/5 p-2.5 text-[11px] text-success">
          <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Aggregate data only — this view never exposes the pilot's sessions,
            gear or logs, and opening it was recorded in the admin audit trail.
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading overview…
          </div>
        ) : isError || !data ? (
          <div className="py-8 text-center text-sm text-destructive">
            {(error as Error | null)?.message ?? "Could not load overview"}
          </div>
        ) : (
          <div className="space-y-4">
            {data.account && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {data.account.callsign}
                  </span>
                  <Badge
                    variant={data.account.tier !== "free" ? "default" : "outline"}
                    className="font-mono text-[10px]"
                  >
                    {data.account.tier}
                  </Badge>
                  <Badge
                    variant={data.account.banned_now ? "destructive" : "secondary"}
                    className="font-mono text-[10px]"
                  >
                    {data.account.banned_now ? "banned" : "active"}
                  </Badge>
                  {(data.account.role === "admin" || data.account.role === "dev") && (
                    <Badge variant="outline" className="font-mono text-[10px] border-warning/40 text-warning">
                      {data.account.role}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  Joined {new Date(data.account.created_at).toLocaleDateString()}
                  <span className="font-mono text-[9px]">· {data.account.id.slice(0, 8)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Activity className="h-3 w-3" /> Sessions
                </div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                  {data.usage.session_count}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Clock className="h-3 w-3" /> Airtime
                </div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                  {Math.round(data.usage.total_minutes / 60)}h
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Wrench className="h-3 w-3" /> Gear items
                </div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                  {data.usage.gear_count}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Wrench className="h-3 w-3" /> Service logs
                </div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                  {data.usage.maintenance_logs}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Last activity:{" "}
              {data.usage.last_activity
                ? new Date(data.usage.last_activity).toLocaleString()
                : "never"}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
