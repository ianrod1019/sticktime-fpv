import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Wrench, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

const CONTROLLER_CATEGORIES = [
  { label: "Stick Ends", value: "stickends", placeholder: "e.g. CNC Aluminum V2 Ends" },
  { label: "Gimbals", value: "gimbals", placeholder: "e.g. AG01 Hall Gimbal" },
  { label: "Screen", value: "screen", placeholder: "e.g. OLED Replacement / Protector" },
  { label: "Switches", value: "switches", placeholder: "e.g. 3-Way Toggle Replacement" },
  { label: "Module / Bay", value: "module", placeholder: "e.g. ELRS Nano Backpack" },
  { label: "Battery", value: "battery", placeholder: "e.g. 21700 Li-Ion Pack Mod" },
] as const;

function Garage() {
  const queryClient = useQueryClient();
  const [gearOpen, setGearOpen] = useState(false);
  const [name, setName] = useState("");
  const [gearType, setGearType] = useState<(typeof GEAR_TYPES)[number]>("quad");
  const [brand, setBrand] = useState("");
  const [serviceMode, setServiceMode] = useState<"interval" | "needed">("interval");
  const [interval, setIntervalMinutes] = useState(600);

  const [partOpen, setPartOpen] = useState<string | null>(null);
  const [partName, setPartName] = useState("");
  const [partCategory, setPartCategory] = useState<string>("stickends");
  const [partDescription, setPartDescription] = useState("");

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
      const finalInterval = serviceMode === "needed" ? 9999999 : interval;
      const { error } = await supabase.from("gear").insert({
        user_id: u.user!.id,
        name,
        gear_type: gearType,
        brand: brand || null,
        service_interval_minutes: finalInterval,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to the garage");
      setGearOpen(false);
      setName("");
      setBrand("");
      setServiceMode("interval");
      setIntervalMinutes(600);
      queryClient.invalidateQueries({ queryKey: ["garage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPart = useMutation({
    mutationFn: async (gearId: string) => {
      const { data: u } = await supabase.auth.getUser();
      const targetGear = gear.find((g) => g.id === gearId);
      const isTransmitter = targetGear?.gear_type === "transmitter";

      const finalName = isTransmitter && partDescription 
        ? `${partName}: ${partDescription}` 
        : partName;

      const { error } = await supabase.from("gear_parts").insert({
        user_id: u.user!.id,
        gear_id: gearId,
        name: finalName,
        category: isTransmitter ? partCategory : "motor",
        lifespan_minutes: isTransmitter ? 999999 : 600,
        spare_count: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Component saved");
      setPartOpen(null);
      setPartName("");
      setPartDescription("");
      setPartCategory("stickends");
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

  const removeGear = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("sessions").update({ gear_id: null }).eq("gear_id", id);
      await supabase.from("sessions").update({ controller_id: null }).eq("controller_id", id);
      await supabase.from("gear_parts").delete().eq("gear_id", id);
      await supabase.from("maintenance_logs").delete().eq("gear_id", id);
      const { error } = await supabase.from("gear").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from the garage");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={<span className="text-foreground">Gear <span className="text-orange-500">Garage</span></span>}
        subtitle="Fleet, components, crash counters and service health."
        action={
          <Dialog open={gearOpen} onOpenChange={setGearOpen}>
            <DialogTrigger asChild>
              <Button className="bg-orange-500 hover:bg-orange-600 text-white font-medium">
                <Plus className="mr-1 h-4 w-4" /> Add gear
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span> Add gear
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gname">Name</Label>
                  <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Source One v5 or TX16S" />
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
                          {TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Radiomaster, DJI, TBS" />
                </div>
                <div className="space-y-2">
                  <Label>Maintenance Schedule</Label>
                  <Select value={serviceMode} onValueChange={(v) => setServiceMode(v as "interval" | "needed")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interval">Custom service interval (minutes)</SelectItem>
                      <SelectItem value="needed">Service as needed (no fixed schedule)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {serviceMode === "interval" && (
                  <div className="space-y-2">
                    <Label htmlFor="interval">Service interval (minutes)</Label>
                    <Input
                      id="interval"
                      type="number"
                      value={interval}
                      onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => addGear.mutate()} disabled={!name} className="bg-orange-500 hover:bg-orange-600 text-white">
                  Add to garage
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {gear.length === 0 && (
        <div className="hud-panel p-8 text-center text-sm text-muted-foreground border-orange-500/20">
          Your garage is empty. Add your first quad, radio or goggles.
        </div>
      )}

      {GEAR_GROUPS.map((group) => {
        const items = gear.filter((g) => group.types.includes(g.gear_type as GearType));
        if (items.length === 0) return null;
        return (
          <section key={group.key} className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-orange-400">
                {group.title}
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((g) => {
                const isAsNeeded = g.service_interval_minutes >= 900000;
                const isQuad = g.gear_type === "quad";
                const isTransmitter = g.gear_type === "transmitter";
                const isGoggles = g.gear_type === "goggles";

                const servicePct = isAsNeeded ? 0 : Math.min(
                  100,
                  Math.round((g.minutes_since_service / Math.max(g.service_interval_minutes, 1)) * 100),
                );
                const gParts = parts.filter((p) => p.gear_id === g.id);
                const gLogs = logs.filter((l) => l.gear_id === g.id).slice(0, 3);

                return (
                  <div key={g.id} className="hud-panel p-5 relative overflow-hidden group hover:border-orange-500/40 transition-colors">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full pointer-events-none" />
                    
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold tracking-tight">{g.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {g.brand ? <span className="text-orange-400 font-medium">{g.brand}</span> : ""}
                          {g.brand ? " · " : ""}
                          {TYPE_LABELS[g.gear_type as GearType]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAsNeeded ? (
                          <Badge variant="outline" className="border-orange-500/30 text-orange-400">Service as needed</Badge>
                        ) : (
                          <Badge variant={servicePct >= 100 ? "destructive" : "secondary"}>
                            {servicePct >= 100 ? "Service due" : `${servicePct}% to service`}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${g.name}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove "${g.name}" from your garage? Its components and maintenance history will be deleted.`,
                              )
                            ) {
                              removeGear.mutate(g.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className={`mt-4 grid gap-3 text-center ${isQuad ? "grid-cols-3" : "grid-cols-1"}`}>
                      <div>
                        <p className="label-mono">Airtime</p>
                        <p className="font-mono text-sm text-orange-300 font-medium">{formatHours(g.total_minutes)}</p>
                      </div>
                      {isQuad && (
                        <>
                          <div>
                            <p className="label-mono">Packs</p>
                            <p className="font-mono text-sm">{g.pack_count}</p>
                          </div>
                          <div>
                            <p className="label-mono">Crashes</p>
                            <p className="font-mono text-sm text-red-400 font-medium">{g.crash_count}</p>
                          </div>
                        </>
                      )}
                    </div>

                    {!isAsNeeded && <Progress value={servicePct} className="mt-4" />}

                    {/* Components section for Quads and Controllers (Transmitter), but NOT Goggles */}
                    {!isGoggles && (
                      <div className="mt-5">
                        <div className="flex items-center justify-between">
                          <span className="label-mono text-orange-400">
                            {isTransmitter ? "Upgrades & Parts" : "Components"}
                          </span>
                          <Dialog
                            open={partOpen === g.id}
                            onOpenChange={(o) => {
                              setPartOpen(o ? g.id : null);
                              if (isTransmitter && o) {
                                setPartName("Stick Ends");
                                setPartDescription("");
                                setPartCategory("stickends");
                              } else if (!isTransmitter && o) {
                                setPartName("");
                                setPartCategory("motor");
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10">
                                <Plus className="mr-1 h-3 w-3" /> {isTransmitter ? "Add Upgrade" : "Part"}
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                  {isTransmitter ? "Add controller upgrade" : "Track a component"}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                {isTransmitter ? (
                                  <>
                                    <div className="space-y-2">
                                      <Label>Category</Label>
                                      <Select
                                        value={partCategory}
                                        onValueChange={(val) => {
                                          setPartCategory(val);
                                          const found = CONTROLLER_CATEGORIES.find((c) => c.value === val);
                                          if (found) setPartName(found.label);
                                        }}
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {CONTROLLER_CATEGORIES.map((cat) => (
                                            <SelectItem key={cat.value} value={cat.value}>
                                              <span className="text-orange-500 font-medium mr-1.5">▪</span>
                                              {cat.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="pname">Name</Label>
                                      <Input
                                        id="pname"
                                        value={partName}
                                        onChange={(e) => setPartName(e.target.value)}
                                        placeholder="e.g. Stick Ends"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="pdesc">Description</Label>
                                      <Input
                                        id="pdesc"
                                        value={partDescription}
                                        onChange={(e) => setPartDescription(e.target.value)}
                                        placeholder={
                                          CONTROLLER_CATEGORIES.find((c) => c.value === partCategory)?.placeholder ||
                                          "e.g. CNC Aluminum V2 Ends"
                                        }
                                      />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="space-y-2">
                                      <Label htmlFor="pname">Name</Label>
                                      <Input
                                        id="pname"
                                        value={partName}
                                        onChange={(e) => setPartName(e.target.value)}
                                        placeholder="e.g. Rear-left motor"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="pcat">Category</Label>
                                      <Input
                                        id="pcat"
                                        value={partCategory}
                                        onChange={(e) => setPartCategory(e.target.value)}
                                        placeholder="motor / prop / VTX"
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                              <DialogFooter>
                                <Button onClick={() => addPart.mutate(g.id)} disabled={!partName} className="bg-orange-500 hover:bg-orange-600 text-white">
                                  {isTransmitter ? "Save upgrade" : "Track part"}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>

                        {gParts.length === 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {isTransmitter ? "No stickends, gimbals or custom upgrades added yet." : "No components tracked yet."}
                          </p>
                        )}
                        <div className="mt-2 space-y-2">
                          {gParts.map((p) => {
                            const isTxPart = isTransmitter;
                            const health = isTxPart ? { pct: 100, status: "healthy" } : partHealth(p.minutes_used, p.lifespan_minutes);
                            return (
                              <div key={p.id} className="flex items-center gap-3 bg-secondary/30 p-2.5 rounded-md border border-orange-500/10">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    {isTxPart && (
                                      <Badge variant="outline" className="text-[10px] uppercase font-mono border-orange-500/30 text-orange-400">
                                        {p.category}
                                      </Badge>
                                    )}
                                    <span className="truncate text-sm font-medium">{p.name}</span>
                                    {!isTxPart && health.status !== "healthy" && (
                                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                                        {health.pct}%
                                      </span>
                                    )}
                                  </div>
                                  {!isTxPart && <Progress value={health.pct} className="mt-1 h-1.5" />}
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => removePart.mutate(p.id)} aria-label="Remove part" className="hover:text-red-400">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-5 flex items-center justify-between">
                      <span className="label-mono text-orange-400">Maintenance</span>
                      <Dialog open={logOpen === g.id} onOpenChange={(o) => setLogOpen(o ? g.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300">
                            <Wrench className="mr-1 h-3 w-3" /> Log service
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-orange-500"></span> Log maintenance
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="ldesc">What did you do?</Label>
                              <Input
                                id="ldesc"
                                value={logDesc}
                                onChange={(e) => setLogDesc(e.target.value)}
                                placeholder={isTransmitter ? "Calibrated gimbals or replaced stick ends" : "Cleaned frame or replaced arm"}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="lcost">Cost ($)</Label>
                              <Input id="lcost" type="number" value={logCost} onChange={(e) => setLogCost(e.target.value)} placeholder="0.00" />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button onClick={() => addLog.mutate(g.id)} disabled={!logDesc} className="bg-orange-500 hover:bg-orange-600 text-white">
                              Save & reset clock
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="mt-2 space-y-1">
                      {gLogs.map((l) => (
                        <p key={l.id} className="text-xs text-muted-foreground flex items-center justify-between">
                          <span><span className="font-mono text-orange-400">{l.performed_on}</span> — {l.description}</span>
                          {l.cost ? <span className="font-mono text-xs text-muted-foreground">${l.cost}</span> : null}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
