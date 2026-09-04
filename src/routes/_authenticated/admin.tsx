import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Users, Shield, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { AdminStatsCards } from "@/components/admin/AdminStatsCards";
import { AdminPilotsTable } from "@/components/admin/AdminPilotsTable";
import { SecurityLogsView } from "@/components/admin/SecurityLogsView";
import { BroadcastNotificationsView } from "@/components/admin/BroadcastNotificationsView";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw redirect({ to: "/auth" });
    }

    const { data: isAdmin, error } = await supabase.rpc("check_is_admin");

    if (error || !isAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();

      const role = (profile?.role || "user").toLowerCase();
      if (role !== "admin" && role !== "dev") {
        throw redirect({ to: "/" });
      }
    }

    return { user: userData.user };
  },
  component: AdminPanelComponent,
});

function AdminPanelComponent() {
  const [activeTab, setActiveTab] = useState<string>("pilots");

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      <PageHeader
        title="Admin Control Center"
        subtitle="Global pilot accounts, system roles, and real-time security telemetry."
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
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="pilots" className="gap-2">
            <Users className="h-4 w-4" /> Pilot Directory
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" /> Security Logs
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2">
            <Megaphone className="h-4 w-4" /> Broadcasts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pilots" className="space-y-6">
          <AdminPilotsTable />
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <SecurityLogsView />
        </TabsContent>

        <TabsContent value="broadcast" className="space-y-6">
          <BroadcastNotificationsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
