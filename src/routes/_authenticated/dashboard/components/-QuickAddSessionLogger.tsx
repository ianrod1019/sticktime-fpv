import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Timer,
  Clock,
  Zap,
  MapPin,
  Radio,
  Package,
  Calendar,
  Radio as TransmitterIcon,
  RectangleGoggles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toDateKey, type SessionRow } from "@/lib/fpv";
import { db_request, DbRequestResult } from "@/lib/db_request";

// Module-level timer state that persists across dialog open/close and page reloads
const STORAGE_KEY = "quick-add-stopwatch-state";
let moduleIsRunning = false;
let moduleElapsedSeconds = 0;
let moduleTimerInterval: number | null = null;
const moduleSubscribers: Set<(seconds: number, running: boolean) => void> =
  new Set();

// Load timer state from localStorage on module initialization
function loadTimerStateFromStorage(): void {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        parsed &&
        typeof parsed.elapsedSeconds === "number" &&
        parsed.elapsedSeconds >= 0
      ) {
        moduleElapsedSeconds = parsed.elapsedSeconds;
      }
    }
  } catch (e) {
    console.warn("Failed to load timer state from localStorage:", e);
  }
}

// Save timer state to localStorage
function saveTimerStateToStorage(): void {
  try {
    const state = {
      elapsedSeconds: moduleElapsedSeconds,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save timer state to localStorage:", e);
  }
}

// Initialize timer state from storage
loadTimerStateFromStorage();

function startModuleTimer(): void {
  if (moduleTimerInterval !== null) {
    return;
  }

  moduleTimerInterval = window.setInterval(() => {
    moduleElapsedSeconds += 1;

    const subscribers = Array.from(moduleSubscribers);
    for (const subscriber of subscribers) {
      try {
        subscriber(moduleElapsedSeconds, moduleIsRunning);
      } catch (subError) {
        console.warn("Error in timer subscriber:", subError);
        moduleSubscribers.delete(subscriber);
      }
    }

    saveTimerStateToStorage();
  }, 1000);
}

function stopModuleTimer(): void {
  if (moduleTimerInterval === null) {
    return;
  }

  window.clearInterval(moduleTimerInterval);
  moduleTimerInterval = null;
  moduleIsRunning = false;

  const subscribers = Array.from(moduleSubscribers);
  for (const subscriber of subscribers) {
    try {
      subscriber(moduleElapsedSeconds, moduleIsRunning);
    } catch (subError) {
      console.warn("Error in timer subscriber:", subError);
      moduleSubscribers.delete(subscriber);
    }
  }

  saveTimerStateToStorage();
}

function resetModuleTimer(): void {
  stopModuleTimer();
  moduleElapsedSeconds = 0;

  const subscribers = Array.from(moduleSubscribers);
  for (const subscriber of subscribers) {
    try {
      subscriber(moduleElapsedSeconds, moduleIsRunning);
    } catch (subError) {
      console.warn("Error in timer subscriber:", subError);
      moduleSubscribers.delete(subscriber);
    }
  }

  saveTimerStateToStorage();
}

function subscribeToTimer(
  subscriber: (seconds: number, running: boolean) => void,
): () => void {
  moduleSubscribers.add(subscriber);

  try {
    subscriber(moduleElapsedSeconds, moduleIsRunning);
  } catch (subError) {
    console.warn("Error in initial timer subscriber invocation:", subError);
    moduleSubscribers.delete(subscriber);
  }

  return () => {
    moduleSubscribers.delete(subscriber);
  };
}

interface GearOption {
  id: string;
  name: string;
  gear_type: "battery" | "quad" | "transmitter" | "goggles" | "other";
  total_minutes?: number;
  minutes_since_service?: number;
  pack_count?: number;
}

interface ControllerGogglesOption {
  id: string;
  name: string;
}

interface QuickAddSessionLoggerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (session: SessionRow) => void;
}

