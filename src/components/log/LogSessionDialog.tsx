import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Timer, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db_request, type DbRequestResult } from "@/lib/db_request";
import { type GearItem } from "@/components/gear-card/types";
import { type SessionRow } from "@/lib/fpv";
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
} from "@/lib/fpv";

interface LogSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab: "real" | "sim";
  gear: GearItem[];
}

export function LogSessionDialog({
  open,
  onOpenChange,
  initialTab,
  gear,
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

  async function getTableNameForGearId(gearId: string): Promise<string> {
    const tables = ["batteries", "drones", "transmitters", "goggles", "other_gear"];
    for (const table of tables) {
      const result: DbRequestResult<GearItem[]> = await db_request({
        mode: "query",
        schema: "personal_gear",
        table,
        operation: "select",
        selectColumns: "id",
        filters: { id: gearId },
      });
      if (result.error) throw result.error;
      if (result.data) return table;
    }
    return "";
  }

  async function updateGearById(
    gearId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const tableName = await getTableNameForGearId(gearId);
    if (!tableName) throw new Error("Gear not found");
    const { error } = await db_request({
      mode: "query",
      schema: "personal_gear",
      table: tableName,
      operation: "update",
      data: updates,
      filters: { id: gearId },
    });
    if (error) throw error;
  }

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
      };

      // Optimistically update the list
      queryClient.setQueryData<{ sessions: SessionRow[]; gear: GearItem[] } | undefined>(
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
        },
      });
      if (error) throw error;

      // Update gear stats if real flight and gear selected
      if (type === "real" && gearId !== "none") {
        const rig = gear.find((g) => g.id === gearId);
        if (rig) {
          await updateGearById(gearId, {
            total_minutes: rig.total_minutes + duration,
            minutes_since_service: rig.minutes_since_service + duration,
            pack_count: rig.pack_count + packs,
            crash_count: rig.crash_count + crashes,
          });
        }
      }

      if (controllerId !== "none") {
        const ctrl = gear.find((g) => g.id === controllerId);
        if (ctrl) {
          await updateGearById(controllerId, {
            total_minutes: ctrl.total_minutes + duration,
          });
        }
      }

      if (gogglesId !== "none") {
        const gog = gear.find((g) => g.id === gogglesId);
        if (gog) {
          await updateGearById(gogglesId, {
            total_minutes: gog.total_minutes + duration,
          });
        }
      }
    },
    onSuccess: () => {
      setOpen(false);
      setNotes("");
      setBatteryNotes("");
      setPacks(0);
      setCrashes(0);
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ["log-data"] });
    },
    onError: (e: Error) => {
      // Rollback optimistic update
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
                  {drones.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {drones.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add a drone in the hanger to track airtime per airframe.
                </p>
              )}
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