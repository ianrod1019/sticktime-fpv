import { Cpu, PackageOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { specLabel } from "./spec-grid";
import type { GearPartRow } from "@/hooks/gear-item";

function wearLabel(part: GearPartRow): string | null {
  const lifespan = part.lifespan_minutes ?? 0;
  if (lifespan > 0 && (part.minutes_used ?? 0) > 0) {
    const pct = Math.min(
      100,
      Math.round(((part.minutes_used ?? 0) / lifespan) * 100),
    );
    return `${pct}% of ${lifespan} min life`;
  }
  if ((part.spare_count ?? 0) > 0) {
    return `${part.spare_count} spare${part.spare_count === 1 ? "" : "s"}`;
  }
  return null;
}

/** Installed-parts section backed by the per-gear parts tables. */
export function GearPartsSection({
  gearType,
  parts,
  isLoading,
  emptyHint,
}: {
  gearType: string;
  parts: GearPartRow[];
  isLoading: boolean;
  emptyHint: string;
}) {
  return (
    <Card className="bg-card/50 border-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary text-base">
          <Cpu className="h-4 w-4" aria-hidden />
          Installed Parts
          {parts.length > 0 && (
            <Badge variant="outline" className="border-primary/30 text-primary">
              {parts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Loading parts…</p>
        ) : parts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">
            <PackageOpen className="h-5 w-5 shrink-0" aria-hidden />
            {emptyHint}
          </div>
        ) : (
          <ul className="space-y-2">
            {parts.map((part) => {
              const wear = wearLabel(part);
              return (
                <li
                  key={part.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-primary/10 bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {part.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {part.brand ? `${part.brand} · ` : ""}
                      {part.model ? `${part.model} · ` : ""}
                      {part.category ? specLabel(part.category) : "Part"}
                    </div>
                  </div>
                  {wear && (
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {wear}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
