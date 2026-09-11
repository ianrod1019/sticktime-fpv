import { useState, useEffect } from "react";
import { Plus, Timer, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DURATION_BLOCKS, SIM_PLATFORMS, toDateKey } from "@/lib/fpv";

interface LogSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab: "sim" | "real";
}

export function LogSessionDialog({
  open,
  onOpenChange,
  initialTab,
}: LogSessionDialogProps) {
  const [type, setType] = useState<"sim" | "real">(initialTab);
  const [flownOn, setFlownOn] = useState(toDateKey(new Date()));
  const [duration, setDuration] = useState(20);
  const [controllerId, setControllerId] = useState<string>("none");
  const [gogglesId, setGogglesId] = useState<string>("none");
  const [droneId, setDroneId] = useState<string>("none");
  const [platform, setPlatform] = useState<string>(SIM_PLATFORMS[0]!);
  const [packs, setPacks] = useState(0);
  const [crashes, setCrashes] = useState(0);
  const [batteryNotes, setBatteryNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [gearLoading, setGearLoading] = useState(false);
  const [gearError, setGearError] = useState<string | null>(null);
  const [controllers, setControllers] = useState<{id: string; name: string; brand: string | null}[]>([]);
  const [drones, setDrones] = useState<{id: string; name: string; brand: string | null}[]>([]);
  const [goggles, setGoggles] = useState<{id: string; name: string; brand: string | null}[]>([]);

  useEffect(() => {
    if (open) {
      setGearLoading(true);
      setGearError(null);
      fetchGear();
    }
  }, [open]);

  const fetchGear = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const { data: gearData, error: rpcError } = await supabase.rpc("get_usable_gear", {
        p_user_id: uid,
      });

      if (rpcError) throw new Error(rpcError.message);
      if (!gearData || !Array.isArray(gearData)) throw new Error("No gear data returned");

      const c: {id: string; name: string; brand: string | null}[] = [];
      const d: {id: string; name: string; brand: string | null}[] = [];
      const g: {id: string; name: string; brand: string | null}[] = [];

      for (const item of gearData) {
        if (item.gear_type === "controller") c.push({ id: item.gear_id, name: item.gear_name, brand: item.gear_brand });
        else if (item.gear_type === "drone") d.push({ id: item.gear_id, name: item.gear_name, brand: item.gear_brand });
        else if (item.gear_type === "goggles") g.push({ id: item.gear_id, name: item.gear_name, brand: item.gear_brand });
      }

      setControllers(c);
      setDrones(d);
      setGoggles(g);
    } catch (err: any) {
      setGearError(err?.message || "Failed to load gear");
    } finally {
      setGearLoading(false);
    }
  };

  function handleSave() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Drone</Label>
              <Select value={droneId} onValueChange={setDroneId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a drone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No drone</SelectItem>
                  {gearLoading && <SelectItem value="loading">Loading...</SelectItem>}
                  {drones.map((dr) => (
                    <SelectItem key={dr.id} value={dr.id}>
                      {dr.name}{dr.brand ? ` (${dr.brand})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {gearLoading && <SelectItem value="loading">Loading...</SelectItem>}
                  {controllers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.brand ? ` (${c.brand})` : ""}
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
                  {gearLoading && <SelectItem value="loading">Loading...</SelectItem>}
                  {goggles.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}{g.brand ? ` (${g.brand})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {gearError && (
            <div className="text-sm text-destructive">{gearError}</div>
          )}

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
            <Button onClick={handleSave}>Save Session</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}