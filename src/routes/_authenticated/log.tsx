import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useMemo } from "react";
import { Plus, Trash2, Timer, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  DURATION_BLOCKS,
  SIM_PLATFORMS,
  formatHours,
  toDateKey,
  type SessionRow,
} from "@/lib/fpv";

export const Route = createFileRoute("/_authenticated/log")({
  head: () => ({
    meta: [
      { title: "Flight Logs — StickTime FPV" },
      { name: "description", content: "Log simulator and real-world FPV sessions in 5-minute blocks." },
      { property: "og:title", content: "Flight Logs — StickTime FPV" },
      {
        property: "og:description",
        content: "Log simulator and real-world FPV sessions in 5-minute blocks.",
      },
    ],
  }),
  component: LogPage,
});

function LogPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"sim" | "real">("real");
  const [activeTab, setActiveTab] = useState<"real" | "sim">("real");
  const prevTabRef = useRef<"real" | "sim">("real");
  const [flownOn, setFlownOn] = useState(toDateKey(new Date()));
  const [duration, setDuration] = useState(20);
  const [gearId, setGearId] = useState<string>("none");
  const [controllerId, setControllerId] = useState<string>("none");
  const [gogglesId, setGogglesId] = useState<string>("none");
  const [platform, setPlatform] = useState<string>(SIM_PLATFORMS[0]!);
  const [packs, setPacks] = useState(0);
  const [crashes, setCrashes] = useState(0);
  const [batteryNotes, setBatteryNotes] = useState("");
  const [notes, setNotes] = useState("");

  const { data } = useQuery({
    queryKey: ["log-data"],
    queryFn: async () => {
      const [sessions, gear] = await Promise.all([
        supabase.from("sessions").select("*").order("flown_on", { ascending: false }).limit(400),
        supabase.from("gear").select("id,name,gear_type,brand,total_minutes,minutes_since_service,pack_count,crash_count"),
      ]);
      return {
        sessions: (sessions.data ?? []) as unknown as SessionRow[],
        gear: gear.data ?? [],
      };
    },
  });

  const [localSessions, setLocalSessions] = useState<SessionRow[] | null>(null);

  const sessions = useMemo(() => {
    if (localSessions !== null) return localSessions;
    return data?.sessions ?? [];
  }, [localSessions, data?.sessions]);

  const gear = data?.gear ?? [];
  const drones = gear.filter((g) => g.gear_type === "quad");
  const controllers = gear.filter(
    (g) =>
      g.gear_type === "transmitter" ||
      g.gear_type.toLowerCase() === "controller" ||
      g.gear_type.toLowerCase().includes("trans")
  );
  const gogglesList = gear.filter(
    (g) =>
      g.gear_type === "goggles" ||
      g.gear_type.toLowerCase().includes("goggle") ||
      g.gear_type.toLowerCase().includes("box")
  );

  const handleTabChange = (newTab: "real" | "sim") => {
    if (newTab === activeTab) return;
    prevTabRef.current = activeTab;
    setActiveTab(newTab);
    navigate({ to: "/_authenticated/log", search: { tab: newTab }, replace: true }).catch(() => {});
  };

  const createSession = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const newRow: Partial<SessionRow> = {
        id: `local-${Date.now()}`,
        user_id: uid,
        session_type: type,
        flown_on: flownOn,
        duration_minutes: duration,
        gear_id: type === "real" && gearId !== "none" ? gearId : null,
        controller_id: controllerId !== "none" ? controllerId : null,
        goggles_id: gogglesId !== "none" ? gogglesId : null,
        location_id: null,
        track_id: null,
        sim_platform: type === "sim" ? platform : null,
        packs_flown: type === "real" ? packs : 0,
        crashes,
        battery_notes: batteryNotes || null,
        weather: null,
        notes: notes || null,
        created_at: new Date().toISOString(),
      };

      const currentList = localSessions ?? data?.sessions ?? [];
      setLocalSessions([newRow as SessionRow, ...currentList]);

      const { error } = await supabase.from("sessions").insert({
        user_id: uid,
        session_type: type,
        flown_on: flownOn,
        duration_minutes: duration,
        gear_id: type === "real" && gearId !== "none" ? gearId : null,
        controller_id: controllerId !== "none" ? controllerId : null,
        goggles_id: gogglesId !== "none" ? gogglesId : null,
        location_id: null,
        track_id: null,
        sim_platform: type === "sim" ? platform : null,
        packs_flown: type === "real" ? packs : 0,
        crashes,
        battery_notes: batteryNotes || null,
        weather: null,
        notes: notes || null,
      });
      if (error) throw error;

      if (type === "real" && gearId !== "none") {
        const rig = gear.find((g) => g.id === gearId);
        if (rig) {
          await supabase
            .from("gear")
            .update({
              total_minutes: rig.total_minutes + duration,
              minutes_since_service: rig.minutes_since_service + duration,
              pack_count: rig.pack_count + packs,
              crash_count: rig.crash_count + crashes,
            })
            .eq("id", gearId);
        }
      }

      if (controllerId !== "none") {
        const ctrl = gear.find((g) => g.id === controllerId);
        if (ctrl) {
          await supabase
            .from("gear")
            .update({
              total_minutes: ctrl.total_minutes + duration,
            })
            .eq("id", controllerId);
        }
      }

      if (gogglesId !== "none") {
        const gog = gear.find((g) => g.id === gogglesId);
        if (gog) {
          await supabase
            .from("gear")
            .update({
              total_minutes: gog.total_minutes + duration,
            })
            .eq("id", gogglesId);
        }
      }
    },
    onSuccess: () => {
      setOpen(false);
      setActiveTab(type);
      setNotes("");
      setBatteryNotes("");
      setPacks(0);
      setCrashes(0);
      queryClient.invalidateQueries({ queryKey: ["log-data"] });
      setTimeout(() => setLocalSessions(null), 500);
    },
    onError: (e: Error) => {
      setLocalSessions(null);
      import("sonner").then(({ toast }) => toast.error(e.message));
    },
  });

  const removeSession = useMutation({
    mutationFn: async (id: string) => {
      const currentList = localSessions ?? data?.sessions ?? [];
      setLocalSessions(currentList.filter((s) => s.id !== id));

      const sessionToDelete = sessions.find((s) => s.id === id);
      if (sessionToDelete && !id.startsWith("local-")) {
        const dur = sessionToDelete.duration_minutes;
        const packsFlown = sessionToDelete.packs_flown || 0;
        const crashesCount = sessionToDelete.crashes || 0;

        if (sessionToDelete.gear_id) {
          const rig = gear.find((g) => g.id === sessionToDelete.gear_id);
          if (rig) {
            await supabase
              .from("gear")
              .update({
                total_minutes: Math.max(0, rig.total_minutes - dur),
                minutes_since_service: Math.max(0, rig.minutes_since_service - dur),
                pack_count: Math.max(0, rig.pack_count - packsFlown),
                crash_count: Math.max(0, rig.crash_count - crashesCount),
              })
              .eq("id", sessionToDelete.gear_id);
          }
        }

        if (sessionToDelete.controller_id) {
          const ctrl = gear.find((g) => g.id === sessionToDelete.controller_id);
          if (ctrl) {
            await supabase
              .from("gear")
              .update({
                total_minutes: Math.max(0, ctrl.total_minutes - dur),
              })
              .eq("id", sessionToDelete.controller_id);
          }
        }

        if (sessionToDelete.goggles_id) {
          const gog = gear.find((g) => g.id === sessionToDelete.goggles_id);
          if (gog) {
            await supabase
              .from("gear")
              .update({
                total_minutes: Math.max(0, gog.total_minutes - dur),
              })
              .eq("id", sessionToDelete.goggles_id);
          }
        }

        const { error } = await supabase.from("sessions").delete().eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["log-data"] });
      setTimeout(() => setLocalSessions(null), 500);
    },
    onError: (e: Error) => {
      setLocalSessions(null);
      import("sonner").then(({ toast }) => toast.error(e.message));
    },
  });

  function renderListContent(kind: "sim" | "real") {
    const rows = sessions.filter((s) => s.session_type === kind);
    const total = rows.reduce((a, s) => a + s.duration_minutes, 0);
    const isSim = kind === "sim";

    return (
      <div className="hud-panel divide-y divide-border overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-muted/40">
          <div className="flex items-center gap-2">
            {isSim ? <Monitor className="h-4 w-4 text-sim" /> : <Timer className="h-4 w-4 text-primary" />}
            <span className="label-mono font-semibold">{isSim ? "Simulator" : "Real world"} flight log</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-primary">{formatHours(total)}</span>
          </div>
        </div>
        {rows.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No sessions yet. Log your first block.</p>
        )}
        {rows.map((s) => {
          const associatedController = gear.find((g) => g.id === s.controller_id);
          const associatedGoggles = gear.find((g) => g.id === s.goggles_id);
          return (
            <div key={s.id} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/20 transition-colors">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{s.flown_on}</span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {s.duration_minutes} min
                  </Badge>
                  {s.sim_platform && <Badge variant="outline">{s.sim_platform}</Badge>}
                  {associatedController && (
                    <Badge variant="outline" className="border-orange-500/30 text-orange-400">
                      Radio: {associatedController.name}
                    </Badge>
                  )}
                  {associatedGoggles && (
                    <Badge variant="outline" className="border-cyan-500/30 text-cyan-400">
                      Goggles: {associatedGoggles.name}
                    </Badge>
                  )}
                  {s.packs_flown > 0 && <Badge variant="outline">{s.packs_flown} packs</Badge>}
                  {s.crashes > 0 && <Badge variant="outline">{s.crashes} crashes</Badge>}
                </div>
                {s.notes && <p className="mt-1 truncate text-sm text-muted-foreground">{s.notes}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeSession.mutate(s.id)}
                aria-label="Delete session"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
    );
  }

  const goingRight = activeTab === "sim";

  return (
    <div>
      <PageHeader
        title="Flight Logs"
        subtitle="Manual entry in 5-minute blocks — sim and real world tracked separately."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Log session
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New session</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={type === "real" ? "default" : "outline"}
                    onClick={() => setType("real")}
                  >
                    <Timer className="mr-1 h-4 w-4" /> Real world
                  </Button>
                  <Button
                    type="button"
                    variant={type === "sim" ? "default" : "outline"}
                    onClick={() => setType("sim")}
                  >
                    <Monitor className="mr-1 h-4 w-4" /> Simulator
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={flownOn}
                      onChange={(e) => setFlownOn(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select
                      value={String(duration)}
                      onValueChange={(v) => setDuration(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {DURATION_BLOCKS.map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {m} min
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {type === "sim" ? (
                  <div className="space-y-2">
                    <Label>Simulator</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SIM_PLATFORMS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Drone</Label>
                    <Select value={gearId} onValueChange={setGearId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a drone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No drone</SelectItem>
                        {drones.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {drones.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Add a drone in the garage to track airtime per airframe.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Radio Controller</Label>
                    <Select value={controllerId} onValueChange={setControllerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a controller" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {controllers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Goggles</Label>
                    <Select value={gogglesId} onValueChange={setGogglesId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick goggles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {gogglesList.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {type === "real" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="packs">Packs Flown</Label>
                      <Input
                        id="packs"
                        type="number"
                        min={0}
                        value={packs}
                        onChange={(e) => setPacks(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="crashes">Crashes</Label>
                      <Input
                        id="crashes"
                        type="number"
                        min={0}
                        value={crashes}
                        onChange={(e) => setCrashes(Number(e.target.value))}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="How did it fly? Any tuning notes?"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <DialogFooter>
                  <Button onClick={() => createSession.mutate()} disabled={createSession.isPending}>
                    Save Session
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mt-6 flex flex-col gap-4">
        <div className="hud-panel p-1.5 flex max-w-sm relative">
          <div
            className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-primary/20 border border-primary/40 rounded-md transition-transform duration-300 ease-out ${
              activeTab === "sim" ? "translate-x-[calc(100%+6px)]" : "translate-x-0"
            }`}
          />
          <button
            type="button"
            onClick={() => handleTabChange("real")}
            className={`flex-1 relative z-10 py-2.5 px-4 text-xs font-mono font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2 ${
              activeTab === "real" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Timer className="h-4 w-4" /> Real World
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("sim")}
            className={`flex-1 relative z-10 py-2.5 px-4 text-xs font-mono font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2 ${
              activeTab === "sim" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Monitor className="h-4 w-4" /> Simulator
          </button>
        </div>

        <div className="overflow-hidden relative w-full">
          <div
            key={activeTab}
            className={`w-full ${
              goingRight ? "animate-pure-slide-right" : "animate-pure-slide-left"
            }`}
          >
            {renderListContent(activeTab)}
          </div>
        </div>
      </div>
    </div>
  );
}
