import { useState, useEffect } from "react";
import type { HangerItem } from "@/hooks/useHangerItem";
import { toast } from "sonner";

interface DroneDetailHeaderProps {
  item: HangerItem;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card/50 border border-primary/20 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 ${className}`}>{children}</div>;
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">{children}</h2>;
}

function StatValue({ children }: { children: React.ReactNode }) {
  return <span className="text-xl font-mono text-muted-foreground">{children}</span>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-primary/10 last:border-0">
      <span className="text-xs uppercase font-semibold tracking-wider text-primary">{label}</span>
      <span className="text-sm text-muted-foreground font-medium">{value}</span>
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-primary/10 last:border-0">
      <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="text-sm text-foreground font-medium bg-card border border-primary/20 rounded px-2 py-1 w-40 text-right outline-none focus:border-primary/50" />
    </div>
  );
}

export function DroneDetailHeader({ item }: DroneDetailHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ service_interval_minutes: string }>({
    service_interval_minutes: item.service_interval_minutes > 0 ? String(item.service_interval_minutes) : "",
  });

  useEffect(() => {
    setForm({
      service_interval_minutes: item.service_interval_minutes > 0 ? String(item.service_interval_minutes) : "",
    });
  }, [item]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "drones",
        operation: "update",
        data: {
          service_interval_minutes: form.service_interval_minutes ? Number(form.service_interval_minutes) : 0,
          updated_at: new Date().toISOString(),
        },
        filters: { id: item.id },
      });
      if (error) throw error;
      toast.success("Drone updated");
      setEditing(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setForm({
      service_interval_minutes: item.service_interval_minutes > 0 ? String(item.service_interval_minutes) : "",
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary">{item.name || "Unnamed Drone"}</h1>
            {item.brand && <p className="text-sm text-muted-foreground mt-1">{item.brand}</p>}
          </div>
          <div className="flex gap-3">
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 text-center">
              <p className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Connector</p>
              <p className="text-lg font-mono text-muted-foreground">{item.connector_type ?? "—"}</p>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 text-center">
              <p className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Cells</p>
              <p className="text-lg font-mono text-muted-foreground">{item.cells ? `${item.cells}S` : "—"}</p>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 text-center">
              <p className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Cost</p>
              <p className="text-lg font-mono text-muted-foreground">${item.purchase_cost.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Flight Stats
          </CardHeader>
          <div className="space-y-1">
            <InfoRow label="Total Minutes" value={<StatValue>{item.total_minutes}</StatValue>} />
            <InfoRow label="Minutes Since Service" value={<StatValue>{item.minutes_since_service}</StatValue>} />
            <InfoRow label="Crash Count" value={<span className="font-mono text-primary">{item.crash_count ?? 0}</span>} />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Service
          </CardHeader>
          {editing ? (
            <div className="space-y-1">
              <TextInput label="Service Interval (min)" value={form.service_interval_minutes} onChange={(v) => setForm((p) => ({ ...p, service_interval_minutes: v }))} />
            </div>
          ) : (
            <div className="space-y-1">
              <InfoRow label="Service Interval" value={item.service_interval_minutes > 0 ? <span className="font-mono text-primary">{item.service_interval_minutes} min</span> : <span className="text-muted-foreground">As needed</span>} />
            </div>
          )}
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={() => window.history.length > 1 ? window.history.back() : undefined} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-all duration-200 p-2 rounded-lg hover:bg-primary/5 font-medium" type="button">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <span>Back</span>
        </button>
        {editing ? (
          <>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 font-semibold px-6 py-2.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md border border-primary/20 disabled:opacity-50" type="button">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span>{saving ? "Saving..." : "Save"}</span>
            </button>
            <button onClick={handleCancel} className="flex items-center gap-2 text-sm border border-primary/30 text-primary hover:bg-primary/10 font-medium px-4 py-2.5 rounded-lg transition-all duration-200" type="button">Cancel</button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 font-semibold px-6 py-2.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md border border-primary/20" type="button">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            <span>Edit Drone</span>
          </button>
        )}
      </div>
    </div>
  );
}