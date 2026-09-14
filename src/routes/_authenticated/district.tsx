import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Lock } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorPanel,
  LoadingPanel,
} from "@/components/state-panels";
import { DistrictOverview } from "@/components/enterprise/DistrictOverview";
import { EnterprisePolicyManager } from "@/components/enterprise/EnterprisePolicyManager";
import { useMyEnterprises } from "@/hooks/enterprise/use-enterprise";

export const Route = createFileRoute("/_authenticated/district")({
  ssr: false,
  head: () => ({ meta: [{ title: "District HQ — StickTime FPV" }] }),
  component: DistrictPage,
});

/**
 * /district — the enterprise district surface. Enterprise-tier gated in
 * spirit via role discovery: only district/squadron admins of an
 * enterprise org see management tools; everyone else gets a clear
 * upgrade wall (the tier itself is enforced server-side by RLS + RPC
 * guards, which return zero rows / raise for non-enterprise callers).
 */
function DistrictPage() {
  const { data: memberships, isLoading, error, refetch } = useMyEnterprises();

  // Orgs the caller can administer; first is the default tab.
  const managedOrgs = useMemo(
    () =>
      (memberships ?? []).filter(
        (m) => m.my_role === "district_admin" || m.my_role === "squadron_admin",
      ),
    [memberships],
  );
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const activeOrg =
    managedOrgs.find((o) => o.organization_id === activeOrgId) ??
    managedOrgs[0];
  const isDistrictAdmin = managedOrgs.some(
    (o) => o.my_role === "district_admin",
  );

  if (isLoading) {
    return <LoadingPanel label="Resolving districts…" />;
  }
  if (error) {
    return (
      <div>
        <PageHeader
          title="District HQ"
          subtitle="Multi-squadron command and account lockdown controls."
        />
        <ErrorPanel
          message="Could not resolve your enterprise access — the enterprise backend may not be migrated yet."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const showOverview = isDistrictAdmin;

  return (
    <div>
      <PageHeader
        title="District HQ"
        subtitle="Multi-squadron command: aggregate fleet telemetry across sub-squadrons and account lockdown controls per org."
      />

      {(memberships ?? []).length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No enterprise organizations"
          description="This surface is for Standard Squadron and Multi-Squadron District plans. Ask your district admin to add your squadron to a district."
        />
      ) : !showOverview && managedOrgs.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="District tools are admin-only"
          description="Pilots see enforcement status inside their squadron pages."
        />
      ) : (
        <div className="space-y-8">
          {showOverview && <DistrictOverview />}

          {managedOrgs.length > 0 && (
            <section>
              <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                ACCOUNT LOCKDOWNS &amp; POLICY CONTROLS
              </h2>
              {managedOrgs.length === 1 ? (
                <EnterprisePolicyManager
                  orgId={managedOrgs[0]!.organization_id}
                  canManage
                />
              ) : (
                <Tabs
                  value={activeOrg?.organization_id ?? ""}
                  onValueChange={setActiveOrgId}
                >
                  <TabsList>
                    {managedOrgs.map((o) => (
                      <TabsTrigger
                        key={o.organization_id}
                        value={o.organization_id}
                      >
                        {o.organization_name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {managedOrgs.map((o) => (
                    <TabsContent
                      key={o.organization_id}
                      value={o.organization_id}
                    >
                      <EnterprisePolicyManager
                        orgId={o.organization_id}
                        canManage
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
