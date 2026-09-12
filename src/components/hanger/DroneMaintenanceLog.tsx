import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Plus,
  X,
} from "lucide-react";
import { db_request } from "@/lib/db_request";
import { toast } from "sonner";
import { DroneMaintenanceLogStats } from "@/components/hanger/subcomponents/DroneMaintenanceLogStats";
import { MaintenanceLogEntry } from "@/components/hanger/subcomponents/MaintenanceLogEntry";
import { formatDate } from "@/components/hanger/subcomponents/utils";

interface MaintenanceEntry {
  id: string;
  description: string;
  performed_on: string;
  cost: number;
  reset_service_clock: boolean;
  changed?: string[];
}

interface DroneMaintenanceLogProps {
  droneId: string;
  onRefresh?: () => void;
}

export function DroneMaintenanceLog({ droneId, onRefresh }: DroneMaintenanceLogProps) {
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newLog, setNewLog] = useState({
    description: "",
    performed_on: new Date().toISOString().split("T")[0],
    cost: "",
    reset_service_clock: false,
    changed: "",
  });
  const [item, setItem] = useState<{ service_interval_minutes?: number; minutes_since_service?: number } | null>(null);

  useEffect(() => {
    db_request({
      mode: "query",
      schema: "personal_gear",
      table: "drones",
      operation: "select",
      filters: { id: droneId },
    }).then(({ data }) => {
      if (data && Array.isArray(data) && data.length > 0) {
        setItem(data[0]);
      }
    });
  }, [droneId]);

  useEffect(() => {
    db_request({
      mode: "query",
      schema: "personal_gear",
      table: "drone_maintenance_logs",
      operation: "select",
      filters: { drone_id: droneId },
    }).then(({ data }) => {
      if (Array.isArray(data)) {
        setMaintenanceLogs(data.map((d: any) => ({
          id: String(d.id),
          description: d.description,
          performed_on: d.date,
          cost: d.cost,
          reset_service_clock: d.reset_service_clock,
          changed: d.what_changed,
        })));
      }
    });
  }, [droneId, onRefresh]);

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLog.description.trim()) return;
    setSaving(true);
    try {
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "drone_maintenance_logs",
        operation: "insert",
        data: {
          drone_id: droneId,
          description: newLog.description,
          date: newLog.performed_on,
          cost: newLog.cost ? Number(newLog.cost) : 0,
          what_changed: newLog.changed,
          reset_service_clock: newLog.reset_service_clock,
        },
      });
      if (error) throw error;
      toast.success("Maintenance log added");
      setNewLog({
        description: "",
        performed_on: new Date().toISOString().split("T")[0],
        cost: "",
        reset_service_clock: false,
        changed: "",
      });
      setShowForm(false);
      onRefresh?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add log");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <DroneMaintenanceLogStats
        maintenanceLogs={maintenanceLogs}
        {...(item?.service_interval_minutes !== undefined
          ? { serviceInterval: item.service_interval_minutes }
          : {})}
        {...(item?.minutes_since_service !== undefined
          ? { minutesSinceService: item.minutes_since_service }
          : {})}
      />

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-primary">Maintenance History</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm(!showForm)}
              className="border-primary/30 text-primary hover:bg-primary/10"
              type="button"
            >
              {showForm ? (
                <>
                  <X className="h-3 w-3 mr-1" /> Cancel
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3 mr-1" /> Add Log
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showForm && (
            <form onSubmit={handleAddLog} className="mb-4 p-4 bg-muted/20 border border-primary/10 rounded-lg space-y-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Description</label>
                <input
                  type="text"
                  value={newLog.description}
                  onChange={(e) => setNewLog((p) => ({ ...p, description: e.target.value }))}
                  placeholder="e.g., Motor replacement - front left"
                  className="text-sm text-foreground font-medium bg-card border border-primary/20 rounded px-3 py-2 outline-none focus:border-primary/50"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={newLog.performed_on}
                  onChange={(e) => setNewLog((p) => ({ ...p, performed_on: e.target.value }))}
                  className="text-sm text-foreground font-medium bg-card border border-primary/20 rounded px-3 py-2 outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newLog.cost}
                  onChange={(e) => setNewLog((p) => ({ ...p, cost: e.target.value }))}
                  placeholder="0.00"
                  className="text-sm text-foreground font-medium bg-card border border-primary/20 rounded px-3 py-2 outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">What Changed (one per line)</label>
                <textarea
                  value={newLog.changed}
                  onChange={(e) => setNewLog((p) => ({ ...p, changed: e.target.value }))}
                  placeholder="Replaced motor&#10;Updated firmware"
                  rows={3}
                  className="text-sm text-foreground font-medium bg-card border border-primary/20 rounded px-3 py-2 outline-none focus:border-primary/50 resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="resetClock"
                  checked={newLog.reset_service_clock}
                  onChange={(e) => setNewLog((p) => ({ ...p, reset_service_clock: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <label htmlFor="resetClock" className="text-sm text-foreground">Reset service clock</label>
              </div>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Log"}
              </Button>
            </form>
          )}
          <div className="space-y-3">
            {maintenanceLogs.map((log) => (
              <MaintenanceLogEntry key={log.id} log={log} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Clock className="h-4 w-4" /> Service Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
              Service Interval
            </span>
            <span className="font-mono text-sm text-foreground">
              {item?.service_interval_minutes && item.service_interval_minutes > 0
                ? `Every ${item.service_interval_minutes} min`
                : "As needed"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
              Last Service
            </span>
            <span className="font-mono text-sm text-foreground">
              {item?.minutes_since_service} min ago
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
              Next Service
            </span>
            <span className="font-mono text-sm text-foreground">
              {item?.service_interval_minutes && item.minutes_since_service != null
                ? Math.max(0, item.service_interval_minutes - item.minutes_since_service)
                : "—"}{" "}
              min remaining
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}