function getTableForGearType(gearType: GearOption["gear_type"]): string {
  switch (gearType) {
    case "battery":
      return "batteries";
    case "quad":
      return "drones";
    case "transmitter":
      return "transmitters";
    case "goggles":
      return "goggles";
    default:
      return "other_gear";
  }
}

export function QuickAddSessionLogger({
  open,
  onOpenChange,
  onSubmit,
}: QuickAddSessionLoggerProps) {
  const queryClient = useQueryClient();
  const today = toDateKey(new Date());

  const [flownOn, setFlownOn] = useState(today);
  const [location, setLocation] = useState("");
  const [duration, setDuration] = useState(0);
  const [rigId, setRigId] = useState("");
  const [packs, setPacks] = useState(0);
  const [controllerId, setControllerId] = useState("");
  const [gogglesId, setGogglesId] = useState("");
  const [isRunning, setIsRunning] = useState(moduleIsRunning);
  const [elapsedSeconds, setElapsedSeconds] = useState(moduleElapsedSeconds);

  const { data: gearData } = useQuery<GearOption[]>({
    queryKey: ["quick-add-gear"],
    queryFn: async () => {
      const [batteries, drones, transmitters, goggles, otherGear] =
        await Promise.all([
          db_request({
            mode: "query",
            schema: "personal_gear",
            table: "batteries",
            operation: "select",
            selectColumns:
              "id, name, total_minutes, minutes_since_service, pack_count",
            orderBy: { column: "name" },
          }),
          db_request({
            mode: "query",
            schema: "personal_gear",
            table: "drones",
            operation: "select",
            selectColumns:
              "id, name, total_minutes, minutes_since_service, pack_count",
            orderBy: { column: "name" },
          }),
          db_request({
            mode: "query",
            schema: "personal_gear",
            table: "transmitters",
            operation: "select",
            selectColumns:
              "id, name, total_minutes, minutes_since_service, pack_count",
            orderBy: { column: "name" },
          }),
          db_request({
            mode: "query",
            schema: "personal_gear",
            table: "goggles",
            operation: "select",
            selectColumns:
              "id, name, total_minutes, minutes_since_service, pack_count",
            orderBy: { column: "name" },
          }),
          db_request({
            mode: "query",
            schema: "personal_gear",
            table: "other_gear",
            operation: "select",
            selectColumns:
              "id, name, total_minutes, minutes_since_service, pack_count",
            orderBy: { column: "name" },
          }),
        ]);

      const results: GearOption[] = [
        ...((batteries.data as GearOption[] | null) ?? []).map((r) => ({
          ...r,
          gear_type: "battery" as const,
        })),
        ...((drones.data as GearOption[] | null) ?? []).map((r) => ({
          ...r,
          gear_type: "quad" as const,
        })),
        ...((transmitters.data as GearOption[] | null) ?? []).map((r) => ({
          ...r,
          gear_type: "transmitter" as const,
        })),
        ...((goggles.data as GearOption[] | null) ?? []).map((r) => ({
          ...r,
          gear_type: "goggles" as const,
        })),
        ...((otherGear.data as GearOption[] | null) ?? []).map((r) => ({
          ...r,
          gear_type: "other" as const,
        })),
      ];

      const errors = [
        batteries.error,
        drones.error,
        transmitters.error,
        goggles.error,
        otherGear.error,
      ].filter(Boolean);
      if (errors.length) throw errors[0];

      return results;
    },
  });

  const controllerData =
    gearData?.filter((g) => g.gear_type === "transmitter") ?? [];
  const gogglesData = gearData?.filter((g) => g.gear_type === "goggles") ?? [];

  // Subscribe to the global timer so it keeps running in the background
  useEffect(() => {
    return subscribeToTimer((seconds, running) => {
      setElapsedSeconds(seconds);
      setIsRunning(running);
    });
  }, []);

  // Persist timer state to localStorage whenever it changes
  useEffect(() => {
    saveTimerStateToStorage();
  }, [elapsedSeconds]);

  // Reset form fields when dialog opens, preserve timer state
  useEffect(() => {
    if (open) {
      setFlownOn(today);
      setDuration(0);
      setPacks(0);
      setControllerId("");
      setGogglesId("");
    }
  }, [open]);

  const startStopwatch = useCallback(() => {
    moduleIsRunning = true;
    startModuleTimer();
    setIsRunning(true);
  }, []);

  const stopStopwatch = useCallback(() => {
    stopModuleTimer();
    setIsRunning(false);
  }, []);

  const resetStopwatch = useCallback(() => {
    resetModuleTimer();
    setIsRunning(false);
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    if (elapsedSeconds > 0 && elapsedSeconds % 60 === 0) {
      setDuration(Math.floor(elapsedSeconds / 60));
    }
  }, [elapsedSeconds]);

  const handleDurationChange = (value: string) => {
    const minutes = Math.max(0, Math.min(999, Number(value) || 0));
    setDuration(minutes);
  };

  const handlePacksChange = (value: string) => {
    const count = Math.max(0, Math.min(99, Number(value) || 0));
    setPacks(count);
  };

  const handleRigChange = (value: string) => {
    setRigId(value);
  };

  const handleControllerChange = (value: string) => {
    setControllerId(value);
  };

  const handleGogglesChange = (value: string) => {
    setGogglesId(value);
  };

  const createSession = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const finalDuration = isRunning
        ? Math.floor(elapsedSeconds / 60)
        : duration;

      const session: SessionRow = {
        id: `local-${Date.now()}`,
        session_type: "real",
        flown_on: flownOn,
        duration_minutes: finalDuration,
        gear_id: rigId,
        controller_id: controllerId || null,
        goggles_id: gogglesId || null,
        location_id: null,
        track_id: null,
        sim_platform: null,
        packs_flown: packs,
        crashes: 0,
        battery_notes: null,
        weather: null,
        rating: null,
        notes: location ? `Location: ${location}` : null,
      };

      const { error } = await db_request({
        mode: "query",
        schema: "public",
        table: "sessions",
        operation: "insert",
        data: {
          user_id: uid,
          session_type: "real",
          flown_on: flownOn,
          duration_minutes: finalDuration,
          gear_id: rigId,
          controller_id: controllerId || null,
          goggles_id: gogglesId || null,
          location_id: null,
          track_id: null,
          sim_platform: null,
          packs_flown: packs,
          crashes: 0,
          battery_notes: null,
          weather: null,
          notes: location ? `Location: ${location}` : null,
        },
      });
      if (error) throw error;

      if (rigId) {
        const rig = gearData?.find((g) => g.id === rigId);
        if (rig) {
          const table = getTableForGearType(rig.gear_type);
          (await db_request({
            mode: "query",
            schema: "personal_gear",
            table,
            operation: "update",
            data: {
              total_minutes: (rig.total_minutes ?? 0) + finalDuration,
              minutes_since_service:
                (rig.minutes_since_service ?? 0) + finalDuration,
              pack_count: (rig.pack_count ?? 0) + packs,
            },
            filters: { id: rigId },
          })) as DbRequestResult<GearOption[]>;
        }
      }

      if (controllerId) {
        const ctrl = gearData?.find((g) => g.id === controllerId);
        if (ctrl) {
          const table = getTableForGearType(ctrl.gear_type);
          (await db_request({
            mode: "query",
            schema: "personal_gear",
            table,
            operation: "update",
            data: {
              total_minutes: (ctrl.total_minutes ?? 0) + finalDuration,
            },
            filters: { id: controllerId },
          })) as DbRequestResult<GearOption[]>;
        }
      }

      if (gogglesId) {
        const gog = gearData?.find((g) => g.id === gogglesId);
        if (gog) {
          const table = getTableForGearType(gog.gear_type);
          (await db_request({
            mode: "query",
            schema: "personal_gear",
            table,
            operation: "update",
            data: {
              total_minutes: (gog.total_minutes ?? 0) + finalDuration,
            },
            filters: { id: gogglesId },
          })) as DbRequestResult<GearOption[]>;
        }
      }

      return session;
    },
    onSuccess: (session) => {
      onOpenChange(false);
      onSubmit(session);
      queryClient.invalidateQueries({ queryKey: ["session-totals"] });
      queryClient.invalidateQueries({ queryKey: ["recent-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["active-rigs"] });
      queryClient.invalidateQueries({ queryKey: ["rig-usage"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-volume"] });
      resetStopwatch();

      setRigId("");
      setLocation("");
      setControllerId("");
      setGogglesId("");
    },
    onError: (e: Error) => {
      import("sonner").then(({ toast }) => toast.error(e.message));
    },
  });

  const handleSubmit = () => {
    if (!rigId) return;
    if (duration <= 0 && !isRunning) return;
    createSession.mutate();
  };

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const canSubmit =
    rigId && (duration > 0 || isRunning) && !createSession.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-150 max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <DialogTitle>Quick Log Session</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Log a flight in seconds. Timer tracks down to the minute.
          </p>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quick-date">Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="quick-date"
                  type="date"
                  value={flownOn}
                  onChange={(e) => setFlownOn(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-packs">Packs</Label>
              <div className="relative">
                <Package className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="quick-packs"
                  type="number"
                  min={0}
                  max={99}
                  value={packs}
                  onChange={(e) => handlePacksChange(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-location">Location</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="quick-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Where did you fly?"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-rig">Rig</Label>
            <div className="relative">
              <Radio className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Select value={rigId} onValueChange={handleRigChange}>
                <SelectTrigger className="pl-9">
                  <SelectValue placeholder="Pick a rig" />
                </SelectTrigger>
                <SelectContent>
                  {gearData
                    ?.filter((g) => g.gear_type === "quad")
                    .map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-controller">Controller</Label>
            <div className="relative">
              <TransmitterIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Select
                value={controllerId}
                onValueChange={handleControllerChange}
              >
                <SelectTrigger className="pl-9">
                  <SelectValue placeholder="Pick a controller" />
                </SelectTrigger>
                <SelectContent>
                  {controllerData?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-goggles">Goggles</Label>
            <div className="relative">
              <RectangleGoggles className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Select value={gogglesId} onValueChange={handleGogglesChange}>
                <SelectTrigger className="pl-9">
                  <SelectValue placeholder="Pick goggles" />
                </SelectTrigger>
                <SelectContent>
                  {gogglesData?.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Timer className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={duration}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="pl-9 font-mono"
                  placeholder="Min"
                />
              </div>
              <div className="flex flex-col items-start gap-3 pt-1 min-w-50">
                <div className="flex flex-col items-center justify-center min-w-27.5 px-4 py-3 bg-muted rounded-md border border-border">
                  <Clock className="h-4 w-4 text-muted-foreground mb-1" />
                  <span className="font-mono text-base font-semibold">
                    {formatElapsed(elapsedSeconds)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    stopwatch
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={isRunning ? "outline" : "default"}
                    size="icon"
                    onClick={isRunning ? stopStopwatch : startStopwatch}
                    className="flex items-center gap-2 px-3 py-2 text-sm min-w-22.5"
                  >
                    {isRunning ? (
                      <>
                        <Timer className="h-4 w-4 mr-1.5" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Timer className="h-4 w-4 mr-1.5" />
                        Start
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={resetStopwatch}
                    className="flex items-center gap-2 px-3 py-2 text-sm min-w-22.5"
                  >
                    <Clock className="h-4 w-4 mr-1.5" />
                    Reset
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Start the timer when you land, or enter minutes manually.
              Stopwatch rounds to the minute.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            <Plus className="mr-1 h-4 w-4" /> Log Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
