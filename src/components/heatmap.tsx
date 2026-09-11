import { heatmapDays, type SessionRow } from "@/lib/fpv";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

const LEVEL_STYLE = [
  "bg-muted/40 border border-border/60",
  "bg-primary/15 border border-primary/20",
  "bg-primary/30 border border-primary/35",
  "bg-primary/55 border border-primary/60 shadow-[0_0_8px_-2px_var(--color-primary)]",
  "bg-primary border border-primary/80 shadow-[0_0_14px_-3px_var(--color-primary)]",
];

function levelFor(minutes: number, thresholds: number[]) {
  if (minutes === 0) return 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (minutes <= thresholds[i]) return i + 1;
  }
  return thresholds.length;
}

export function Heatmap({ sessions }: { sessions: SessionRow[] }) {
  const cells = heatmapDays(sessions);
  const weeks: { date: string; minutes: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const maxMinutes = Math.max(0, ...cells.map((c) => c.minutes));
  const thresholds = [0, 0, 0, 0];
  if (maxMinutes > 0) {
    const step = maxMinutes / 4;
    thresholds[0] = Math.round(step);
    thresholds[1] = Math.round(step * 2);
    thresholds[2] = Math.round(step * 3);
    thresholds[3] = maxMinutes;
  }

  return (
    <TooltipProvider delayDuration={80}>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-0.75">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.75">
              {week.map((cell) => (
                <Tooltip key={cell.date}>
                  <TooltipTrigger asChild>
                    <div
                      className={`h-2.75 w-2.75 rounded-[2px] ${LEVEL_STYLE[levelFor(cell.minutes, thresholds)]} hover:shadow-[0_0_16px_-2px_var(--color-primary)] transition-shadow duration-200`}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <span className="font-mono text-xs">
                      {cell.minutes} min · {cell.date}
                    </span>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="label-mono">less</span>
        {LEVEL_STYLE.map((s, i) => (
          <div key={i} className={`h-2.75 w-2.75 rounded-[2px] ${s}`} />
        ))}
        <span className="label-mono">more</span>
      </div>
    </TooltipProvider>
  );
}
