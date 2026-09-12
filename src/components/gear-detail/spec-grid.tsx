import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Pretty-print a spec key: "max_power" → "Max Power". */
export function specLabel(key: string): string {
  const special: Record<string, string> = {
    kv: "KV",
    elrs: "ExpressLRS",
    vtx: "VTX",
    aio: "AIO",
    fps: "FPS",
    ir: "IR",
    osd: "OSD",
    dvr: "DVR",
    pwm: "PWM",
    rf: "RF",
    id: "ID",
  };
  const title = key
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return special[title.toLowerCase()] ?? title;
}

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
      <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono font-medium mt-0.5 text-sm text-foreground">
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
      )}
    </div>
  );
}

export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-primary/10 last:border-0">
      <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-sm text-foreground">{value}</span>
    </div>
  );
}

/** Read-only key/value list used for rows we can't edit yet. */
export function KeyValueCard({
  title,
  icon,
  rows,
  emptyHint,
}: {
  title: string;
  icon: ReactNode;
  rows: Array<{ label: string; value: ReactNode }>;
  emptyHint?: string;
}) {
  return (
    <Card className="bg-card/50 border-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {emptyHint ?? "No details recorded yet."}
          </p>
        ) : (
          rows.map((row) => <StatRow key={row.label} {...row} />)
        )}
      </CardContent>
    </Card>
  );
}
