import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Users, Shield, Megaphone, ShieldCheck, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { AdminAnalyticsDashboard } from "@/components/admin/AdminAnalyticsDashboard";
import { AdminPilotsTable } from "@/components/admin/AdminPilotsTable";
import { SecurityLogsView } from "@/components/admin/SecurityLogsView";
import { BroadcastNotificationsView } from "@/components/admin/BroadcastNotificationsView";
import { AdminAuditLogsView } from "@/components/admin/AdminAuditLogsView";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminPanelComponent,
});

function AdminPanelComponent() {
  const [activeTab, setActiveTab] = useState<string>("analytics");

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      <PageHeader
        title="Admin Control Center"
        subtitle="Global pilot accounts, immutable admin audit logs, security telemetry, and broadcasts."
        action={
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 border-success/40 bg-success/10 text-success font-mono"
            >
              <Shield className="h-3.5 w-3.5" /> SECURE ADMIN ACCESS
            </Badge>
          </div>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-4xl grid-cols-5">
          <TabsTrigger value="analytics" className="gap-2 font-mono text-xs">
            <BarChart3 className="h-4 w-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="pilots" className="gap-2 font-mono text-xs">
            <Users className="h-4 w-4" /> Pilots
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 font-mono text-xs">
            <Shield className="h-4 w-4" /> Security
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 font-mono text-xs">
            <ShieldCheck className="h-4 w-4" /> Audit
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2 font-mono text-xs">
            <Megaphone className="h-4 w-4" /> Broadcasts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6">
          <AdminAnalyticsDashboard />
        </TabsContent>

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
