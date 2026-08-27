import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, CloudSun, Timer, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  fetchWeather,
  toDateKey,
  type SessionRow,
} from "@/lib/fpv";

export const Route = createFileRoute("/_authenticated/log")({
  head: () => ({
    meta: [
      { title: "Timecards — StickTime FPV" },
      { name: "description", content: "Log simulator and real-world FPV sessions in 5-minute blocks." },
      { property: "og:title", content: "Timecards — StickTime FPV" },
      {
        property: "og:description",
        content: "Log simulator and real-world FPV sessions in 5-minute blocks.",
      },
    ],
  }),
  component: LogPage,
});

type Weather = { temperature_2m: number; wind_speed_10m: number; wind_gusts_10m: number } | null;

function LogPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"sim" | "real">("real");
  const [flownOn, setFlownOn] = useState(toDateKey(new Date()));
  const [duration, setDuration] = useState(20);
  const [gearId, setGearId] = useState<string>("none");
  const [locationId, setLocationId] = useState<string>("none");
  const [trackId, setTrackId] = useState<string>("none");
  const [platform, setPlatform] = useState<string>(SIM_PLATFORMS[0]!);
  const [packs, setPacks] = useState(0);
  const [crashes, setCrashes] = useState(0);
  const [batteryNotes, setBatteryNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [weather, setWeather] = useState<Weather>(null);

  const { data } = useQuery({
    queryKey: ["log-data"],
    queryFn: async () => {
      const [sessions, gear, locations, tracks] = await Promise.all([
        supabase.from("sessions").select("*").order("flown_on", { ascending: false }).limit(400),
        supabase.from("gear").select("id,name,gear_type,total_minutes,minutes_since_service,pack_count,crash_count").eq("retired", false),
        supabase.from("locations").select("id,name,latitude,longitude"),
        supabase.from("tracks").select("id,name,kind,location_id"),
      ]);
      return {
        sessions: (sessions.data ?? []) as unknown as SessionRow[],
        gear: gear.data ?? [],
        locations: locations.data ?? [],
        tracks: tracks.data ?? [],
      };
    },
  });

  const sessions = data?.sessions ?? [];
  const gear = data?.gear ?? [];
  const locations = data?.locations ?? [];
  const tracks = (data?.tracks ?? []).filter((t) => t.kind === type);

  const createSession = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const { error } = await supabase.from("sessions").insert({
        user_id: uid,
        session_type: type,
        flown_on: flownOn,
        duration_minutes: duration,
        gear_id: type === "real" && gearId !== "none" ? gearId : null,
        location_id: type === "real" && locationId !== "none" ? locationId : null,
        track_id: trackId !== "none" ? trackId : null,
        sim_platform: type === "sim" ? platform : null,
        packs_flown: type === "real" ? packs : 0,
        crashes,
        battery_notes: batteryNotes || null,
        weather: weather ? (weather as unknown as Record<string, number>) : null,
        notes: notes || null,
      });
      if (error) throw error;

      // Roll gear counters and the maintenance clock forward.
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
    },
    onSuccess: () => {
      toast.success("Session logged");
      setOpen(false);
      setNotes("");
      setBatteryNotes("");
      setPacks(0);
      setCrashes(0);
      setWeather(null);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Session removed");
      queryClient.invalidateQueries();
    },
  });

  async function grabWeather() {
    const loc = locations.find((l) => l.id === locationId);
    if (!loc?.latitude || !loc?.longitude) {
      toast.error("Pick a location with coordinates first");
      return;
    }
    try {
      const current = await fetchWeather(Number(loc.latitude), Number(loc.longitude));
      setWeather(current as Weather);
      toast.success("Conditions archived");
    } catch {
      toast.error("Weather lookup failed");
    }
  }

  function renderList(kind: "sim" | "real") {
    const rows = sessions.filter((s) => s.session_type === kind);
    const total = rows.reduce((a, s) => a + s.duration_minutes, 0);
    return (
      <div className="hud-panel mt-4 divide-y divide-border">
        <div className="flex items-center justify-between p-4">
          <span className="label-mono">{kind === "sim" ? "Simulator" : "Real world"} timecard</span>
          <span className="font-mono text-sm text-primary">{formatHours(total)}</span>
        </div>
        {rows.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No sessions yet. Log your first block.</p>
        )}
        {rows.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{s.flown_on}</span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {s.duration_minutes} min
                </Badge>
                {s.sim_platform && <Badge variant="outline">{s.sim_platform}</Badge>}
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
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Timecard manager"
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
                  <>
                    <div className="space-y-2">
                      <Label>Rig</Label>
                      <Select value={gearId} onValueChange={setGearId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a rig" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No rig</SelectItem>
                          {gear.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Select value={locationId} onValueChange={setLocationId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a spot" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No location</SelectItem>
                          {locations.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="packs">Packs flown</Label>
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
                    <div className="space-y-2">
                      <Label htmlFor="batt">Battery health notes</Label>
                      <Input
                        id="batt"
                        placeholder="Pack 3 puffed, storage charged"
                        value={batteryNotes}
                        onChange={(e) => setBatteryNotes(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" size="sm" onClick={grabWeather}>
                        <CloudSun className="mr-1 h-4 w-4" /> Archive conditions
                      </Button>
                      {weather && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {weather.temperature_2m}°C · {weather.wind_speed_10m} km/h (gust{" "}
                          {weather.wind_gusts_10m})
                        </span>
                      )}
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Track / scenario</Label>
                  <Select value={trackId} onValueChange={setTrackId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a track" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No track</SelectItem>
                      {tracks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Dialled in the split-S line..."
                  />
                </div>
              </div>

              <DialogFooter>
                <Button onClick={() => createSession.mutate()} disabled={createSession.isPending}>
                  Save session
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs defaultValue="real">
        <TabsList>
          <TabsTrigger value="real">Real world</TabsTrigger>
          <TabsTrigger value="sim">Simulator</TabsTrigger>
        </TabsList>
        <TabsContent value="real">{renderList("real")}</TabsContent>
        <TabsContent value="sim">{renderList("sim")}</TabsContent>
      </Tabs>
    </>
  );
}
