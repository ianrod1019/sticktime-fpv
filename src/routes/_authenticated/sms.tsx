import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorPanel,
  LoadingPanel,
} from "@/components/state-panels";
import { IncidentReportForm } from "@/components/sms/incident-report-form";
import { IncidentReviewQueue } from "@/components/sms/incident-review-queue";
import { useMyEnterprises } from "@/hooks/enterprise/use-enterprise";

export const Route = createFileRoute("/_authenticated/sms")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Safety Management System — StickTime FPV" }],
  }),
  component: SmsPage,
});

/** /sms — incident logging per org. Every pilot files and sees their own
 * reports; squadron/district admins (the safety-officer tier — see the
 * sms.incidents migration) also review and close every report in the org. */
function SmsPage() {
  const { data: memberships, isLoading, error, refetch } = useMyEnterprises();
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingPanel label="Resolving your organizations…" />;
  }
  if (error) {
    return (
      <div>
        <PageHeader
          title="Safety Management System"
          subtitle="Incident reporting and review."
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

  const renderOrg = (org: (typeof orgs)[number]) => {
    const canManage = org.my_role !== "pilot";
    return (
      <div className="space-y-6">
        <IncidentReportForm orgId={org.organization_id} teamId={org.team_id} />
        {canManage && <IncidentReviewQueue orgId={org.organization_id} />}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Safety Management System"
        subtitle="Log and review flight safety incidents — per organization."
      />

      {orgs.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No organization yet"
          description="Incident logging lives inside an enterprise org. Ask your district admin to add your squadron to a district."
        />
      ) : orgs.length === 1 ? (
        renderOrg(orgs[0]!)
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
              {renderOrg(o)}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
