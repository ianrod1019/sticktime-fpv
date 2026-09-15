import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useQaMode } from "@/hooks/use-qa-mode";
import { setQaMode } from "@/lib/qa-mode";

/**
 * The QA-mode switch. Turning it on swaps the org-gated surfaces (vault,
 * SMS, portals, district, scheduling hub links) to fixture data and opens
 * the tier gates; writes are refused while it is on. Off = the app is
 * exactly as production behaves.
 */
export function QaModePanel() {
  const qaMode = useQaMode();
  const queryClient = useQueryClient();

  const handleToggle = (on: boolean) => {
    setQaMode(on);
    // Data hooks key their caches on the QA flag, but a sweep keeps any
    // non-keyed listeners (sidebar visibility etc.) consistent immediately.
    queryClient.invalidateQueries();
    toast.success(
      on
        ? "QA mode ON — fake orgs & data everywhere, writes disabled."
        : "QA mode off — back to real data.",
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-primary" /> QA mode
          {qaMode && (
            <Badge className="border-warning/40 bg-warning/10 font-mono text-[10px] text-warning">
              ACTIVE
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Preview every gated surface — districts, orgs, vault, SMS, portals,
          scheduling — with fake people and fake data. Reads never touch the
          database and writes are disabled while QA mode is on. The badge in
          the sidebar reminds you it's active.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex cursor-pointer items-center gap-3">
          <Switch checked={qaMode} onCheckedChange={handleToggle} />
          <span className="text-sm font-medium">
            {qaMode ? "QA mode is on" : "QA mode is off"}
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
