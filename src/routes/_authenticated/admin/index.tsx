import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Users, Shield, Megaphone, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { AdminStatsCards } from "@/components/admin/AdminStatsCards";
import { AdminPilotsTable } from "@/components/admin/AdminPilotsTable";
import { SecurityLogsView } from "@/components/admin/SecurityLogsView";
import { BroadcastNotificationsView } from "@/components/admin/BroadcastNotificationsView";
import { AdminAuditLogsView } from "@/components/admin/AdminAuditLogsView";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminPanelComponent,
});

function AdminPanelComponent() {
  const [activeTab, setActiveTab] = useState<string>("pilots");

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      <PageHeader
        title="Admin Control Center"
        subtitle="Global pilot accounts, immutable admin audit logs, security telemetry, and broadcasts."
        action={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-mono">
              <Shield className="h-3.5 w-3.5" /> SECURE ADMIN ACCESS
            </Badge>
          </div>
        }
      />

      <AdminStatsCards />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-3xl grid-cols-4">
          <TabsTrigger value="pilots" className="gap-2 font-mono text-xs">
            <Users className="h-4 w-4" /> Pilot Directory
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 font-mono text-xs">
            <Shield className="h-4 w-4" /> Security Logs
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 font-mono text-xs">
            <ShieldCheck className="h-4 w-4" /> Admin Audit
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2 font-mono text-xs">
            <Megaphone className="h-4 w-4" /> Broadcasts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pilots" className="space-y-6">
          <AdminPilotsTable />
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <SecurityLogsView />
        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
          <AdminAuditLogsView />
        </TabsContent>

        <TabsContent value="broadcast" className="space-y-6">
          <BroadcastNotificationsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
