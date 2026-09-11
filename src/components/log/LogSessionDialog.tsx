import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Timer, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import { type SessionRow } from "@/lib/fpv";
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
  const [gearId, setGearId] = useState<string>("none");
  const [controllerId, setControllerId] = useState<string>("none");
  const [gogglesId, setGogglesId] = useState<string>("none");
  const [platform, setPlatform] = useState<string>(SIM_PLATFORMS[0]!);
  const [packs, setPacks] = useState(0);
  const [crashes, setCrashes] = useState(0);
  const [batteryNotes, setBatteryNotes] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setType(initialTab);
    }
  }, [open, initialTab]);

  const queryClient = useQueryClient();

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
        drone_id: type === "real" && gearId !== "none" ? gearId : null,
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
      };

      queryClient.setQueryData<{ sessions: SessionRow[]; gear: SessionRow[] } | undefined>(
        ["log-data"],
        (old) => {
          if (!old) return undefined;
          return {
            sessions: [newRow as SessionRow, ...old.sessions],
            gear: old.gear,
          };
        }
      );

      const { error } = await db_request({
        mode: "query",
        schema: "public",
        table: "sessions",
        operation: "insert",
        data: {
          user_id: uid,
          session_type: type,
          flown_on: flownOn,
          duration_minutes: duration,
        drone_id: type === "real" && gearId !== "none" ? gearId : null,
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
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setNotes("");
      setBatteryNotes("");
      setPacks(0);
      setCrashes(0);
      queryClient.invalidateQueries({ queryKey: ["log-data"] });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["log-data"] });
      import("sonner").then(({ toast }) => toast.error(e.message));
    },
  });

  function handleSave() {
    createSession.mutate();
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
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Radio Controller</Label>
              <Select
                value={controllerId}
                onValueChange={setControllerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a controller" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
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
            <Button
              onClick={handleSave}
              disabled={createSession.isPending}
            >
              Save Session
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}