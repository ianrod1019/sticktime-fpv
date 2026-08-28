import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Wrench, AlertTriangle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePilot } from "@/hooks/use-pilot";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatHours, partHealth } from "@/lib/fpv";

export const Route = createFileRoute("/_authenticated/garage")({
  head: () => ({
    meta: [
      { title: "Garage — StickTime FPV" },
      { name: "description", content: "Track your quads, goggles and radios with maintenance health alerts." },
      { property: "og:title", content: "Garage — StickTime FPV" },
      {
        property: "og:description",
        content: "Track your quads, goggles and radios with maintenance health alerts.",
      },
    ],
  }),
  component: Garage,
});

const GEAR_TYPES = ["quad", "transmitter", "goggles", "battery", "other"] as const;
type GearType = (typeof GEAR_TYPES)[number];

const TYPE_LABELS: Record<GearType, string> = {
  quad: "Drone / quad",
  transmitter: "Controller / radio",
  goggles: "Goggles",
  battery: "Battery",
  other: "Other gear",
};

const GEAR_GROUPS: { key: string; title: string; blurb: string; types: GearType[] }[] = [
  {
    key: "drones",
    title: "Drones",
    blurb: "Airframes that accumulate flight time.",
    types: ["quad"],
  },
  {
    key: "controllers",
    title: "Controllers & radios",
    blurb: "Transmitters you pick separately when logging a session.",
    types: ["transmitter"],
  },
  {
    key: "other",
    title: "Other equipment",
    blurb: "Goggles, batteries and everything else.",
    types: ["goggles", "battery", "other"],
  },
];

const FREE_PART_LIMIT = 5;


