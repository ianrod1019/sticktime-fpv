import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lock, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ErrorPanel } from "@/components/state-panels";
import {
  useOrgPolicies,
  useSetOrgPolicies,
} from "@/hooks/enterprise/use-enterprise";
import {
  POLICY_KEYS,
  POLICY_META,
  type PolicyKey,
  type ResolvedPolicy,
} from "@/types/enterprise";

/**
 * EnterprisePolicyManager — account lockdowns & policy controls.
 *
 * Squadron/district admins configure compliance rules per org; pilots
 * see a read-only enforcement board. The server stays authoritative:
 * every change round-trips set_org_policies and the lockdown triggers
 * enforce what these toggles describe.
 */

const FIRMWARE_RE = /^\d+(\.\d+){0,3}$/;

function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-primary">
      <CheckCircle2 className="h-3 w-3" />
      Enforced
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
      Off
    </span>
  );
}

function ScopeTag({ scope }: { scope: ResolvedPolicy["scope"] }) {
  if (scope === "enterprise") {
    return (
      <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        District default
      </span>
    );
  }
  return (
    <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sky-400">
      This squadron
    </span>
  );
}

function PolicyRow({
  policyKey,
  resolved,
  canManage,
  firmwareError,
  onToggle,
  onFirmwareChange,
}: {
  policyKey: PolicyKey;
  resolved: ResolvedPolicy | undefined;
  canManage: boolean;
  firmwareError: string | null;
  onToggle: (enabled: boolean) => void;
  onFirmwareChange: (value: string) => void;
}) {
  const meta = POLICY_META[policyKey];
  const enabled = resolved?.enabled ?? false;
  const firmware =
    resolved?.min_firmware_version &&
    FIRMWARE_RE.test(resolved.min_firmware_version)
      ? resolved.min_firmware_version
      : "";
  const isFirmware = policyKey === "enforce_firmware_version";

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-sm font-semibold text-zinc-100">
              {meta.label}
            </h3>
            <StatusBadge enabled={enabled} />
            {resolved && <ScopeTag scope={resolved.scope} />}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            {meta.description}
          </p>
        </div>
        {canManage ? (
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            aria-label={meta.label}
          />
        ) : (
          <Lock className="mt-1 h-4 w-4 shrink-0 text-zinc-700" />
        )}
      </div>

      {isFirmware && enabled && (
        <div className="mt-3">
          <label
            htmlFor={`firmware-${policyKey}`}
            className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500"
          >
            Minimum firmware
          </label>
          <Input
            id={`firmware-${policyKey}`}
            value={firmware}
            onChange={(e) => onFirmwareChange(e.target.value)}
            placeholder="e.g. 4.5.1"
            disabled={!canManage}
            inputMode="decimal"
            className="max-w-40 font-mono text-sm"
            aria-invalid={!!firmwareError}
          />
          {firmwareError && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
              <TriangleAlert className="h-3 w-3" />
              {firmwareError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function EnterprisePolicyManager({
  orgId,
  canManage,
}: {
  orgId: string;
  /** Resolved enterprise role: district_admin / squadron_admin / pilot. */
  canManage: boolean;
}) {
  const { data: policies, isLoading, error } = useOrgPolicies(orgId);
  const setPolicies = useSetOrgPolicies(orgId);

  // Local edits (optimistic UI) keyed by policy key.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [firmwareDraft, setFirmwareDraft] = useState<string>("");
  const [firmwareError, setFirmwareError] = useState<string | null>(null);

  useEffect(() => {
    if (policies) {
      setLocal({});
      const fw = policies.find(
        (p) => p.policy_key === "enforce_firmware_version",
      );
      setFirmwareDraft(
        fw?.min_firmware_version && FIRMWARE_RE.test(fw.min_firmware_version)
          ? fw.min_firmware_version
          : "",
      );
      setFirmwareError(null);
    }
  }, [policies]);

  const firmwareInvalid = useMemo(
    () => firmwareDraft !== "" && !FIRMWARE_RE.test(firmwareDraft),
    [firmwareDraft],
  );

  const buildPatches = (enabledByKey: Record<string, boolean>) =>
    POLICY_KEYS.map((key) => {
      const current = policies?.find((p) => p.policy_key === key);
      return {
        key,
        enabled: enabledByKey[key] ?? current?.enabled ?? false,
        min_firmware_version:
          key === "enforce_firmware_version" ? firmwareDraft || null : null,
      };
    });

  const commit = (enabledByKey: Record<string, boolean>) => {
    if (firmwareInvalid) {
      setFirmwareError("Use dotted numeric firmware, e.g. 4.5.1");
      toast.error("Fix the firmware version before saving.");
      return;
    }
    if (!firmwareDraft && (enabledByKey["enforce_firmware_version"] ?? false)) {
      setFirmwareError("A minimum firmware is required to enforce it.");
      toast.error("Set a minimum firmware version first.");
      return;
    }
    setFirmwareError(null);
    setPolicies.mutate(buildPatches(enabledByKey), {
      onSuccess: () => toast.success("Policies updated."),
      onError: (err) => toast.error(err.message || "Could not save policies."),
    });
  };

  const toggle = (key: PolicyKey, enabled: boolean) => {
    commit({ ...local, [key]: enabled });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }
  if (error) {
    return <ErrorPanel message="Could not load policies." />;
  }

  const enforcedCount = POLICY_KEYS.filter((key) => {
    const override = local[key];
    return (
      override ?? policies?.find((p) => p.policy_key === key)?.enabled ?? false
    );
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
        <ShieldAlert
          className={`h-4 w-4 ${enforcedCount > 0 ? "text-primary" : "text-zinc-600"}`}
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">
          {enforcedCount} of {POLICY_KEYS.length} enforced across member
          accounts
        </span>
      </div>

      {POLICY_KEYS.map((key) => (
        <PolicyRow
          key={key}
          policyKey={key}
          resolved={policies?.find((p) => p.policy_key === key)}
          canManage={canManage}
          firmwareError={
            key === "enforce_firmware_version" ? firmwareError : null
          }
          onToggle={(enabled) => toggle(key, enabled)}
          onFirmwareChange={(value) => {
            setFirmwareDraft(value);
            setFirmwareError(null);
          }}
        />
      ))}

      {canManage && (
        <p className="font-mono text-[10px] leading-relaxed text-zinc-600">
          Changes take effect immediately — the database enforces them on the
          next write from every member account.
        </p>
      )}
    </div>
  );
}
