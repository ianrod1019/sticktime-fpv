import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Cpu, Radio, Glasses, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GearCard } from "@/components/gear-card";

export const Route = createFileRoute("/_authenticated/garage")({
  head: () => ({
    meta: [
      { title: "Garage — StickTime FPV" },
      { name: "description", content: "Track your quads, radios, goggles, battery sets and other gear with maintenance health alerts." },
      { property: "og:title", content: "Garage — StickTime FPV" },
      {
        property: "og:description",
        content: "Track your quads, radios, goggles, battery sets and other gear with maintenance health alerts.",
      },
    ],
  }),
  component: Garage,
});

const GEAR_TYPES = ["quad", "transmitter", "goggles", "battery", "other"] as const;
type GearType = (typeof GEAR_TYPES)[number];

const TYPE_LABELS: Record<GearType, string> = {
  quad: "Drone / Quad",
  transmitter: "Controller / Radio",
  goggles: "Goggles",
  battery: "Battery Set",
  other: "Other Gear",
};

const GEAR_SECTIONS: {
  key: GearType;
  title: string;
  blurb: string;
  icon: typeof Cpu;
}[] = [
  {
    key: "quad",
    title: "Drones & Quads",
    blurb: "Airframes that accumulate flight time, crash counters and component wear.",
    icon: Cpu,
  },
  {
    key: "transmitter",
    title: "Controllers & Radios",
    blurb: "Transmitters you pick when logging sessions, with stick ends and gimbal upgrade trackers.",
    icon: Radio,
  },
  {
    key: "goggles",
    title: "FPV Goggles",
    blurb: "Video headsets, analog modules and digital HD receivers.",
    icon: Glasses,
  },
  {
    key: "battery",
    title: "Battery Sets",
    blurb: "LiPo / Li-Ion battery sets, pack counts, storage voltages and individual pack management.",
    icon: BatteryChargingRef,
  },
  {
    key: "other",
    title: "Other Equipment",
    blurb: "Chargers, soldering stations, tools, backpack gear and field accessories.",
    icon: ShieldAlert,
  },
];

function BatteryChargingRef(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
      <path d="M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1" />
      <line x1="22" x2="22" y1="11" y2="13" />
      <polygon points="11 6 7 12 13 12 9 18" />
    </svg>
  );
}

