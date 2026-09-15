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
      <div
        className="flex h-6 items-center gap-2 overflow-hidden rounded-full bg-muted/50"
        role="img"
        aria-label="No airtime recorded yet"
      >
        <div className="h-full w-full rounded-full bg-muted/60" />
      </div>
    );
  }

  const simPct = Math.round((sim / total) * 100);
  const realPct = Math.round((real / total) * 100);

  return (
    <div
      className="flex h-6 items-center gap-2 overflow-hidden rounded-full bg-muted/50"
      role="img"
      aria-label={`Airtime ratio: ${simPct}% simulator, ${realPct}% real-world`}
    >
      <div
        className="rounded-t-md border border-sim/20 bg-sim"
        style={{ width: `${simPct}%` }}
        aria-hidden
      />
      <div
        className="rounded-b-md border border-primary/30 bg-primary"
        style={{ width: `${realPct}%` }}
        aria-hidden
      />
    </div>
  );
}
