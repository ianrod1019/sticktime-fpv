import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link as LinkIcon } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorPanel,
  LoadingPanel,
} from "@/components/state-panels";
import { DeliveryPortalDashboard } from "@/components/portals/DeliveryPortalDashboard";
import { useMyEnterprises } from "@/hooks/enterprise/use-enterprise";

export const Route = createFileRoute("/_authenticated/portals")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Client Delivery Portals — StickTime FPV" }],
  }),
  component: PortalsPage,
});

/**
 * /portals — branded, expiring client delivery links, per org. Any
 * org member can create and manage the org's portals (see
 * portals.deliveries RLS in 20260928030000_portals_schema.sql).
 */
function PortalsPage() {
  const { data: memberships, isLoading, error, refetch } = useMyEnterprises();
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingPanel label="Resolving your organizations…" />;
  }
  if (error) {
    return (
      <div>
        <PageHeader
          title="Client Delivery Portals"
          subtitle="Branded, expiring links for handing off finished work."
        />
        <ErrorPanel
          message="Could not resolve your organizations — the enterprise backend may not be migrated yet."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const orgs = memberships ?? [];
  const activeOrg =
    orgs.find((o) => o.organization_id === activeOrgId) ?? orgs[0];

  return (
    <div>
      <PageHeader
        title="Client Delivery Portals"
        subtitle="Branded, expiring links for handing off finished work — per organization."
      />

      {orgs.length === 0 ? (
        <EmptyState
          icon={LinkIcon}
          title="No organization yet"
          description="Delivery portals live inside an enterprise org. Ask your district admin to add your squadron to a district."
        />
      ) : orgs.length === 1 ? (
        <DeliveryPortalDashboard orgId={orgs[0]!.organization_id} />
      ) : (
        <Tabs
          value={activeOrg?.organization_id ?? ""}
          onValueChange={setActiveOrgId}
        >
          <TabsList>
            {orgs.map((o) => (
              <TabsTrigger key={o.organization_id} value={o.organization_id}>
                {o.organization_name}
              </TabsTrigger>
            ))}
          </TabsList>
          {orgs.map((o) => (
            <TabsContent key={o.organization_id} value={o.organization_id}>
              <DeliveryPortalDashboard orgId={o.organization_id} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
