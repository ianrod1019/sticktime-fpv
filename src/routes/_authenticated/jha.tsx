import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorPanel,
  LoadingPanel,
} from "@/components/state-panels";
import { JhaWizard } from "@/components/jha/jha-wizard";
import { JhaHistory } from "@/components/jha/jha-history";
import { useMyEnterprises } from "@/hooks/enterprise/use-enterprise";
import { useJhaTemplates, useJhaSubmissions } from "@/hooks/jha/use-jha";

export const Route = createFileRoute("/_authenticated/jha")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Pre-Flight JHA — StickTime FPV" }],
  }),
  component: JhaPage,
});

/** /jha — Job Hazard Analysis pre-flight checklist.
 *  Every pilot completes a JHA before flight; admins/safety officers
 *  audit org-wide submissions. */
function JhaPage() {
  const {
    data: memberships,
    isLoading: orgsLoading,
    error: orgsError,
    refetch: refetchOrgs,
  } = useMyEnterprises();
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  if (orgsLoading) {
    return <LoadingPanel label="Resolving your organizations…" />;
  }
  if (orgsError) {
    return (
      <div>
        <PageHeader
          title="Pre-Flight JHA"
          subtitle="Job Hazard Analysis checklist."
        />
        <ErrorPanel
          message="Could not resolve your organizations."
          onRetry={() => refetchOrgs()}
        />
      </div>
    );
  }

  const orgs = memberships ?? [];
  const activeOrg =
    orgs.find((o) => o.organization_id === activeOrgId) ?? orgs[0];

  if (!activeOrg) {
    return (
      <div>
        <PageHeader
          title="Pre-Flight JHA"
          subtitle="Job Hazard Analysis checklist."
        />
        <EmptyState
          icon={ClipboardCheck}
          title="No organizations found"
          description="Join an organization to use the pre-flight checklist."
        />
      </div>
    );
  }

  return (
    <JhaOrgView
      orgId={activeOrg.organization_id}
      orgName={activeOrg.organization_name}
      orgs={orgs.map((o) => ({
        id: o.organization_id,
        name: o.organization_name,
      }))}
      activeOrgId={activeOrg.organization_id}
      onOrgChange={setActiveOrgId}
    />
  );
}

function JhaOrgView({
  orgId,
  orgName,
  orgs,
  activeOrgId,
  onOrgChange,
}: {
  orgId: string;
  orgName: string;
  orgs: { id: string; name: string }[];
  activeOrgId: string;
  onOrgChange: (id: string) => void;
}) {
  const {
    data: templates,
    isLoading: templatesLoading,
    error: templatesError,
  } = useJhaTemplates(orgId);
  const {
    data: submissions,
    isLoading: submissionsLoading,
    error: submissionsError,
  } = useJhaSubmissions(orgId);
  const [activeTab, setActiveTab] = useState<"checklist" | "history">(
    "checklist",
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );

  const template =
    templates?.find((t) => t.template_id === selectedTemplateId) ??
    templates?.[0] ??
    null;

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      <PageHeader
        title="Pre-Flight JHA"
        subtitle="Job Hazard Analysis checklist — complete before every flight."
        action={
          orgs.length > 1 ? (
            <select
              value={activeOrgId}
              onChange={(e) => onOrgChange(e.target.value)}
              className="rounded-md border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {/* Org-scoped info banner */}
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-600">
          Active organization
        </p>
        <p className="mt-1 text-sm text-zinc-300">{orgName}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="checklist" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" /> New checklist
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="mt-6">
          {templatesLoading && <LoadingPanel label="Loading templates…" />}
          {templatesError && (
            <ErrorPanel
              message="Could not load JHA templates."
              detail={templatesError.message}
            />
          )}
          {!templatesLoading && !templatesError && templates?.length === 0 && (
            <EmptyState
              icon={Plus}
              title="No JHA templates configured"
              description="An organization admin needs to create a JHA template before pilots can complete checklists."
            />
          )}
          {!templatesLoading && !templatesError && template && (
            <JhaWizard
              key={template.template_id}
              template={template}
              orgId={orgId}
              onComplete={() => setActiveTab("history")}
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          {submissionsLoading && <LoadingPanel label="Loading history…" />}
          {submissionsError && (
            <ErrorPanel
              message="Could not load submission history."
              detail={submissionsError.message}
            />
          )}
          {!submissionsLoading && !submissionsError && (
            <JhaHistory submissions={submissions ?? []} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
