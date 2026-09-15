import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircuitBoard } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/state-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AirframeDigitalTwin,
  DirectiveBoard,
  DriftQueue,
  FleetComplianceOverview,
  WorkOrderBoard,
} from "@/components/firmware/firmware-panel";
import { useMyEnterprises } from "@/hooks/enterprise/use-enterprise";

export const Route = createFileRoute("/_authenticated/firmware")({
  ssr: false,
  head: () => ({
    meta: [
      {
        title:
          "Firmware & Configuration Control — StickTime FPV",
      },
    ],
  }),
  component: FirmwarePage,
});

/** /firmware — airworthiness configuration control, per org. Pilots get
 * read-only compliance visibility; squadron/district admins (the
 * safety-officer tier) get drift resolution, directives and sign-offs. */
function FirmwarePage() {
  const { data: memberships, isLoading, error } = useMyEnterprises();
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Firmware & Configuration Control"
          subtitle="Resolving your organizations…"
        />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader
          title="Firmware & Configuration Control"
          subtitle="Could not resolve your organizations."
        />
        <EmptyState
          icon={CircuitBoard}
          title="Backend unavailable"
          description="The firmware module backend may not be migrated yet. Try again later."
        />
      </div>
    );
  }

  const orgs = memberships ?? [];
  const activeOrg = orgs.find((o) => o.organization_id === activeOrgId) ?? orgs[0];

  if (orgs.length === 0) {
    return (
      <div>
        <PageHeader
          title="Firmware & Configuration Control"
          subtitle="Configuration integrity and airworthiness — per organization."
        />
        <EmptyState
          icon={CircuitBoard}
          title="No organization yet"
          description="Firmware control lives inside an enterprise org. Ask your district admin to add your squadron to a district."
        />
      </div>
    );
  }

  const myRole: string | undefined = activeOrg?.my_role;

  return (
    <div>
      <PageHeader
        title="Firmware & Configuration Control"
        subtitle="Golden baselines, drift detection, and airworthiness interlocks — per organization."
      />

      {orgs.length > 1 && (
        <Tabs
          value={activeOrg?.organization_id ?? ""}
          onValueChange={setActiveOrgId}
          className="mb-4"
        >
          <TabsList>
            {orgs.map((o) => (
              <TabsTrigger key={o.organization_id} value={o.organization_id}>
                {o.organization_name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {activeOrg && (
        <Tabs defaultValue="fleet" className="space-y-4">
          <TabsList>
            <TabsTrigger value="fleet">Fleet compliance</TabsTrigger>
            <TabsTrigger value="twin">Digital twin</TabsTrigger>
            <TabsTrigger value="drift">Drift queue</TabsTrigger>
            <TabsTrigger value="orders">Work orders</TabsTrigger>
            <TabsTrigger value="ads">Directives</TabsTrigger>
          </TabsList>
          <TabsContent value="fleet" className="space-y-6">
            <FleetComplianceOverview orgId={activeOrg.organization_id} myRole={myRole} />
          </TabsContent>
          <TabsContent value="twin" className="space-y-6">
            <AirframeDigitalTwin orgId={activeOrg.organization_id} myRole={myRole} />
          </TabsContent>
          <TabsContent value="drift" className="space-y-6">
            <DriftQueue orgId={activeOrg.organization_id} myRole={myRole} />
          </TabsContent>
          <TabsContent value="orders" className="space-y-6">
            <WorkOrderBoard orgId={activeOrg.organization_id} myRole={myRole} />
          </TabsContent>
          <TabsContent value="ads" className="space-y-6">
            <DirectiveBoard orgId={activeOrg.organization_id} myRole={myRole} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
