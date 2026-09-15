import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, ShieldAlert } from "lucide-react";

interface DirectoryEntry {
  id: string;
  email: string;
  display_name: string;
}

interface ViewAsSnapshot {
  profile: {
    id: string;
    email: string;
    display_name: string;
    role: string;
    tier: string;
    created_at: string;
    is_banned: boolean;
  };
  gear_counts: Record<string, number>;
  flight_stats: {
    total_sessions: number;
    total_minutes: number;
    last_flown_on: string | null;
  };
}

export function ViewAsUserPanel() {
  const [targetId, setTargetId] = useState<string>("");

  const { data: directory, isLoading: directoryLoading } = useQuery({
    queryKey: ["dev-view-as-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_admin_directory");
      if (error) throw error;
      return (data ?? []) as DirectoryEntry[];
    },
  });

  const viewAs = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("admin_view_as_user", {
        p_target_id: id,
      });
      if (error) throw error;
      return data as ViewAsSnapshot;
    },
    onError: (e: Error) => toast.error(e.message || "Failed to load account"),
  });

  const snapshot = viewAs.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4 text-primary" /> View account as
        </CardTitle>
        <CardDescription>
          Read-only account snapshot for support/QA. No writes, no session
          swap — every lookup is written to the immutable admin audit log
          under your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue
                placeholder={
                  directoryLoading ? "Loading pilots…" : "Select a pilot"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(directory ?? []).map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.display_name || entry.email} ({entry.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!targetId || viewAs.isPending}
            onClick={() => viewAs.mutate(targetId)}
          >
            {viewAs.isPending ? "Loading…" : "View"}
          </Button>
        </div>

        {snapshot && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">
                  {snapshot.profile.display_name}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {snapshot.profile.email}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {snapshot.profile.role} / {snapshot.profile.tier}
                </Badge>
                {snapshot.profile.is_banned && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-destructive/40 bg-destructive/10 text-destructive font-mono text-[10px]"
                  >
                    <ShieldAlert className="h-3 w-3" /> Banned
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {Object.entries(snapshot.gear_counts).map(([type, count]) => (
                <div key={type} className="rounded-md border border-white/[0.08] p-2">
                  <p className="text-muted-foreground capitalize">{type}</p>
                  <p className="font-mono text-sm">{count}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-md border border-white/[0.08] p-2">
                <p className="text-muted-foreground">Sessions</p>
                <p className="font-mono text-sm">
                  {snapshot.flight_stats.total_sessions}
                </p>
              </div>
              <div className="rounded-md border border-white/[0.08] p-2">
                <p className="text-muted-foreground">Total minutes</p>
                <p className="font-mono text-sm">
                  {snapshot.flight_stats.total_minutes}
                </p>
              </div>
              <div className="rounded-md border border-white/[0.08] p-2">
                <p className="text-muted-foreground">Last flown</p>
                <p className="font-mono text-sm">
                  {snapshot.flight_stats.last_flown_on?.slice(0, 10) ?? "—"}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
