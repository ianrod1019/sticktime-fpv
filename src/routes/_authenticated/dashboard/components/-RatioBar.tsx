interface RatioBarProps {
  simMinutes: number;
  realMinutes: number;
}

export function RatioBar({
  simMinutes: sim,
  realMinutes: real,
}: RatioBarProps) {
  const total = sim + real;
  if (total === 0) {
    return (
      <div className="flex h-6 items-center gap-2 rounded-full bg-muted/50 overflow-hidden">
        <div className="h-full w-full rounded-full bg-muted/60" />
      </div>
    );
  }

  const simPct = Math.round((sim / total) * 100);
  const realPct = Math.round((real / total) * 100);

  return (
    <div className="flex h-6 items-center gap-2 rounded-full bg-muted/50 overflow-hidden">
      <div
        className="rounded-t-md bg-sim border border-sim/20"
        style={{ width: `${simPct}%` }}
        aria-label="Sim airtime"
      />
      <div
        className="rounded-b-md bg-primary border border-primary/30"
        style={{ width: `${realPct}%` }}
        aria-label="Real airtime"
      />
    </div>
  );
}
