import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { VaultPanel } from "@/components/certs/vault-panel";
import { useMyEnterprises } from "@/hooks/enterprise/use-enterprise";

export const Route = createFileRoute("/_authenticated/vault")({
  ssr: false,
  head: () => ({ meta: [{ title: "Cert & Waiver Vault — StickTime FPV" }] }),
  component: VaultPage,
});

/**
 * /vault — Part 107 certs, trust docs, and waivers per org. Every pilot
 * sees and manages their own documents; squadron/district admins also
 * see and verify every document in the org. Expiration only ever shows
 * a badge here — it never blocks scheduling (see the certs migration).
 */
function VaultPage() {
  const { data: memberships, isLoading, error, refetch } = useMyEnterprises();
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingPanel label="Resolving your organizations…" />;
  }
  if (error) {
    return (
      <div>
        <PageHeader
          title="Cert & Waiver Vault"
          subtitle="Part 107 certificates, trust documents, and waivers."
        />
        <ErrorPanel
          message="Could not resolve your organizations — the enterprise backend may not be migrated yet."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const orgs = memberships ?? [];
  const activeOrg = orgs.find((o) => o.organization_id === activeOrgId) ?? orgs[0];

  return (
    <div>
      <PageHeader
        title="Cert & Waiver Vault"
        subtitle="Part 107 certificates, trust documents, and waivers — per organization."
      />

      {orgs.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No organization yet"
          description="The vault lives inside an enterprise org. Ask your district admin to add your squadron to a district."
        />
      ) : orgs.length === 1 ? (
        <VaultPanel
          orgId={orgs[0]!.organization_id}
          canManage={orgs[0]!.my_role !== "pilot"}
        />
      ) : (
        <Tabs value={activeOrg?.organization_id ?? ""} onValueChange={setActiveOrgId}>
          <TabsList>
            {orgs.map((o) => (
              <TabsTrigger key={o.organization_id} value={o.organization_id}>
                {o.organization_name}
              </TabsTrigger>
            ))}
          </TabsList>
          {orgs.map((o) => (
            <TabsContent key={o.organization_id} value={o.organization_id}>
              <VaultPanel orgId={o.organization_id} canManage={o.my_role !== "pilot"} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
