import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowLeft, Shield, Clock, User, Mail, Radio, Activity } from "lucide-react";
import { useState } from "react";

interface AdminLookupSearch {
  token?: string;
}

export const Route = createFileRoute("/_authenticated/admin_lookup/$uuid")({
  validateSearch: (search: Record<string, unknown>): AdminLookupSearch => {
    return {
      token: typeof search.token === "string" ? search.token : undefined,
    };
  },
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw redirect({ to: "/" });
    }

    // Strict admin/developer check
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    const role = (profile?.role || "user").toLowerCase();
    if (role !== "admin" && role !== "dev") {
      throw redirect({ to: "/" });
    }

    return { user: userData.user };
  },
  component: AdminUserLookupComponent,
});

export interface AdminAuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_id: string | null;
  payload: any;
  created_at: string;
}

function AdminUserLookupComponent() {
  const { uuid } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch target profile details & directory info including callsign and email
  const { data: targetData, isLoading: profileLoading } = useQuery({
    queryKey: ["admin-lookup-profile-with-directory", uuid],
    queryFn: async () => {
      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uuid)
        .maybeSingle();

      if (profileError) throw profileError;

      // Fetch user directory info to obtain the exact callsign / email meta
      const { data: directoryList, error: dirError } = await supabase.rpc("admin_get_admin_directory");
      
      let matchedDirectoryUser = null;
      if (!dirError && directoryList) {
        matchedDirectoryUser = (directoryList as any[]).find((u) => u.id === uuid);
      }

      // Fetch email map specifically if available
      let emailMap: Record<string, string> = {};
      try {
        const { data: emailsData } = await supabase.rpc("admin_get_user_emails");
        if (emailsData) {
          (emailsData as any[]).forEach((item) => {
            if (item.id && item.email) emailMap[item.id] = item.email;
          });
        }
      } catch (e) {
        console.warn("Could not fetch user emails:", e);
      }

      return {
        profile,
        directoryUser: matchedDirectoryUser,
        fallbackEmail: emailMap[uuid],
      };
    },
  });

  // Fetch audit logs performed by this specific admin user (excluding session enter/exit actions)
  const { data: auditLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["admin-lookup-logs-actions-only", uuid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_logs")
        .select("*")
        .eq("actor_id", uuid)
        .not("action", "in", '("admin_session_enter","admin_session_exit")')
        .order("created_at", { ascending: false });

      if (error) {
        // Fallback if 'not in' syntax encounters issues
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("admin_audit_logs")
          .select("*")
          .eq("actor_id", uuid)
          .order("created_at", { ascending: false });

        if (fallbackError) throw fallbackError;
        return ((fallbackData || []) as AdminAuditLogEntry[]).filter(
          (l) => l.action !== "admin_session_enter" && l.action !== "admin_session_exit"
        );
      }

      return (data || []) as AdminAuditLogEntry[];
    },
  });

  const isLoading = profileLoading || logsLoading;

  const targetProfile = targetData?.profile;
  const directoryUser = targetData?.directoryUser;
  const fallbackEmail = targetData?.fallbackEmail;

  // Resolve properties cleanly with correct callsign and email
  const fullName = 
    targetProfile?.full_name || 
    directoryUser?.display_name || 
    directoryUser?.callsign || 
    uuid.slice(0, 8);

  const callsign = 
    targetProfile?.callsign || 
    directoryUser?.callsign || 
    "Unassigned";

  const email = 
    fallbackEmail ||
    directoryUser?.email || 
    `pilot_${uuid.slice(0, 6)}@fpv.internal`;

  const filteredLogs = (auditLogs || []).filter((log) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      (log.target_id && log.target_id.toLowerCase().includes(q)) ||
      JSON.stringify(log.payload || {}).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/admin" })}
          className="gap-1.5 font-mono text-xs"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Admin Control Center
        </Button>
        <Badge variant="outline" className="border-success/40 text-success bg-success/10 font-mono text-xs">
          Token Verified: {search.token ? search.token.slice(0, 8) + "..." : "Active"}
        </Badge>
      </div>

      <PageHeader
        title={`Administrator Audit: ${fullName}`}
        subtitle={`Reviewing actions performed by administrator @${callsign}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 border-primary/40 bg-primary/10 text-primary font-mono uppercase">
              <Shield className="h-3.5 w-3.5" /> {targetProfile?.role || directoryUser?.role || "Admin"}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border bg-card/60 md:col-span-1">
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Profile Overview
            </CardTitle>
            <CardDescription>Administrator account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 font-mono text-xs">
            <div className="space-y-1">
              <span className="text-muted-foreground">Full Name:</span>
              <p className="font-semibold text-foreground text-sm">
                {fullName}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <Radio className="h-3 w-3 text-primary" /> Callsign:
              </span>
              <p className="font-semibold text-primary text-sm">
                @{callsign}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3 text-muted-foreground" /> Email:
              </span>
              <p className="text-foreground break-all bg-muted/40 p-2 rounded border border-border/50">
                {email}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">User UUID:</span>
              <p className="text-foreground break-all bg-muted/40 p-2 rounded border border-border/50">
                {uuid}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Security Role:</span>
              <p className="uppercase text-success font-bold">{targetProfile?.role || directoryUser?.role || "admin"}</p>
            </div>
            <div className="pt-2 border-t border-border/50">
              <span className="text-muted-foreground block mb-1">Total Actions Recorded:</span>
              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 font-mono text-xs">
                {auditLogs?.length || 0} Action Events
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 md:col-span-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="font-mono text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" /> Admin Action Audit Trail
                </CardTitle>
                <CardDescription>Showing actions performed and exact timestamps (session events excluded).</CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Filter actions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-8 px-3 text-xs bg-background border border-border rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground font-mono">Loading action audit records...</div>
            ) : !filteredLogs || filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground font-mono">
                No administrative actions recorded for @{callsign}.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-lg border border-border/60 bg-card/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs shadow-sm"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="p-2 rounded-lg border border-primary/30 bg-primary/10 text-primary shrink-0 mt-0.5 sm:mt-0">
                        <Activity className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono text-xs border-primary/40 text-primary bg-primary/5 font-semibold">
                            {log.action}
                          </Badge>
                          {log.target_id && (
                            <span className="text-[11px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/40">
                              Target: {log.target_id.slice(0, 12)}...
                            </span>
                          )}
                        </div>
                        {log.payload && Object.keys(log.payload).length > 0 && (
                          <p className="text-[11px] text-muted-foreground/90 bg-muted/20 p-1.5 rounded border border-border/30 max-w-lg truncate">
                            Payload: {JSON.stringify(log.payload)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
