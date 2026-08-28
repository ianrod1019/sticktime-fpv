import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, MapPin, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { SIM_PLATFORMS } from "@/lib/fpv";

export const Route = createFileRoute("/_authenticated/spots")({
  head: () => ({
    meta: [
      { title: "Spots & tracks — StickTime FPV" },
      {
        name: "description",
        content: "Map your flying locations and the tracks or sim scenarios you fly there.",
      },
      { property: "og:title", content: "Spots & tracks — StickTime FPV" },
      {
        property: "og:description",
        content: "Map your flying locations and the tracks or sim scenarios you fly there.",
      },
    ],
  }),
  component: Spots,
});

function Spots() {
  const queryClient = useQueryClient();
  const [locOpen, setLocOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locNotes, setLocNotes] = useState("");

  const [trackOpen, setTrackOpen] = useState(false);
  const [tName, setTName] = useState("");
  const [tKind, setTKind] = useState<"real" | "sim">("real");
  const [tLocation, setTLocation] = useState("none");
  const [tPlatform, setTPlatform] = useState(SIM_PLATFORMS[0]!);
  const [tNotes, setTNotes] = useState("");

  const { data } = useQuery({
    queryKey: ["spots"],
    queryFn: async () => {
      const [locations, tracks] = await Promise.all([
        supabase.from("locations").select("*").order("name"),
        supabase.from("tracks").select("*").order("name"),
      ]);
      return { locations: locations.data ?? [], tracks: tracks.data ?? [] };
    },
  });

  const locations = data?.locations ?? [];
  const tracks = data?.tracks ?? [];

  const addLocation = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("locations").insert({
        user_id: u.user!.id,
        name,
        city: city || null,
        country: country || null,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,
        notes: locNotes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Spot saved");
      setLocOpen(false);
      setName("");
      setCity("");
      setCountry("");
      setLat("");
      setLng("");
      setLocNotes("");
      queryClient.invalidateQueries({ queryKey: ["spots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTrack = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("tracks").insert({
        user_id: u.user!.id,
        name: tName,
        kind: tKind,
        location_id: tKind === "real" && tLocation !== "none" ? tLocation : null,
        sim_platform: tKind === "sim" ? tPlatform : null,
        layout_notes: tNotes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Track saved");
      setTrackOpen(false);
      setTName("");
      setTNotes("");
      queryClient.invalidateQueries({ queryKey: ["spots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeLocation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spots"] }),
  });

  const removeTrack = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tracks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spots"] }),
  });

  return (
    <>
      <PageHeader
        title="Spots & tracks"
        subtitle="Locations are physical places. Tracks are the layouts and scenarios you fly on them."
      />

      <Tabs defaultValue="locations">
        <TabsList>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="tracks">Tracks & scenarios</TabsTrigger>
        </TabsList>

        <TabsContent value="locations" className="mt-4 space-y-4">
          <Dialog open={locOpen} onOpenChange={setLocOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Add location
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New location</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lname">Name</Label>
                  <Input id="lname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Old quarry bando" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="lcity">City</Label>
                    <Input id="lcity" value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lcountry">Country</Label>
                    <Input id="lcountry" value={country} onChange={(e) => setCountry(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="llat">Latitude</Label>
                    <Input id="llat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="41.8781" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="llng">Longitude</Label>
                    <Input id="llng" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-87.6298" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lnotes">Notes</Label>
                  <Textarea id="lnotes" value={locNotes} onChange={(e) => setLocNotes(e.target.value)} placeholder="Permission needed, no flying before 9am" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => addLocation.mutate()} disabled={!name}>
                  Save spot
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {locations.map((l) => (
              <div key={l.id} className="hud-panel p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <MapPin className="h-4 w-4 text-primary" />
                      {l.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {[l.city, l.country].filter(Boolean).join(", ") || "No region set"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeLocation.mutate(l.id)} aria-label="Delete location">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {l.latitude && l.longitude && (
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {Number(l.latitude).toFixed(4)}, {Number(l.longitude).toFixed(4)}
                  </p>
                )}
                {l.notes && <p className="mt-2 text-sm text-muted-foreground">{l.notes}</p>}
                <p className="mt-3 label-mono">
                  {tracks.filter((t) => t.location_id === l.id).length} tracks
                </p>
              </div>
            ))}
            {locations.length === 0 && (
              <p className="text-sm text-muted-foreground">No spots yet.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tracks" className="mt-4 space-y-4">
          <Dialog open={trackOpen} onOpenChange={setTrackOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Add track
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New track or scenario</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tname">Name</Label>
                  <Input id="tname" value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Figure 8 gates" />
                </div>
                <div className="space-y-2">
                  <Label>Kind</Label>
                  <Select value={tKind} onValueChange={(v) => setTKind(v as "real" | "sim")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="real">Real world</SelectItem>
                      <SelectItem value="sim">Simulator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {tKind === "real" ? (
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Select value={tLocation} onValueChange={setTLocation}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Simulator</Label>
                    <Select value={tPlatform} onValueChange={setTPlatform}>
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
                )}
                <div className="space-y-2">
                  <Label htmlFor="tnotes">Layout notes</Label>
                  <Textarea id="tnotes" value={tNotes} onChange={(e) => setTNotes(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => addTrack.mutate()} disabled={!tName}>
                  Save track
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tracks.map((t) => (
              <div key={t.id} className="hud-panel p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold">{t.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="secondary">{t.kind === "sim" ? "Simulator" : "Real world"}</Badge>
                      {t.sim_platform && <Badge variant="outline">{t.sim_platform}</Badge>}
                      {t.location_id && (
                        <Badge variant="outline">
                          {locations.find((l) => l.id === t.location_id)?.name ?? "Spot"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeTrack.mutate(t.id)} aria-label="Delete track">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {t.layout_notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{t.layout_notes}</p>
                )}
              </div>
            ))}
            {tracks.length === 0 && <p className="text-sm text-muted-foreground">No tracks yet.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
