/**
 * JhaHistory — displays a pilot's recent JHA submissions (or all org
 * submissions for admins/safety officers). Used on the /jha route.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { EmptyState } from "@/components/state-panels";
import {
  type JhaSubmission,
  type JhaSubmissionStatus,
  type JhaResponses,
} from "@/types/jha";

const STATUS_STYLES: Record<
  JhaSubmissionStatus,
  { color: string; badge: string }
> = {
  passed: {
    color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  failed: {
    color: "text-destructive bg-destructive/10 border-destructive/20",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

function countResponses(responses: JhaResponses): {
  total: number;
  passed: number;
  failed: number;
} {
  const keys = Object.keys(responses);
  return {
    total: keys.length,
    passed: keys.filter((k) => responses[k]?.passed).length,
    failed: keys.filter((k) => responses[k] && !responses[k].passed).length,
  };
}

export function JhaHistory({ submissions }: { submissions: JhaSubmission[] }) {
  if (submissions.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No JHA submissions yet"
        description="Complete a pre-flight checklist to see your history here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {submissions.map((sub) => {
        const cfg = STATUS_STYLES[sub.status];
        const Icon = sub.status === "passed" ? CheckCircle2 : XCircle;
        const stats = countResponses(sub.responses);
        return (
          <Card
            key={sub.submission_id}
            className="border-white/[0.08] bg-white/[0.02]"
          >
            <CardContent className="flex items-center gap-4 p-4">
              <span
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-lg border",
                  cfg.color,
                )}
              >
                {Icon && <Icon className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">
                    {sub.status === "passed"
                      ? "Pre-flight check passed"
                      : "Pre-flight check failed"}
                  </span>
                  <Badge variant="outline" className={cn("font-mono text-[10px]", cfg.badge)}>
                    {sub.status.toUpperCase()}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-[10px] text-zinc-600">
                  {stats.passed}/{stats.total} items passed
                  {stats.failed > 0 && ` · ${stats.failed} failed`}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                {formatDistanceToNow(new Date(sub.created_at), {
                  addSuffix: true,
                })}
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
