import { Flame } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/[0.09] bg-[#121215] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_45px_-34px_rgba(0,0,0,0.95)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-[#16161a]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
          <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
