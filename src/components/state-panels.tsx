import { Loader2, AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function LoadingPanel({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="hud-panel flex items-center justify-center gap-3 p-12">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
      <span className="label-mono text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="hud-panel max-w-md mx-auto my-12 p-8 text-center space-y-4 border-destructive/30">
      <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
        <AlertCircle className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="hud-panel p-12 text-center text-sm text-muted-foreground border-primary/20 max-w-xl mx-auto my-12">
      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 border border-primary/20">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <p className="font-display font-semibold text-foreground text-lg mb-1">
        {title}
      </p>
      {description && (
        <p className="mb-6 text-xs text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}