function Garage() {
  const queryClient = useQueryClient();
  const [gearOpen, setGearOpen] = useState(false);
  const [name, setName] = useState("");
  const [gearType, setGearType] = useState<GearType>("quad");
  const [brand, setBrand] = useState("");
  const [serviceMode, setServiceMode] = useState<"interval" | "needed">("interval");
  const [interval, setIntervalMinutes] = useState(600);
  const [packCount, setPackCount] = useState(4); // For battery sets

  // ID of the gear currently hovered over the delete button or undergoing deletion
  const [hoveredDeleteGearId, setHoveredDeleteGearId] = useState<string | null>(null);
  const [deletingGearId, setDeletingGearId] = useState<string | null>(null);

  // Track collapsed state per main gear section key
  const [collapsedSections, setCollapsedSections] = useState<Record<GearType, boolean>>({
    quad: false,
    transmitter: false,
    goggles: false,
    battery: false,
    other: false,
  });

  const toggleSectionCollapse = (key: GearType) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
      const isBatt = gearType === "battery";
      const finalInterval = isBatt || serviceMode === "needed" ? 0 : interval;
      const finalPackCount = isBatt ? packCount : 0;

      const { error } = await supabase.from("gear").insert({
        user_id: u.user!.id,
        name,
        gear_type: gearType,
        brand: brand || null,
        service_interval_minutes: finalInterval,
        pack_count: finalPackCount,
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
      setPackCount(4);
      queryClient.invalidateQueries({ queryKey: ["garage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateGear = useMutation({
    mutationFn: async ({
      gearId,
      name,
      brand,
      serviceInterval,
      packCount,
    }: {
      gearId: string;
      name: string;
      brand: string;
      serviceInterval: number;
      packCount: number;
    }) => {
      const { error } = await supabase
        .from("gear")
        .update({
          name,
          brand: brand || null,
          service_interval_minutes: serviceInterval,
          pack_count: packCount,
        })
        .eq("id", gearId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gear updated successfully");
      queryClient.invalidateQueries({ queryKey: ["garage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePackCount = useMutation({
    mutationFn: async ({ gearId, newCount }: { gearId: string; newCount: number }) => {
      const { error } = await supabase.from("gear").update({ pack_count: newCount }).eq("id", gearId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Battery set updated");
      queryClient.invalidateQueries({ queryKey: ["garage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPart = useMutation({
    mutationFn: async ({
      gearId,
      partName,
      category,
      description,
    }: {
      gearId: string;
      partName: string;
      category: string;
      description: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const targetGear = gear.find((g) => g.id === gearId);
      const isTransmitter = targetGear?.gear_type === "transmitter";
      const isGoggles = targetGear?.gear_type === "goggles";

      const finalName =
        (isTransmitter || isGoggles) && description ? `${partName}: ${description}` : partName;

      const { error } = await supabase.from("gear_parts").insert({
        user_id: u.user!.id,
        gear_id: gearId,
        name: finalName,
        category: isTransmitter || isGoggles ? category : "motor",
        lifespan_minutes: isTransmitter || isGoggles ? 0 : 600,
        spare_count: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Component saved");
      queryClient.invalidateQueries({ queryKey: ["garage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLog = useMutation({
    mutationFn: async ({
      gearId,
      description,
      cost,
    }: {
      gearId: string;
      description: string;
      cost: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("maintenance_logs").insert({
        user_id: u.user!.id,
        gear_id: gearId,
        description,
        cost: cost ? Number(cost) : null,
        reset_service_clock: true,
      });
      if (error) throw error;
      await supabase.from("gear").update({ minutes_since_service: 0 }).eq("id", gearId);
    },
    onSuccess: () => {
      toast.success("Maintenance logged, service clock reset");
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

  const removeLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("maintenance_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["garage"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
      setDeletingGearId(null);
      setHoveredDeleteGearId(null);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => {
      setDeletingGearId(null);
      setHoveredDeleteGearId(null);
      toast.error(e.message);
    },
  });

  const handleDeleteClick = (id: string, _gearName: string) => {
    setDeletingGearId(id);
    setHoveredDeleteGearId(id);
    setTimeout(() => {
      removeGear.mutate(id);
    }, 600);
  };

  return (
    <>
      <style>{`
        @keyframes ultraSubtleShake {
          0% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-0.3px, 0.2px) rotate(-0.08deg); }
          50% { transform: translate(0.3px, -0.2px) rotate(0.08deg); }
          75% { transform: translate(-0.2px, -0.15px) rotate(-0.04deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        .animate-subtle-shake {
          animation: ultraSubtleShake 0.5s ease-in-out infinite;
        }
      `}</style>

      <PageHeader
        title={
          <span className="text-foreground">
            Gear <span className="text-orange-500">Garage</span>
          </span>
        }
        subtitle="Manage your complete fleet across quads, transmitters, goggles, battery sets and equipment."
        action={
          <Dialog open={gearOpen} onOpenChange={setGearOpen}>
            <DialogTrigger asChild>
              <Button className="bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-lg shadow-orange-500/20">
                <Plus className="mr-1.5 h-4 w-4" /> Add gear
              </Button>
            </DialogTrigger>
            <DialogContent className="border-orange-500/30 bg-background/95 backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-foreground font-display">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span> Add equipment to garage
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="gname">Name</Label>
                  <Input
                    id="gname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      gearType === "battery"
                        ? "e.g. CNHL Black Series 6S 1300mAh"
                        : "e.g. Source One v5, TX16S, DJI V2"
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category / Type</Label>
                  <Select value={gearType} onValueChange={(v) => setGearType(v as GearType)}>
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
                  <Label htmlFor="brand">Brand / Manufacturer</Label>
                  <Input
                    id="brand"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. CNHL, Tattu, Radiomaster, DJI, TBS"
                  />
                </div>

                {gearType === "battery" ? (
                  <div className="space-y-2">
                    <Label htmlFor="packCount">Packs in this Battery Set</Label>
                    <Input
                      id="packCount"
                      type="number"
                      min={1}
                      max={20}
                      value={packCount}
                      onChange={(e) => setPackCount(Number(e.target.value))}
                      placeholder="e.g. 4"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Number of identical LiPo/Li-Ion packs grouped in this battery set. You can add or remove individual packs later.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Maintenance Schedule</Label>
                      <Select
                        value={serviceMode}
                        onValueChange={(v) => setServiceMode(v as "interval" | "needed")}
                      >
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
                  </>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addGear.mutate()}
                  disabled={!name}
                  className="bg-orange-500 hover:bg-orange-600 text-white w-full sm:w-auto"
                >
                  Add to garage
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {gear.length === 0 && (
        <div className="hud-panel p-12 text-center text-sm text-muted-foreground border-orange-500/20 max-w-xl mx-auto my-12">
          <div className="w-12 h-12 rounded-full bg-orange-500/10 text-orange-400 flex items-center justify-center mx-auto mb-4 border border-orange-500/20">
            <Cpu className="h-6 w-6" />
          </div>
          <p className="font-display font-semibold text-foreground text-lg mb-1">
            Your garage is currently empty.
          </p>
          <p className="mb-6 text-xs text-muted-foreground">
            Register your quads, radio transmitters, FPV goggles, battery sets or field gear to track
            telemetry, airtime, and maintenance intervals.
          </p>
          <Button onClick={() => setGearOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="mr-1.5 h-4 w-4" /> Add your first piece of gear
          </Button>
        </div>
      )}

      <div className="space-y-12 pb-16">
        {GEAR_SECTIONS.map((section) => {
          const items = gear.filter((g) => g.gear_type === section.key);
          const IconComponent = section.icon;
          const isSectionCollapsed = !!collapsedSections[section.key];

          return (
            <section key={section.key} className="space-y-4">
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-orange-500/20 pb-3 cursor-pointer select-none group pt-2"
                onClick={() => toggleSectionCollapse(section.key)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-sm group-hover:bg-orange-500/20 transition-colors">
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="font-display text-base font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                        {section.title}
                        <span className="text-orange-400">
                          {isSectionCollapsed ? (
                            <ChevronDown className="h-4 w-4 inline" />
                          ) : (
                            <ChevronUp className="h-4 w-4 inline" />
                          )}
                        </span>
                      </h2>
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-orange-500/10 text-orange-400 border border-orange-500/20 font-semibold">
                        {items.length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{section.blurb}</p>
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGearType(section.key);
                      setGearOpen(true);
                    }}
                    className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 text-xs self-start sm:self-auto font-medium"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add {TYPE_LABELS[section.key].toLowerCase()}
                  </Button>
                </div>
              </div>

              <div
                style={{
                  transition:
                    "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), margin-bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  overflow: "hidden",
                  maxHeight: isSectionCollapsed ? "0px" : "2000px",
                  opacity: isSectionCollapsed ? 0 : 1,
                  marginBottom: isSectionCollapsed ? "0px" : "16px",
                }}
              >
                {items.length === 0 ? (
                  <div className="hud-panel p-8 text-center text-xs text-muted-foreground/70 border-dashed border-orange-500/20 bg-card/20 rounded-xl my-2">
                    No {TYPE_LABELS[section.key].toLowerCase()} registered yet. Click the button above
                    to add your equipment.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2 pb-2">
                    {items.map((g) => {
                      const gParts = parts.filter((p) => p.gear_id === g.id);
                      const gLogs = logs.filter((l) => l.gear_id === g.id);

                      return (
                        <GearCard
                          key={g.id}
                          gear={g}
                          parts={gParts}
                          logs={gLogs}
                          onDeleteGear={handleDeleteClick}
                          onUpdateGear={(gearId, name, brand, serviceInterval, packCount) =>
                            updateGear.mutate({ gearId, name, brand, serviceInterval, packCount })
                          }
                          onUpdatePackCount={(gearId, newCount) =>
                            updatePackCount.mutate({ gearId, newCount })
                          }
                          onAddPart={(gearId, partName, category, description) =>
                            addPart.mutate({ gearId, partName, category, description })
                          }
                          onRemovePart={(partId) => removePart.mutate(partId)}
                          onAddLog={(gearId, description, cost) =>
                            addLog.mutate({ gearId, description, cost })
                          }
                          onRemoveLog={(logId) => removeLog.mutate(logId)}
                          isDeleting={deletingGearId === g.id}
                          isHoveredDelete={hoveredDeleteGearId === g.id}
                          onHoverDelete={(id) => setHoveredDeleteGearId(id)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
