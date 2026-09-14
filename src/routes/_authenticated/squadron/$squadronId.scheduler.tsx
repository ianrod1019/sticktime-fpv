import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Lock, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorPanel,
  LoadingPanel,
} from "@/components/state-panels";
import { SquadronScheduler } from "@/components/enterprise/SquadronScheduler";
import { EnterprisePolicyManager } from "@/components/enterprise/EnterprisePolicyManager";
import {
  useMyEnterprises,
  useOrgPolicies,
} from "@/hooks/enterprise/use-enterprise";
import { canManageOrg, type EnterpriseRole } from "@/types/enterprise";

export const Route = createFileRoute(
  "/_authenticated/squadron/$squadronId/scheduler",
)({
  ssr: false,
  head: () => ({ meta: [{ title: "Meetups — StickTime FPV" }] }),
  component: SquadronSchedulerPage,
});

/**
 * /squadron/$squadronId/scheduler — the team meetup surface inside the
 * existing squadron layout. The org (and the caller's enterprise role
 * in it) is resolved from the enterprise discovery RPC; a plain
 * squadron with no enterprise link shows a quiet explainer instead.
 */
function SquadronSchedulerPage() {
  const { squadronId } = Route.useParams();
  const { data: memberships, isLoading, error, refetch } = useMyEnterprises();

  const membership = (memberships ?? []).find((m) => m.team_id === squadronId);

  if (isLoading) {
    return <LoadingPanel label="Resolving squadron…" />;
  }
  if (error) {
    return (
      <div>
        <PageHeader
          title="Meetups"
          subtitle="Team practice sessions, race days, and build workshops."
        />
        <ErrorPanel
          message="Could not resolve your squadron — the enterprise backend may not be migrated yet."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!membership) {
    return (
      <div>
        <PageHeader
          title="Meetups"
          subtitle="Team practice sessions, race days, and build workshops."
        />
        <EmptyState
          icon={CalendarDays}
          title="Not an enterprise squadron"
          description="Meetup scheduling is part of the Standard Squadron and District enterprise plans. This squadron is not linked to an enterprise organization yet."
        />
      </div>
    );
  }

  const role: EnterpriseRole = membership.my_role;
  const canManage = canManageOrg(role);

  return (
    <div>
      <PageHeader
        title="Meetups & policy"
        subtitle={`${membership.organization_name} · ${membership.plan_name}`}
      />

      <Tabs defaultValue="meetups">
        <TabsList>
          <TabsTrigger value="meetups">Meetups</TabsTrigger>
          <TabsTrigger value="policy">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Policy status
          </TabsTrigger>
        </TabsList>

        <TabsContent value="meetups" className="mt-4">
          <SquadronScheduler orgId={membership.organization_id} role={role} />
        </TabsContent>

        <TabsContent value="policy" className="mt-4">
          <PolicyStatusTab
            orgId={membership.organization_id}
            canManage={canManage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Read-only for pilots (enforcement indicators), fully editable for
 * admins — the policy surface in the squadron context.
 */
function PolicyStatusTab({
  orgId,
  canManage,
}: {
  orgId: string;
  canManage: boolean;
}) {
  const { data: policies, isLoading, error } = useOrgPolicies(orgId);
  const [tabKey] = useState("policy");

  if (isLoading) return <LoadingPanel label="Loading policies…" />;
  if (error) return <ErrorPanel message="Could not load policies." />;

  const enforced = (policies ?? []).filter((p) => p.enabled);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
        <Lock
          className={`h-4 w-4 ${enforced.length > 0 ? "text-primary" : "text-zinc-600"}`}
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">
          {enforced.length === 0
            ? "No enforcements active — fly free"
            : `${enforced.length} enforced: ${enforced
                .map((p) => p.policy_key.replace(/_/g, " "))
                .join(" · ")}`}
        </span>
      </div>
      <EnterprisePolicyManager orgId={orgId} canManage={canManage} />
      {/* tabKey keeps the section stable across policy refetches */}
      <span hidden>{tabKey}</span>
    </div>
  );
}
