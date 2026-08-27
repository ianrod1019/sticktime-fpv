import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Route as RouteIcon } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/spots")({
  head: () => ({ meta: [{ title: "Spots — StickTime FPV" }] }),
  component: Spots,
});
function Spots() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [platform, setPlatform] = useState("");
  const [mode, setMode] = useState<"location" | "track">("location");
  const { data } = useQuery({
    queryKey: ["spots"],
    queryFn: async () => {
      const [locations, tracks] = await Promise.all([
        supabase.from("locations").select("*"),
        supabase.from("tracks").select("*"),
      ]);
      return { locations: locations.data ?? [], tracks: tracks.data ?? [] };
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const result =
        mode === "location"
          ? await supabase
              .from("locations")
              .insert({ user_id: user.user.id, name, city: city || null })
          : await supabase
              .from("tracks")
              .insert({
                user_id: user.user.id,
                name,
                kind: "real",
                sim_platform: platform || null,
              });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("Entry saved");
      setName("");
      setCity("");
      setPlatform("");
      queryClient.invalidateQueries({ queryKey: ["spots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader
        title="Spots & tracks"
        subtitle="Keep physical flying locations separate from layouts and simulator scenarios."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="hud-panel p-5 lg:col-span-1">
          <span className="label-mono">Add entry</span>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={mode === "location" ? "default" : "outline"}
                onClick={() => setMode("location")}
              >
                Location
              </Button>
              <Button
                variant={mode === "track" ? "default" : "outline"}
                onClick={() => setMode("track")}
              >
                Track
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="spot-name">Name</Label>
              <Input
                id="spot-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Riverside bando"
              />
            </div>
            {mode === "location" ? (
              <Input
                placeholder="City / area"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            ) : (
              <Input
                placeholder="Simulator platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              />
            )}
            <Button
              className="w-full"
              disabled={!name || save.isPending}
              onClick={() => save.mutate()}
            >
              Save entry
            </Button>
          </div>
        </section>
        <section className="hud-panel p-5 lg:col-span-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <span className="label-mono">Physical locations</span>
              <div className="mt-4 space-y-3">
                {(data?.locations ?? []).map((location) => (
                  <div
                    key={location.id}
                    className="flex items-center justify-between border-b border-border pb-3"
                  >
                    <div>
                      <p className="font-medium">{location.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {location.city || "Coordinates not set"}
                      </p>
                    </div>
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                ))}
                {!data?.locations?.length && (
                  <p className="text-sm text-muted-foreground">No locations yet.</p>
                )}
              </div>
            </div>
            <div>
              <span className="label-mono">Tracks & scenarios</span>
              <div className="mt-4 space-y-3">
                {(data?.tracks ?? []).map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between border-b border-border pb-3"
                  >
                    <div>
                      <p className="font-medium">{track.name}</p>
                      <Badge variant="secondary">{track.sim_platform || "Real world"}</Badge>
                    </div>
                    <RouteIcon className="h-4 w-4 text-primary" />
                  </div>
                ))}
                {!data?.tracks?.length && (
                  <p className="text-sm text-muted-foreground">No tracks yet.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
