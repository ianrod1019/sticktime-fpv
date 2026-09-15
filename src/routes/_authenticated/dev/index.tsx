import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { FlaskConical } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { MockDataGenerator } from "@/components/dev/MockDataGenerator";
import { ViewAsUserPanel } from "@/components/dev/ViewAsUserPanel";
import { QaModePanel } from "@/components/dev/QaModePanel";

export const Route = createFileRoute("/_authenticated/dev/")({
  component: DevConsole,
});

function DevConsole() {
  const { userRole } = useAuth();
  // "View account as" reads other users' email/PII via a SECURITY DEFINER
  // RPC that's still gated to admin/dev — testers get fixture data and the
  // rest of the console, not a directory of everyone else's account.
  const canViewOtherAccounts = userRole === "admin" || userRole === "dev";

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      <PageHeader
        title="Developer & QA Console"
        subtitle="Fixture data and (for admins/devs) read-only account inspection for exercising the app."
        action={
          <Badge
            variant="outline"
            className="gap-1.5 border-warning/40 bg-warning/10 text-warning font-mono"
          >
            <FlaskConical className="h-3.5 w-3.5" /> QA MODE
          </Badge>
        }
      />

      <div className="grid gap-6">
        <QaModePanel />
        <MockDataGenerator />
        {canViewOtherAccounts && <ViewAsUserPanel />}
      </div>
    </div>
  );
}
