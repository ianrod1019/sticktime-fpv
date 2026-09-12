import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { GearItem, MaintenanceLog } from "./types";

interface GearCardLogsProps {
  gear: GearItem;
  logs: MaintenanceLog[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  isDeleting: boolean;
  onAddLog: (gearId: string, description: string, cost: string) => void;
  onRemoveLog: (logId: string) => void;
}

export function GearCardLogs({
  gear,
  logs,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  isDeleting,
  onAddLog,
  onRemoveLog,
}: GearCardLogsProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [logDescription, setLogDescription] = useState("");
  const [logCost, setLogCost] = useState("");
  const [isLogsCollapsed, setIsLogsCollapsed] = useState(false);

  return (
    <div className="pt-3 border-t border-primary/10">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          className="flex items-center gap-1.5 cursor-pointer select-none text-left"
          onClick={() => setIsLogsCollapsed(!isLogsCollapsed)}
          aria-expanded={!isLogsCollapsed}
        >
          <span className="text-[11px] font-mono font-medium tracking-wider uppercase flex items-center gap-1 text-primary">
            Maintenance Log ({logs.length})
            {isLogsCollapsed ? (
              <ChevronDown className="h-3 w-3 inline" aria-hidden />
            ) : (
              <ChevronUp className="h-3 w-3 inline" aria-hidden />
            )}
          </span>
        </button>

        <Dialog
          open={logOpen}
          onOpenChange={(o) => {
            setLogOpen(o);
            if (o) {
              setLogDescription("");
              setLogCost("");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isDeleting}
              className="h-6 px-2 text-[11px] text-primary hover:text-primary/80 hover:bg-primary/10"
            >
              <Plus className="mr-0.5 h-3 w-3" aria-hidden /> Log
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/30 bg-background/95 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground font-display">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                Add maintenance entry
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="ldesc">Description</Label>
                <Input
                  id="ldesc"
                  value={logDescription}
                  onChange={(e) => setLogDescription(e.target.value)}
                  placeholder="e.g. Replaced motor bearings, cleaned frame"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lcost">Cost (optional)</Label>
                <div className="relative">
                  <DollarSign
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="lcost"
                    value={logCost}
                    onChange={(e) => setLogCost(e.target.value)}
                    placeholder="0.00"
                    className="pl-8"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  onAddLog(gear.id, logDescription, logCost);
                  setLogOpen(false);
                  setLogDescription("");
                  setLogCost("");
                }}
                disabled={!logDescription}
                className="bg-primary hover:bg-primary/80 text-primary-foreground w-full sm:w-auto"
              >
                Save log
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          isLogsCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          {logs.length > 0 ? (
            <div className="space-y-1.5 pt-1 pr-1 max-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-secondary/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/50 hover:[&::-webkit-scrollbar-thumb]:bg-primary">
              {logs
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.performed_on).getTime() -
                    new Date(a.performed_on).getTime(),
                )
                .map((log) => {
                  const date = new Date(log.performed_on).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    },
                  );

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-2 px-2.5 py-1.5 rounded-md border text-xs bg-secondary/30 border-primary/10"
                    >
                      <div className="min-w-0 flex-1 truncate">
                        <p className="font-medium text-foreground">
                          {log.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{date}</span>
                          {log.cost && log.cost > 0 && (
                            <span className="text-primary font-mono">
                              ${log.cost.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isDeleting}
                        onClick={() => onRemoveLog(log.id)}
                        aria-label={`Remove log entry: ${log.description}`}
                        className="h-6 w-6 transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/20 shrink-0"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                      </Button>
                    </div>
                  );
                })}
              {hasMore && onLoadMore && (
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="w-full py-1.5 text-[10px] font-mono uppercase tracking-wider text-primary hover:bg-primary/10 rounded-md disabled:opacity-50"
                >
                  {isLoadingMore ? "Loading…" : "Load older entries"}
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/60 italic pt-1">
              No maintenance entries yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
