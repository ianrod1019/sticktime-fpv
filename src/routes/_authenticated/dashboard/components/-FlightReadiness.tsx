import { Activity, BatteryCharging, Radio, ShieldCheck } from "lucide-react";
import { formatHours } from "@/lib/fpv";

/** Compact operational summary for the authenticated command center. */
export function FlightReadiness({
  activeDrones,
  totalMinutes,
  packs,
}: {
  activeDrones: number;
  totalMinutes: number;
  packs: number;
}) {
  const readiness = activeDrones > 0 ? "READY TO FLY" : "AWAITING RIG";

  return (
    <aside className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#101014]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_50px_-34px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5">
        <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-zinc-400">
          <Radio className="h-3.5 w-3.5 text-primary" /> FLIGHT STATUS
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.13em] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE
        </span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/[0.07]">
        <ReadinessDatum
          icon={Activity}
          label="AIRTIME"
          value={formatHours(totalMinutes)}
        />
        <ReadinessDatum
          icon={BatteryCharging}
          label="PACKS"
          value={String(packs).padStart(2, "0")}
        />
        <ReadinessDatum
          icon={ShieldCheck}
          label="RIGS"
          value={String(activeDrones).padStart(2, "0")}
        />
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.08] bg-primary/[0.035] px-5 py-3">
        <span className="font-mono text-[9px] tracking-[0.14em] text-zinc-500">
          OPERATIONS READINESS
        </span>
        <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-primary">
          {readiness}
        </span>
      </div>
    </aside>
  );
}

function ReadinessDatum({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="px-4 py-4 first:pl-5">
      <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.13em] text-zinc-600">
        <Icon className="h-3 w-3 text-zinc-500" />
        {label}
      </div>
      <div className="mt-2 font-display text-xl font-semibold tracking-[-0.04em] text-zinc-100">
        {value}
      </div>
    </div>
  );
}
