import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Clock, DollarSign, FileText, RefreshCw } from "lucide-react";

interface MaintenanceEntry {
  id: string;
  description: string;
  performed_on: string;
  cost: number;
  reset_service_clock: boolean;
  changed?: string[];
}

interface MaintenanceLogEntryProps {
  log: MaintenanceEntry;
}

export function MaintenanceLogEntry({ log }: MaintenanceLogEntryProps) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div key={log.id} className="space-y-2">
      <div
        className="flex items-center justify-between p-3 bg-muted/20 border border-primary/5 rounded-lg cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <div className="text-sm font-medium text-foreground">
              {log.description}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDate(log.performed_on)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {log.cost !== null && log.cost > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              {log.cost.toFixed(2)}
            </div>
          )}
          {log.reset_service_clock && (
            <Badge variant="outline" className="text-[10px]">
              <RefreshCw className="h-3 w-3 mr-1" />
              Reset
            </Badge>
          )}
        </div>
      </div>
      {expanded && (
        <div className="p-3 bg-muted/10 border border-primary/5 rounded-lg space-y-2">
          {log.changed && log.changed.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">What Changed:</div>
              <ul className="list-disc list-inside text-xs text-foreground/80 space-y-1">
                {log.changed.map((change, index) => (
                  <li key={index}>{change}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            Log ID: {log.id}
          </div>
          {log.performed_on && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Performed on {formatDate(log.performed_on)}
            </div>
          )}
          {log.reset_service_clock && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <RefreshCw className="h-3 w-3" />
              Service clock was reset
            </div>
          )}
        </div>
      )}
    </div>
  );
}