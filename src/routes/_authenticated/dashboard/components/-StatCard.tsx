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
    <div className="hud-panel p-5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
          <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight bg-gradient-to-b from-white to-white/75 bg-clip-text text-transparent">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
