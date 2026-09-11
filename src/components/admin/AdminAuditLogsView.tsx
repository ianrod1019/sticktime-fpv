import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck,
  Search,
  RefreshCw,
  UserCheck,
  ExternalLink,
  Shield,
  Mail,
  User,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export interface AdminUserSummary {
  id: string;
  email?: string;
  display_name?: string;
  role: string;
  tier: string;
  audit_count?: number;
}

export function AdminAuditLogsView() {
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();

  // Fetch admin profiles and join auth emails strictly using profiles (role, uuid/id, tier) and auth.users
  const {
    data: adminUsers,
    isLoading,
    refetch,
    error: queryError,
  } = useQuery({
    queryKey: ["admin-users-audit-list-correct-schema-v7"],
    queryFn: async () => {
      let profilesList: any[] = [];
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "admin_get_admin_directory",
        );
        if (!rpcError && rpcData) {
          profilesList = rpcData;
        } else {
          console.warn(
            "RPC admin_get_admin_directory failed, fallback to direct query:",
            rpcError,
          );
        }
      } catch (e) {
        console.warn("RPC execution error:", e);
      }

      const emailMap: Record<string, string> = {};
      try {
        const { data: emailsData } = await supabase.rpc(
          "admin_get_user_emails",
        );
        if (emailsData) {
          (emailsData as any[]).forEach((item) => {
            if (item.id && item.email) emailMap[item.id] = item.email;
          });
        }
      } catch (err) {
        console.warn("Could not fetch user emails via RPC:", err);
      }

      if (profilesList.length === 0) {
        // Fallback query to profiles (id, role, tier/subscription_tier)
        const { data: fallbackProfiles, error: fallbackErr } = await db_request(
          {
            mode: "query",
            table: "profiles",
            operation: "select",
            selectColumns: "*",
            requireAdmin: true,
          },
        );

        if (fallbackErr) throw fallbackErr;

        profilesList = (fallbackProfiles || []).map((p) => {
          const userId = p.id || p.uuid;
          const userEmail =
            emailMap[userId] ||
            `admin_${(userId || "").substring(0, 6)}@fpv.internal`;
          const callsign = p.callsign || userEmail.split("@")[0];
          return {
            id: userId,
            email: userEmail,
            display_name: callsign,
            subscription_tier: p.tier || p.subscription_tier || "pro",
            role: (p.role || "admin").toLowerCase(),
          };
        });
      }

      // Filter specifically for administrators or developers (role in 'admin', 'dev')
      const filteredAdmins = profilesList.filter((p) => {
        const r = (p.role || "").toLowerCase();
        return r === "admin" || r === "dev";
      });

      // If no users explicitly marked as admin/dev in profiles, default to showing users with audit logs or top profiles
      const targetAdmins =
        filteredAdmins.length > 0 ? filteredAdmins : profilesList;

      // Get audit counts for each actor
      const { data: auditLogs, error: auditError } = await db_request({
        mode: "query",
        table: "admin_audit_logs",
        operation: "select",
        selectColumns: "actor_id",
        limit: 2000,
        requireAdmin: true,
      });

      if (auditError)
        console.warn("Could not fetch audit logs count:", auditError);

      const countMap: Record<string, number> = {};
      if (auditLogs) {
        auditLogs.forEach((log) => {
          if (log.actor_id) {
            countMap[log.actor_id] = (countMap[log.actor_id] || 0) + 1;
          }
        });
      }

      return targetAdmins.map((p) => {
        const userId = p.id || p.uuid;
        const userEmail =
          emailMap[userId] ||
          p.email ||
          `admin_${(userId || "").substring(0, 6)}@fpv.internal`;
        const displayName =
          p.display_name || p.callsign || userEmail.split("@")[0] || `Admin`;

        return {
          id: userId,
          role: p.role || "admin",
          tier: p.subscription_tier || p.tier || "pro",
          display_name: displayName,
          email: userEmail,
          audit_count: countMap[userId] || 0,
        };
      }) as AdminUserSummary[];
    },
  });

  const filteredUsers = (adminUsers || []).filter((u) => {
    const q = filter.toLowerCase();
    return (
      (u.display_name && u.display_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      u.id.toLowerCase().includes(q) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  });

  const handleSelectAdminUser = (userId: string) => {
    const rollingToken =
      Math.floor(Date.now() / (1000 * 60 * 5)).toString(36) +
      Math.random().toString(36).substring(2, 8);
    navigate({
      to: "/admin_lookup/$uuid",
      params: { uuid: userId },
      search: { token: rollingToken },
    });
  };

  return (
    <Card className="border-border bg-card/60">
      <CardHeader>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <CardTitle className="font-mono flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" /> Administrator
              Audit Activity
            </CardTitle>
            <CardDescription>
              Select any administrator account below (filtered strictly by
              admin/dev roles with joined auth emails) to review their audit
              trail.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-1.5 font-mono"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            />{" "}
            Refresh Admins
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search admins by display name, email, or UUID..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {queryError && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-mono text-xs">
            Error loading administrator directory:{" "}
            {(queryError as Error).message}
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground font-mono">
            Loading administrator directory...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground font-mono space-y-3">
            <p>No administrator accounts found matching your query.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry Loading Directory
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((admin) => (
              <div
                key={admin.id}
                onClick={() => handleSelectAdminUser(admin.id)}
                className="group relative flex flex-col justify-between p-4 rounded-xl border border-border/70 bg-card hover:border-primary/50 hover:bg-card/90 cursor-pointer transition-all shadow-sm hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className="border-success/40 text-success bg-success/5 font-mono text-[10px] uppercase"
                    >
                      <Shield className="h-3 w-3 mr-1" /> {admin.role}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">
                      {admin.audit_count} Actions
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                      <User className="h-4 w-4 text-primary shrink-0" />{" "}
                      {admin.display_name}
                    </h3>
                    <p
                      className="text-xs font-mono text-muted-foreground flex items-center gap-1.5 truncate"
                      title={admin.email}
                    >
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{" "}
                      {admin.email}
                    </p>
                    <p
                      className="text-[11px] font-mono text-muted-foreground/80 truncate pt-1"
                      title={admin.id}
                    >
                      UUID: {admin.id}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-mono text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5 text-primary" /> Tier:{" "}
                    {admin.tier}
                  </span>
                  <span className="flex items-center gap-1 text-primary font-medium group-hover:translate-x-0.5 transition-transform">
                    View Logs <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
