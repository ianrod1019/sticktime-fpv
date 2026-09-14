import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  Building2,
  GraduationCap,
  Plane,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel } from "@/components/state-panels";
import {
  useEnterpriseMetrics,
  useMyEnterprises,
} from "@/hooks/enterprise/use-enterprise";
import type { EnterprisePerOrgStats } from "@/types/enterprise";

/**
 * DistrictOverview — the multi-squadron district command surface.
 *
 * District-admin gated (render nothing otherwise): aggregate metrics
 * across ALL sub-squadrons, then a card grid with drill-down into each
 * sub-team's hangar and roster (existing squadron surfaces).
 * Metrics come from get_enterprise_metrics — aggregate-only server-side,
 * so this component never renders another squad's roster.
 */

interface DistrictSummary {
  enterpriseId: string;
  enterpriseName: string;
  planName: string;
  isSchool: boolean;
}

function MetricTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-100">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>
    </div>
  );
}

function SquadronCard({
  org,
  canDrillDown,
}: {
  org: EnterprisePerOrgStats;
  canDrillDown: boolean;
}) {
  return (
    <Link
      to="/squadron/$squadronId"
      params={{ squadronId: org.team_id }}
      className="group block rounded-xl border border-border/60 bg-card/60 p-4 transition-all hover:border-primary/40 hover:bg-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {org.is_school ? (
            <GraduationCap className="h-4 w-4 text-primary" />
          ) : (
            <Building2 className="h-4 w-4 text-primary" />
          )}
          <h3 className="font-display text-sm font-semibold text-zinc-100">
            {org.name}
          </h3>
        </div>
        <ArrowUpRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-primary" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-600">
            Pilots
          </div>
          <div className="mt-0.5 text-base tabular-nums text-zinc-100">
            {org.active_pilots}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-600">
            Fleet
          </div>
          <div className="mt-0.5 text-base tabular-nums text-zinc-100">
            {org.fleet_size}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-600">
            Hrs 30d
          </div>
          <div className="mt-0.5 text-base tabular-nums text-zinc-100">
            {org.flight_hours_30d}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-2">
        <ShieldCheck
          className={`h-3.5 w-3.5 ${
            org.active_policies > 0 ? "text-primary" : "text-zinc-700"
          }`}
        />
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {org.active_policies} active{" "}
          {org.active_policies === 1 ? "enforcement" : "enforcements"}
        </span>
        {canDrillDown && (
          <span className="ml-auto font-mono text-[10px] text-zinc-600 group-hover:text-primary">
            Hangar &rarr;
          </span>
        )}
      </div>
    </Link>
  );
}

function MetricsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function DistrictOverview() {
  const {
    data: memberships,
    isLoading: membershipsLoading,
    error: membershipsError,
  } = useMyEnterprises();

  // Districts the caller actually administers (billing owner rows).
  const districts = useMemo(() => {
    const byEnterprise = new Map<string, DistrictSummary>();
    for (const m of memberships ?? []) {
      if (m.my_role !== "district_admin") continue;
      if (!byEnterprise.has(m.enterprise_id)) {
        byEnterprise.set(m.enterprise_id, {
          enterpriseId: m.enterprise_id,
          enterpriseName: m.enterprise_name,
          planName: m.plan_name,
          isSchool: m.is_school,
        });
      }
    }
    return [...byEnterprise.values()];
  }, [memberships]);

  const [activeDistrictId, setActiveDistrictId] = useState<string | null>(null);
  const effectiveDistrictId =
    activeDistrictId ?? districts[0]?.enterpriseId ?? null;

  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError,
  } = useEnterpriseMetrics(effectiveDistrictId);

  if (membershipsLoading) {
    return <MetricsSkeleton />;
  }
  if (membershipsError) {
    return (
      <ErrorPanel
        message="Could not load your districts."
        onRetry={() => window.location.reload()}
      />
    );
  }
  if (districts.length === 0) {
    return null; // Not a district admin — the route renders its own gate.
  }

  const totals = metrics?.totals;
  const orgs = metrics?.per_org ?? [];

  return (
    <div className="space-y-6">
      {/* District switcher (multi-district owners) */}
      {districts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {districts.map((d) => (
            <button
              key={d.enterpriseId}
              type="button"
              onClick={() => setActiveDistrictId(d.enterpriseId)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                d.enterpriseId === effectiveDistrictId
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-white/[0.08] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {d.enterpriseName}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-zinc-100">
            {districts.find((d) => d.enterpriseId === effectiveDistrictId)
              ?.enterpriseName ?? "District"}
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
            {districts.find((d) => d.enterpriseId === effectiveDistrictId)
              ?.planName ?? ""}{" "}
            · AGGREGATE TELEMETRY
          </p>
        </div>
      </div>

      {metricsError ? (
        <ErrorPanel
          message="Could not load district metrics."
          onRetry={() => window.location.reload()}
        />
      ) : metricsLoading || !metrics ? (
        <MetricsSkeleton />
      ) : (
        <>
          {/* Aggregate metrics across all sub-squadrons */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile
              label="Active pilots"
              value={String(totals?.active_pilots ?? 0)}
              hint={`${totals?.squadron_admins ?? 0} squadron admins`}
              icon={<Users className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="Combined fleet"
              value={String(totals?.fleet_size ?? 0)}
              hint={`${totals?.org_count ?? 0} sub-squadrons`}
              icon={<Plane className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="Flight hrs (30d)"
              value={String(totals?.flight_hours_30d ?? 0)}
              hint="Across the whole district"
              icon={<Activity className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="Enforcements"
              value={String(totals?.active_enforcements ?? 0)}
              hint="Policies actively enforced"
              icon={<Boxes className="h-3.5 w-3.5" />}
            />
          </div>

          {/* Sub-squadron drill-down grid */}
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              SUB-SQUADRONS · {orgs.length}
            </p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {orgs.map((org) => (
                <SquadronCard
                  key={org.organization_id}
                  org={org}
                  canDrillDown
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