function Garage() {
  const queryClient = useQueryClient();
  const { isPro } = usePilot();
  const [gearOpen, setGearOpen] = useState(false);
  const [name, setName] = useState("");
  const [gearType, setGearType] = useState<(typeof GEAR_TYPES)[number]>("quad");
  const [brand, setBrand] = useState("");
  const [interval, setIntervalMinutes] = useState(600);

  const [partOpen, setPartOpen] = useState<string | null>(null);
  const [partName, setPartName] = useState("");
  const [partCategory, setPartCategory] = useState("");
  const [partLifespan, setPartLifespan] = useState(300);
  const [partSpares, setPartSpares] = useState(0);

  const [logOpen, setLogOpen] = useState<string | null>(null);
  const [logDesc, setLogDesc] = useState("");
  const [logCost, setLogCost] = useState("");

  const { data } = useQuery({
    queryKey: ["garage"],
    queryFn: async () => {
      const [gear, parts, logs] = await Promise.all([
        supabase.from("gear").select("*").order("created_at"),
        supabase.from("gear_parts").select("*"),
        supabase.from("maintenance_logs").select("*").order("performed_on", { ascending: false }),
      ]);
      return { gear: gear.data ?? [], parts: parts.data ?? [], logs: logs.data ?? [] };
    },
  });

  const gear = data?.gear ?? [];
  const parts = data?.parts ?? [];
  const logs = data?.logs ?? [];

  const addGear = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("gear").insert({
        user_id: u.user!.id,
        name,
        gear_type: gearType,
        brand: brand || null,
        service_interval_minutes: interval,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to the garage");
      setGearOpen(false);
      setName("");
      setBrand("");
      queryClient.invalidateQueries({ queryKey: ["garage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPart = useMutation({
    mutationFn: async (gearId: string) => {
      if (!isPro && parts.length >= FREE_PART_LIMIT) {
        throw new Error(`Free tier tracks ${FREE_PART_LIMIT} parts — go Pro for unlimited.`);
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("gear_parts").insert({
        user_id: u.user!.id,
        gear_id: gearId,
        name: partName,
        category: partCategory || null,
        lifespan_minutes: partLifespan,
        spare_count: partSpares,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Component tracked");
      setPartOpen(null);
      setPartName("");
      setPartCategory("");
      queryClient.invalidateQueries({ queryKey: ["garage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLog = useMutation({
    mutationFn: async (gearId: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("maintenance_logs").insert({
        user_id: u.user!.id,
        gear_id: gearId,
        description: logDesc,
        cost: logCost ? Number(logCost) : null,
        reset_service_clock: true,
      });
      if (error) throw error;
      await supabase.from("gear").update({ minutes_since_service: 0 }).eq("id", gearId);
    },
    onSuccess: () => {
      toast.success("Maintenance logged, service clock reset");
      setLogOpen(null);
      setLogDesc("");
      setLogCost("");
      queryClient.invalidateQueries({ queryKey: ["garage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePart = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gear_parts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["garage"] }),
  });

  return (
    <>
      <PageHeader
        title="Gear garage"
        subtitle="Fleet, components, crash counters and service health."
        action={
          <Dialog open={gearOpen} onOpenChange={setGearOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Add gear
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add gear</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gname">Name</Label>
                  <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Source One v5" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={gearType} onValueChange={(v) => setGearType(v as typeof gearType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GEAR_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interval">Service interval (minutes)</Label>
                  <Input
                    id="interval"
                    type="number"
                    value={interval}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => addGear.mutate()} disabled={!name}>
                  Add to garage
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {gear.length === 0 && (
        <div className="hud-panel p-8 text-center text-sm text-muted-foreground">
          Your garage is empty. Add your first quad, radio or goggles.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {gear.map((g) => {
          const servicePct = Math.min(
            100,
            Math.round((g.minutes_since_service / Math.max(g.service_interval_minutes, 1)) * 100),
          );
          const gParts = parts.filter((p) => p.gear_id === g.id);
          const gLogs = logs.filter((l) => l.gear_id === g.id).slice(0, 3);
          return (
            <div key={g.id} className="hud-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{g.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {g.brand ? `${g.brand} · ` : ""}
                    {g.gear_type}
                  </p>
                </div>
                <Badge variant={servicePct >= 100 ? "destructive" : "secondary"}>
                  {servicePct >= 100 ? "Service due" : `${servicePct}% to service`}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="label-mono">Airtime</p>
                  <p className="font-mono text-sm">{formatHours(g.total_minutes)}</p>
                </div>
                <div>
                  <p className="label-mono">Packs</p>
                  <p className="font-mono text-sm">{g.pack_count}</p>
                </div>
                <div>
                  <p className="label-mono">Crashes</p>
                  <p className="font-mono text-sm">{g.crash_count}</p>
                </div>
              </div>

              <Progress value={servicePct} className="mt-4" />

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <span className="label-mono">Components</span>
                  <Dialog
                    open={partOpen === g.id}
                    onOpenChange={(o) => setPartOpen(o ? g.id : null)}
                  >
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Plus className="mr-1 h-3 w-3" /> Part
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Track a component</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="pname">Part</Label>
                          <Input id="pname" value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Rear-left motor" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="pcat">Category</Label>
                          <Input id="pcat" value={partCategory} onChange={(e) => setPartCategory(e.target.value)} placeholder="motor / prop / VTX" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="plife">Lifespan (min)</Label>
                            <Input
                              id="plife"
                              type="number"
                              value={partLifespan}
                              onChange={(e) => setPartLifespan(Number(e.target.value))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="pspare">Spares</Label>
                            <Input
                              id="pspare"
                              type="number"
                              value={partSpares}
                              onChange={(e) => setPartSpares(Number(e.target.value))}
                            />
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={() => addPart.mutate(g.id)} disabled={!partName}>
                          Track part
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                {gParts.length === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">No components tracked yet.</p>
                )}
                <div className="mt-2 space-y-2">
                  {gParts.map((p) => {
                    const health = partHealth(p.minutes_used, p.lifespan_minutes);
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm">{p.name}</span>
                            {health.status !== "healthy" && (
                              <AlertTriangle
                                className={
                                  health.status === "replace"
                                    ? "h-3.5 w-3.5 text-destructive"
                                    : "h-3.5 w-3.5 text-warning"
                                }
                              />
                            )}
                            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                              {health.pct}% · {p.spare_count} spare
                            </span>
                          </div>
                          <Progress value={health.pct} className="mt-1 h-1.5" />
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removePart.mutate(p.id)} aria-label="Remove part">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <span className="label-mono">Maintenance</span>
                <Dialog open={logOpen === g.id} onOpenChange={(o) => setLogOpen(o ? g.id : null)}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Wrench className="mr-1 h-3 w-3" /> Log service
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Log maintenance</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="ldesc">What did you do?</Label>
                        <Input id="ldesc" value={logDesc} onChange={(e) => setLogDesc(e.target.value)} placeholder="Replaced all four motors" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lcost">Cost</Label>
                        <Input id="lcost" type="number" value={logCost} onChange={(e) => setLogCost(e.target.value)} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => addLog.mutate(g.id)} disabled={!logDesc}>
                        Save & reset clock
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="mt-2 space-y-1">
                {gLogs.map((l) => (
                  <p key={l.id} className="text-xs text-muted-foreground">
                    <span className="font-mono">{l.performed_on}</span> — {l.description}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
