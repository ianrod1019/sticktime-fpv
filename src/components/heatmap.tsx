import { heatmapDays, type SessionRow } from "@/lib/fpv";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

function level(minutes: number) {
  if (minutes === 0) return 0;
  if (minutes < 20) return 1;
  if (minutes < 45) return 2;
  if (minutes < 90) return 3;
  return 4;
}

const LEVEL_STYLE = [
  "bg-muted/60",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

export function Heatmap({ sessions }: { sessions: SessionRow[] }) {
  const cells = heatmapDays(sessions);
  const weeks: { date: string; minutes: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

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
                      className={`h-2.75 w-2.75 rounded-[2px] ${LEVEL_STYLE[level(cell.minutes)]}`}
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
