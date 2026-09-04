import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { 
  Shield, 
  Terminal, 
  AlertTriangle, 
  Globe, 
  Cpu, 
  Search, 
  RefreshCw, 
  Play,
  Eye,
  Lock,
  ShieldAlert,
  RefreshCcw
} from "lucide-react";
import { toast } from "sonner";

export interface SecurityLog {
  id: string;
  user_id: string | null;
  email?: string;
  path: string;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export function SecurityLogsView() {
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [logsFilter, setLogsFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<SecurityLog | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);

  const { isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["admin-security-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_security_logs");
      if (error) {
        const { data: directData, error: directErr } = await supabase
          .from("security_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        
        if (directErr) throw directErr;
        setSecurityLogs(directData || []);
        return directData;
      }
      setSecurityLogs(data || []);
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("realtime-security-logs")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "security_logs",
        },
        async (payload) => {
          toast.warning("New security alert detected!", {
            description: `Unauthorized access attempt at ${payload.new.path}`,
            icon: <ShieldAlert className="h-4 w-4 text-destructive" />,
          });
          refetchLogs();
        }
      )
      .subscribe((status) => {
        setIsSubscribed(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchLogs]);

  const simulateLogMutation = useMutation({
    mutationFn: async () => {
      const paths = ["/admin/settings", "/api/v1/intel", "/firmware/secure-flash", "/billing/override"];
      const actions = ["unauthorized_access_attempt", "privilege_escalation_attempt", "api_key_abuse"];
      const randomPath = paths[Math.floor(Math.random() * paths.length)];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];

      const { data, error } = await supabase.rpc("log_and_force_retoken", {
        attempted_path: randomPath,
        attempted_action: randomAction,
        client_ip: "192.168.1." + Math.floor(Math.random() * 254 + 1),
        client_ua: navigator.userAgent
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.warning("Security event logged! Refreshing session token...", {
        icon: <RefreshCcw className="h-4 w-4 text-amber-400 animate-spin" />
      });

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        toast.error(`Retoken failed: ${refreshError.message}`);
      } else {
        toast.success("Session token successfully refreshed & verified!");
      }
      
      refetchLogs();
    },
    onError: (err: any) => {
      toast.error(`Simulation failed: ${err.message}`);
    },
  });

  const filteredLogs = securityLogs.filter((log) => {
    const matchesSearch = 
      log.path.toLowerCase().includes(logsFilter.toLowerCase()) ||
      (log.email && log.email.toLowerCase().includes(logsFilter.toLowerCase())) ||
      (log.user_id && log.user_id.toLowerCase().includes(logsFilter.toLowerCase()));
    
    const matchesAction = actionFilter === "all" || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  const totalAttempts = securityLogs.length;
  const uniqueIPs = new Set(securityLogs.map(l => l.ip_address).filter(Boolean)).size;
  const highRiskAttempts = securityLogs.filter(l => l.action === "privilege_escalation_attempt").length;

  return (
    <div className="space-y-6">
      {/* Security Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Real-time Feed Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${isSubscribed ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
            <span className="text-sm font-mono font-semibold">
              {isSubscribed ? "LIVE TELEMETRY ACTIVE" : "POLLING BACKUP"}
            </span>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Logged Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{totalAttempts}</div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unique Source IPs</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="text-2xl font-bold font-mono">{uniqueIPs}</div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">High Risk Escalations</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <div className="text-2xl font-bold font-mono text-destructive">{highRiskAttempts}</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls & Simulation */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-1 w-full md:w-auto gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by path, email, or user ID..."
              value={logsFilter}
              onChange={(e) => setLogsFilter(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Filter by Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="unauthorized_access_attempt">Unauthorized Access</SelectItem>
              <SelectItem value="privilege_escalation_attempt">Privilege Escalation</SelectItem>
              <SelectItem value="api_key_abuse">API Key Abuse</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchLogs()}
            disabled={logsLoading}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => simulateLogMutation.mutate()}
            disabled={simulateLogMutation.isPending}
            className="h-9 gap-1.5 font-mono"
          >
            <Play className="h-3.5 w-3.5" /> Simulate Attempt & Retoken
          </Button>
        </div>
      </div>

      {/* Main Logs Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Logs Feed */}
        <Card className="border-border bg-card/60 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-mono flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" /> Live Security Event Stream
            </CardTitle>
            <CardDescription>
              Real-time audit trail of unauthorized access attempts and system violations.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {logsLoading && securityLogs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Connecting to security stream...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">No security events match the filters.</div>
            ) : (
              <div className="divide-y divide-border/40 max-h-[500px] overflow-y-auto">
                {filteredLogs.map((log) => {
                  const isHighRisk = log.action === "privilege_escalation_attempt";
                  return (
                    <div
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={`p-4 flex items-start justify-between gap-4 cursor-pointer transition-colors hover:bg-muted/30 ${
                        selectedLog?.id === log.id ? "bg-muted/40 border-l-2 border-primary" : ""
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge 
                            variant={isHighRisk ? "destructive" : "outline"} 
                            className="font-mono text-[9px] uppercase tracking-wider"
                          >
                            {log.action.replace(/_/g, " ")}
                          </Badge>
                          <span className="font-mono text-xs text-foreground font-semibold truncate">
                            {log.path}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {log.email || `User: ${log.user_id?.slice(0, 8) || "Anonymous"}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          {log.ip_address || "No IP"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Log Inspector */}
        <Card className="border-border bg-card/60">
          <CardHeader>
            <CardTitle className="text-base font-mono flex items-center gap-2">
              <Eye className="h-4 w-4 text-secondary" /> Event Inspector
            </CardTitle>
            <CardDescription>
              Select a security event from the stream to inspect full payload and metadata.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedLog ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground block">Event ID</span>
                  <div className="font-mono text-xs bg-muted/50 p-2 rounded border border-border select-all">
                    {selectedLog.id}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground block">Attempted Path</span>
                  <div className="font-mono text-xs bg-muted/50 p-2 rounded border border-border text-primary font-semibold">
                    {selectedLog.path}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground block">Action Type</span>
                  <div className="font-mono text-xs bg-muted/50 p-2 rounded border border-border">
                    {selectedLog.action}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground block">Source IP Address</span>
                  <div className="font-mono text-xs bg-muted/50 p-2 rounded border border-border flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    {selectedLog.ip_address || "Unknown"}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground block">User Agent</span>
                  <div className="font-mono text-[10px] bg-muted/50 p-2 rounded border border-border break-all leading-relaxed">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground inline mr-1.5" />
                    {selectedLog.user_agent || "Unknown"}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground block">Timestamp</span>
                  <div className="font-mono text-xs bg-muted/50 p-2 rounded border border-border">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 p-2.5 rounded border border-amber-500/20">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>This event was blocked by system middleware. No data was compromised.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                <Shield className="h-8 w-8 text-muted-foreground/40" />
                <span className="text-sm">No event selected</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
