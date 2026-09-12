import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollText } from "lucide-react";
import type { MaintenanceLog } from "@/hooks/gear-item";

interface MaintenanceLogListProps {
  logs: MaintenanceLog[];
  isLoading: boolean;
  canEdit: boolean;
  onSubmitLog: (description: string, cost: string) => Promise<void>;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MaintenanceLogList({
  logs,
  isLoading,
  canEdit,
  onSubmitLog,
}: MaintenanceLogListProps) {
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await onSubmitLog(description.trim(), cost);
      setDescription("");
      setCost("");
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading log…</p>;
  }

  return (
    <div className="space-y-3">
      {canEdit && !showForm && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(true)}
          className="gap-1.5"
        >
          <ScrollText className="h-3.5 w-3.5" aria-hidden />
          Add log entry
        </Button>
      )}

      {showForm && (
        <div className="space-y-3 border border-primary/20 rounded-lg p-3 bg-primary/5">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened? e.g. snapped arm, motor swap"
            aria-label="Log description"
          />
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="Cost ($)"
              aria-label="Repair cost"
              className="w-32"
            />
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!description.trim() || submitting}
            >
              {submitting ? "Saving…" : "Save entry"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No maintenance or crash entries yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-primary/10 bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">{log.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(log.performed_on)}
                  {log.reset_service_clock ? " · service reset" : ""}
                </p>
              </div>
              {log.cost != null && log.cost > 0 && (
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  ${log.cost.toFixed(2)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
