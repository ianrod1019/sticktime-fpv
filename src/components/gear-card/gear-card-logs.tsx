import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Plus, Check, X, Trash2, DollarSign } from "lucide-react";
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
  isDeleting: boolean;
  onAddLog: (gearId: string, description: string, cost: string) => void;
  onRemoveLog: (logId: string) => void;
}

export function GearCardLogs({
  gear,
  logs,
  isDeleting,
  onAddLog,
  onRemoveLog,
}: GearCardLogsProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [logDescription, setLogDescription] = useState("");
  const [logCost, setLogCost] = useState("");
  const [isLogsCollapsed, setIsLogsCollapsed] = useState(false);

  const [confirmingLogId, setConfirmingLogId] = useState<string | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [hoveredLogId, setHoveredLogId] = useState<string | null>(null);
  const logTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (logTimeoutRef.current) clearTimeout(logTimeoutRef.current);
    };
  }, []);

  const handleStartLogDeletePrompt = (e: React.MouseEvent, logId: string) => {
    e.stopPropagation();
    if (confirmingLogId === logId) return;
    setConfirmingLogId(logId);
    setHoveredLogId(logId);

    if (logTimeoutRef.current) clearTimeout(logTimeoutRef.current);
    logTimeoutRef.current = setTimeout(() => {
      setConfirmingLogId(null);
      setHoveredLogId(null);
    }, 3500);
  };

  const handleCancelLogDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (logTimeoutRef.current) clearTimeout(logTimeoutRef.current);
    setConfirmingLogId(null);
    setHoveredLogId(null);
  };

  const handleExecuteLogDelete = (e: React.MouseEvent, logId: string) => {
    e.stopPropagation();
    if (logTimeoutRef.current) clearTimeout(logTimeoutRef.current);
    setDeletingLogId(logId);
    setHoveredLogId(logId);
    setTimeout(() => {
      onRemoveLog(logId);
      setConfirmingLogId(null);
      setDeletingLogId(null);
      setHoveredLogId(null);
    }, 350);
  };

  return (
    <div className="mt-4 pt-3 border-t border-orange-500/10">
      <div className="flex items-center justify-between mb-2">
        <div
          className="flex items-center gap-1.5 cursor-pointer select-none"
          onClick={() => setIsLogsCollapsed(!isLogsCollapsed)}
        >
          <span className="text-[11px] font-mono font-medium tracking-wider uppercase flex items-center gap-1 text-orange-400">
            Maintenance Log ({logs.length})
            {isLogsCollapsed ? (
              <ChevronDown className="h-3 w-3 inline" />
            ) : (
              <ChevronUp className="h-3 w-3 inline" />
            )}
          </span>
        </div>

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
              className="h-6 px-2 text-[11px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
            >
              <Plus className="mr-0.5 h-3 w-3" /> Log
            </Button>
          </DialogTrigger>
          <DialogContent className="border-orange-500/30 bg-background/95 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground font-display">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
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
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                className="bg-orange-500 hover:bg-orange-600 text-white w-full sm:w-auto"
              >
                Save log
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div
        style={{
          transition: "max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
          maxHeight: isLogsCollapsed ? "0px" : "300px",
          opacity: isLogsCollapsed ? 0 : 1,
        }}
      >
        {logs.length > 0 ? (
          <div className="space-y-1.5 pt-1 pr-1 max-h-[150px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-secondary/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-orange-500/50 hover:[&::-webkit-scrollbar-thumb]:bg-orange-500">
            {logs
              .slice()
              .sort((a, b) => new Date(b.performed_on).getTime() - new Date(a.performed_on).getTime())
              .map((log) => {
                const isLogConfirming = confirmingLogId === log.id;
                const isLogDeleting = deletingLogId === log.id;
                const isLogHovered = hoveredLogId === log.id;
                const isLogActiveHighlight = isLogConfirming || isLogHovered || isLogDeleting;

                const date = new Date(log.performed_on).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                return (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border text-xs transition-all duration-300 ${
                      isLogDeleting
                        ? "opacity-0 scale-95 translate-x-2 pointer-events-none"
                        : isLogActiveHighlight
                        ? "bg-card/90 border-red-500/60 shadow-sm shadow-red-500/10 animate-subtle-shake ring-1 ring-red-500/40"
                        : "bg-secondary/30 border-orange-500/10"
                    }`}
                  >
                    <div className="min-w-0 flex-1 truncate">
                      <p className={`font-medium ${
                        isLogActiveHighlight ? "text-red-400" : "text-foreground"
                      }`}>
                        {log.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{date}</span>
                        {log.cost && log.cost > 0 && (
                          <span className="text-orange-400 font-mono">${log.cost.toFixed(2)}</span>
                        )}
                      </div>
                    </div>

                    {isLogConfirming ? (
                      <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/40 rounded px-1 py-0.5 animate-in fade-in zoom-in-95 duration-150 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[9px] font-medium bg-red-600 text-white hover:bg-red-700 hover:text-white rounded"
                          onClick={(e) => handleExecuteLogDelete(e, log.id)}
                        >
                          <Check className="h-2.5 w-2.5 mr-0.5" /> Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded"
                          onClick={handleCancelLogDelete}
                          title="Cancel"
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isDeleting}
                        onMouseEnter={() => setHoveredLogId(log.id)}
                        onMouseLeave={() => {
                          if (!isLogConfirming && !isLogDeleting) {
                            setHoveredLogId(null);
                          }
                        }}
                        onClick={(e) => handleStartLogDeletePrompt(e, log.id)}
                        aria-label="Remove log entry"
                        className="h-6 w-6 transition-all duration-200 ease-out text-muted-foreground hover:text-red-400 hover:bg-red-500/20 hover:border-red-500/40 active:scale-[0.95] shrink-0 border border-transparent"
                      >
                        <Trash2 className="h-3 w-3 text-red-500" style={{ color: "#ef4444" }} />
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/60 italic pt-1">
            No maintenance entries yet.
          </p>
        )}
      </div>
    </div>
  );
}
