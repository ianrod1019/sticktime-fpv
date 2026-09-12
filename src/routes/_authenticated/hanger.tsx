import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Cpu,
  Radio,
  Glasses,
  ShieldAlert,
  BatteryCharging,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";
import { GEAR_REGISTRY, GEAR_TYPES, type GearTypeUi } from "@/lib/gear-registry";
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
import { EmptyState } from "@/components/state-panels";
import { useGearCardData } from "@/components/gear-card/use-gear-card-data";

export const Route = createFileRoute("/_authenticated/hanger")({
  validateSearch: (search: Record<string, unknown>): { add?: string } => {
    // ?add=1 — deep link that auto-opens the Add-gear dialog (used by the
    // Cost Ledger so gear entry has a single home). Accept "1" in any
    // serialization ("1", 1, true) for robustness.
    const v = search["add"];
    return v !== undefined && v !== null && v !== "" && v !== "0"
      ? { add: "1" }
      : {};
  },
  head: () => ({
    meta: [
      { title: "Hanger — StickTime FPV" },
      {
        name: "description",
        content:
          "Track your quads, radios, goggles, battery sets and other gear with maintenance health alerts.",
      },
    ],
  }),
  loader: async ({ context }) => {
    // Cached-first: resolves instantly from the persisted cache when fresh;
    // otherwise kicks off (and awaits) the fetch before render.
    const { queryClient } = context;
    const session = await queryClient.fetchQuery({
      queryKey: ["auth-session"],
      queryFn: async () => {
        const { data } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
        return data.session;
      },
      staleTime: 60_000,
    });
    const userId = session?.user?.id;
    if (!userId) return;
    await Promise.all(
      (Object.keys(GEAR_REGISTRY) as GearType[]).map((type) =>
        queryClient.ensureQueryData({
          queryKey: ["hanger", userId, type],
          queryFn: async () => {
            const { db_request } = await import("@/lib/db_request");
            const { data, error } = await db_request({
              mode: "query",
              schema: "personal_gear",
              table: GEAR_REGISTRY[type].table,
              operation: "select",
              selectColumns: "*",
              orderBy: { column: "created_at" },
            });
            if (error) throw error;
            return (data ?? []).map((g: Record<string, any>) => ({
              ...g,
              gear_type: type,
            }));
          },
          staleTime: 30_000,
        }),
      ),
    );
  },
  component: Garage,
});

type GearType = GearTypeUi;

const TYPE_LABELS: Record<GearType, string> = Object.fromEntries(
  Object.entries(GEAR_REGISTRY).map(([key, entry]) => [key, entry.label]),
) as Record<GearType, string>;

const GEAR_SECTIONS: {
  key: GearType;
  title: string;
  blurb: string;
  icon: typeof Cpu;
}[] = [
  {
    key: "quad",
    title: "Drones & Quads",
    blurb:
      "Airframes that accumulate flight time, crash counters, cell count, connector type and component wear.",
    icon: Cpu,
  },
  {
    key: "transmitter",
    title: "Controllers & Radios",
    blurb:
      "Transmitters you pick when logging sessions, with stick ends and gimbal upgrade trackers.",
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
    blurb:
      "LiPo / Li-Ion battery sets, pack counts, cell count, connector types and individual pack management.",
    icon: BatteryCharging,
  },
  {
    key: "other",
    title: "Other Equipment",
    blurb:
      "Chargers, soldering stations, tools, backpack gear and field accessories.",
    icon: ShieldAlert,
  },
];

function Garage() {
  const queryClient = useQueryClient();
  const { profile } = usePilot();
  const navigate = useNavigate({ from: Route.fullPath });
  const { add: addParam } = Route.useSearch();
  const [gearOpen, setGearOpen] = useState(false);
  // Deep link ?add=1 (from the Cost Ledger): the dialog is open whenever the
  // param is present. Derived from the URL — not an effect — so it survives
  // the auth layer's layout remount during async bootstrap. Closing the
  // dialog strips the param.
  const addDeepLink =
    addParam === "1" || (addParam as unknown) === 1;
  const handleGearDialogChange = (open: boolean) => {
    setGearOpen(open);
    if (!open && addDeepLink) navigate({ search: {}, replace: true });
  };
  const [name, setName] = useState("");
  const [gearType, setGearType] = useState<GearType>("quad");
  const [brand, setBrand] = useState("");
  const [serviceMode, setServiceMode] = useState<"interval" | "needed">(
    "interval",
  );
  const [interval, setIntervalMinutes] = useState(600);
  const [packCount, setPackCount] = useState(4);
  const [cells, setCells] = useState<number>(6);
  const [connectorType, setConnectorType] = useState<string>("XT60");
  const [purchaseCost, setPurchaseCost] = useState<number>(0);
  const [deletingGearId, setDeletingGearId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<GearType, boolean>
  >({
    quad: false,
    transmitter: false,
    goggles: false,
    battery: false,
    other: false,
  });

  const toggleSectionCollapse = (key: GearType) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Per-gear-table queries (RLS scopes rows to the pilot). Each table is its
  // own cache entry so realtime events invalidate only what changed. Parts
  // and logs are NOT fetched up-front: they load lazily per card, keeping
  // first paint fast regardless of fleet size.
  const gearQueries = GEAR_TYPES.map((type) =>
    useQuery({
      queryKey: ["hanger", profile?.id ?? null, type],
      queryFn: async () => {
        const { data, error } = await db_request({
          mode: "query",
          schema: "personal_gear",
          table: GEAR_REGISTRY[type].table,
          operation: "select",
          selectColumns: "*",
          orderBy: { column: "created_at" },
        });
        if (error) throw error;
        return (data ?? []).map((g: Record<string, any>) => ({
          ...g,
          gear_type: type,
        }));
      },
      enabled: !!profile?.id,
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    }),
  );

  const gear = gearQueries.flatMap((q) => q.data ?? []);
  const isLoadingGear = gearQueries.some((q) => q.isLoading);
  const isErrorGear = gearQueries.some((q) => q.isError);

  async function getTableNameForGearId(gearId: string): Promise<string> {
    const tables = [
      "batteries",
      "drones",
      "transmitters",
      "goggles",
      "other_gear",
    ];
    for (const table of tables) {
      const { data } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table,
        operation: "select",
        selectColumns: "id",
        filters: { id: gearId },
      });
      if (data) return table;
    }
    return "";
  }

  async function findGearById(
    gearId: string,
  ): Promise<{ id: string; gear_type: string } | null> {
    const table = await getTableNameForGearId(gearId);
    if (!table) return null;
    const { data } = await db_request({
      mode: "query",
      schema: "personal_gear",
      table,
      operation: "select",
      selectColumns: "id",
      filters: { id: gearId },
    });
    if (!data) return null;
    const gearTypeMap: Record<string, string> = {
      batteries: "battery",
      drones: "quad",
      transmitters: "transmitter",
      goggles: "goggles",
      other_gear: "other",
    };
    return { id: data.id, gear_type: gearTypeMap[table] ?? "other" };
  }

  const showCellsAndConnector = gearType === "battery" || gearType === "quad";

  const addGear = useMutation({
    mutationFn: async () => {
      const isBatt = gearType === "battery";
      const finalInterval = isBatt || serviceMode === "needed" ? 0 : interval;
      const finalPackCount = isBatt ? packCount : 0;
      const finalCells = showCellsAndConnector ? cells : 0;
      const finalConnector = showCellsAndConnector ? connectorType : "";

      let tableName: string;
      switch (gearType) {
        case "battery":
          tableName = "batteries";
          break;
        case "quad":
          tableName = "drones";
          break;
        case "transmitter":
          tableName = "transmitters";
          break;
        case "goggles":
          tableName = "goggles";
          break;
        default:
          tableName = "other_gear";
      }

      // Live schema: pack_count exists on batteries/drones/other_gear only;
      // cells + connector_type exist on batteries/drones only. Sending a
      // column a table lacks 400s with a schema-cache error.
      const data: Record<string, unknown> = {
        name,
        brand: brand || null,
        service_interval_minutes: finalInterval,
        purchase_cost: purchaseCost,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (gearType === "battery") {
        data["pack_count"] = finalPackCount;
        data["cells"] = finalCells;
        data["connector_type"] = finalConnector || null;
      } else if (gearType === "quad") {
        data["pack_count"] = 0;
        data["cells"] = finalCells;
        data["connector_type"] = finalConnector || null;
      } else if (gearType === "other") {
        data["pack_count"] = 0;
      }

      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: tableName,
        operation: "insert",
        data,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to the hanger");
      setGearOpen(false);
      setName("");
      setBrand("");
      setServiceMode("interval");
      setIntervalMinutes(600);
      setPackCount(4);
      setCells(6);
      setConnectorType("XT60");
      setPurchaseCost(0);
      queryClient.invalidateQueries({ queryKey: ["hanger"] });
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
      cells,
      connectorType,
      purchaseCost,
    }: {
      gearId: string;
      name: string;
      brand: string;
      serviceInterval: number;
      packCount: number;
      cells: number;
      connectorType: string;
      purchaseCost: number;
    }) => {
      const table = await getTableNameForGearId(gearId);
      if (!table) throw new Error("Gear not found");
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: table,
        operation: "update",
        data: {
          name,
          brand: brand || null,
          service_interval_minutes: serviceInterval,
          pack_count: packCount,
          cells,
          connector_type: connectorType || null,
          purchase_cost: purchaseCost,
        },
        filters: { id: gearId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gear updated successfully");
      queryClient.invalidateQueries({ queryKey: ["hanger"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePackCount = useMutation({
    mutationFn: async ({
      gearId,
      newCount,
      previousCount,
    }: {
      gearId: string;
      newCount: number;
      previousCount?: number;
    }) => {
      const table = await getTableNameForGearId(gearId);
      if (!table) throw new Error("Gear not found");
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: table,
        operation: "update",
        data: { pack_count: newCount },
        filters: { id: gearId },
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      // Lowering the count prunes surplus packs, but packs holding recorded
      // IR readings survive server-side, so nothing here is destructive —
      // restoring the previous count puts the set back exactly as it was.
      const removed =
        variables.previousCount !== undefined &&
        variables.newCount < variables.previousCount
          ? variables.previousCount - variables.newCount
          : 0;
      if (removed > 0 && variables.previousCount !== undefined) {
        const prev = variables.previousCount;
        const gearId = variables.gearId;
        toast.success(
          `Removed ${removed} pack${removed > 1 ? "s" : ""} from the set`,
          {
            description: "Packs with recorded IR readings are kept and come back if you undo.",
            action: {
              label: "Undo",
              onClick: () => updatePackCount.mutate({ gearId, newCount: prev }),
            },
            duration: 8000,
          },
        );
      } else {
        toast.success("Battery set updated");
      }
      queryClient.invalidateQueries({ queryKey: ["hanger"] });
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
      const targetGear = await findGearById(gearId);
      if (targetGear?.gear_type === "quad") {
        // Quad hardware lives in the master inventory (drone_parts) and is
        // installed from the gear detail page — not per-gear parts rows.
        throw new Error(
          "Quad hardware is managed on the drone's detail page (Add hardware).",
        );
      }
      if (targetGear?.gear_type === "battery") {
        // Batteries have pack counts and IR readings, not per-gear parts rows
        // (there is no battery_parts table).
        throw new Error(
          "Battery sets are managed with pack counts and IR readings — no parts to add.",
        );
      }
      const isTransmitter = targetGear?.gear_type === "transmitter";
      const isGoggles = targetGear?.gear_type === "goggles";
      const finalName =
        (isTransmitter || isGoggles) && description
          ? `${partName}: ${description}`
          : partName;
      const table = await getTableNameForGearId(gearId);
      let partsTable: string;
      if (table === "transmitters") partsTable = "transmitter_parts";
      else if (table === "goggles") partsTable = "goggles_parts";
      else partsTable = "other_parts";

      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: partsTable,
        operation: "insert",
        data: {
          gear_id: gearId,
          name: finalName,
          category: isTransmitter || isGoggles ? category : "motor",
          lifespan_minutes: isTransmitter || isGoggles ? 0 : 600,
          spare_count: 0,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Component saved");
      queryClient.invalidateQueries({ queryKey: ["hanger"] });
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
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "maintenance_logs",
        operation: "insert",
        data: {
          gear_id: gearId,
          description,
          cost: cost ? Number(cost) : null,
          reset_service_clock: true,
        },
      });
      if (error) throw error;
      const table = await getTableNameForGearId(gearId);
      if (table) {
        await db_request({
          mode: "query",
          schema: "personal_gear",
          table,
          operation: "update",
          data: { minutes_since_service: 0 },
          filters: { id: gearId },
        });
      }
    },
    onSuccess: () => {
      toast.success("Maintenance logged, service clock reset");
      queryClient.invalidateQueries({ queryKey: ["hanger"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePart = useMutation({
    mutationFn: async (id: string) => {
      let part: { gear_id: string } | null = null;
      // drone_parts intentionally excluded — quad hardware is master-inventory
      // data managed on the gear detail page, not hanger per-gear parts.
      const partTables = [
        "transmitter_parts",
        "goggles_parts",
        "other_parts",
      ];
      for (const table of partTables) {
        const { data } = await db_request({
          mode: "query",
          schema: "personal_gear",
          table,
          operation: "select",
          selectColumns: "gear_id",
          filters: { id },
          head: true,
        });
        if (data) {
          part = data;
          break;
        }
      }
      if (!part?.gear_id) throw new Error("Part not found");

      const gear = await findGearById(part.gear_id);
      if (!gear) throw new Error("Gear not found");

      const partsTableMap: Record<string, string> = {
        battery: "battery_parts",
        transmitter: "transmitter_parts",
        goggles: "goggles_parts",
        other: "other_parts",
      };
      const partsTable = partsTableMap[gear.gear_type] ?? "other_parts";

      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: partsTable,
        operation: "delete",
        filters: { id },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hanger"] }),
  });

  const removeLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "maintenance_logs",
        operation: "delete",
        filters: { id },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hanger"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeGear = useMutation({
    mutationFn: async (id: string) => {
      await db_request({
        mode: "query",
        schema: "public",
        table: "sessions",
        operation: "update",
        data: { gear_id: null },
        filters: { gear_id: id },
      });
      await db_request({
        mode: "query",
        schema: "public",
        table: "sessions",
        operation: "update",
        data: { controller_id: null },
        filters: { controller_id: id },
      });
      const table = await getTableNameForGearId(id);
      if (table) {
        await db_request({
          mode: "query",
          schema: "personal_gear",
          table,
          operation: "delete",
          filters: { id },
        });
        let partsTable: string;
        if (table === "transmitters") partsTable = "transmitter_parts";
        else if (table === "goggles") partsTable = "goggles_parts";
        else partsTable = "other_parts";
        await db_request({
          mode: "query",
          schema: "personal_gear",
          table: partsTable,
          operation: "delete",
          filters: { gear_id: id },
        });
      }
      await db_request({
        mode: "query",
        schema: "personal_gear",
        table: "maintenance_logs",
        operation: "delete",
        filters: { gear_id: id },
      });
    },
    onSuccess: () => {
      setDeletingGearId(null);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => {
      setDeletingGearId(null);
      toast.error(e.message);
    },
  });

  const serviceGear = useMutation({
    mutationFn: async ({
      gearId,
      minutes,
      notes,
    }: {
      gearId: string;
      minutes: number;
      notes: string;
    }) => {
      const table = await getTableNameForGearId(gearId);
      if (!table) throw new Error("Gear not found");
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table,
        operation: "update",
        data: {
          minutes_since_service: minutes,
          last_service_notes: notes || null,
          updated_at: new Date().toISOString(),
        },
        filters: { id: gearId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service logged");
      queryClient.invalidateQueries({ queryKey: ["hanger"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDeleteClick = (id: string) => {
    setDeletingGearId(id);
    removeGear.mutate(id);
  };

  return (
    <>
      <PageHeader
        title="Gear Hanger"
        subtitle="Manage your complete fleet across quads, transmitters, goggles, battery sets and equipment."
        action={
          <Dialog open={gearOpen || addDeepLink} onOpenChange={handleGearDialogChange}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-[inset_0_1px_0_oklch(1_0_0/0.18),0_1px_2px_oklch(0_0_0/0.3),0_6px_16px_-8px_var(--primary)]">
                <Plus className="mr-1.5 h-4 w-4" /> Add gear
              </Button>
            </DialogTrigger>
            <DialogContent className="border-primary/30 bg-background/95">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-foreground font-display">
                  <span className="w-2 h-2 rounded-full bg-primary"></span> Add
                  equipment to hanger
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
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
                  <Select
                    value={gearType}
                    onValueChange={(v) => setGearType(v as GearType)}
                  >
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
                {showCellsAndConnector && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="cells">Cell Count (S)</Label>
                        <Select
                          value={String(cells)}
                          onValueChange={(v) => setCells(Number(v))}
                        >
                          <SelectTrigger id="cells">
                            <SelectValue placeholder="Cells" />
                          </SelectTrigger>
                          <SelectContent>
                            {["1", "2", "3", "4", "5", "6", "8"].map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}S
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="connectorType">Connector</Label>
                        <Select
                          value={connectorType}
                          onValueChange={setConnectorType}
                        >
                          <SelectTrigger id="connectorType">
                            <SelectValue placeholder="Connector" />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              "XT30",
                              "XT60",
                              "XT90",
                              "PH2.0",
                              "BT2.0",
                              "BT3.0",
                              "XN69",
                              "A30",
                            ].map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
                {gearType === "battery" ? (
                  <div className="space-y-2">
                    <Label htmlFor="packCount">Packs in this Battery Set</Label>
                    <Input
                      id="packCount"
                      type="number"
                      min={1}
                      max={20}
                      value={packCount}
                      onChange={(e) =>
                        setPackCount(
                          Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                        )
                      }
                      placeholder="e.g. 4"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Number of identical LiPo/Li-Ion packs grouped in this
                      battery set.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Maintenance Schedule</Label>
                      <Select
                        value={serviceMode}
                        onValueChange={(v) =>
                          setServiceMode(v as "interval" | "needed")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="interval">
                            Custom service interval (minutes)
                          </SelectItem>
                          <SelectItem value="needed">
                            Service as needed (no fixed schedule)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {serviceMode === "interval" && (
                      <div className="space-y-2">
                        <Label htmlFor="interval">
                          Service interval (minutes)
                        </Label>
                        <Input
                          id="interval"
                          type="number"
                          value={interval}
                          onChange={(e) =>
                            setIntervalMinutes(
                              Math.max(1, Number(e.target.value) || 0),
                            )
                          }
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Cost Tracking Inputs */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="space-y-2">
                  <Label htmlFor="purchase-cost">Purchase Cost ($)</Label>
                  <Input
                    id="purchase-cost"
                    type="number"
                    min={0}
                    step={0.01}
                    value={String(purchaseCost)}
                    onChange={(e) =>
                      setPurchaseCost(
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addGear.mutate()}
                  disabled={!name}
                  className="bg-primary hover:bg-primary/80 text-primary-foreground w-full sm:w-auto"
                >
                  Add to hanger
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {gear.length === 0 && (
        <EmptyState
          icon={Cpu}
          title="Your hanger is currently empty."
          description="Register your quads, radio transmitters, FPV goggles, battery sets or field gear to track telemetry, airtime, and maintenance intervals."
          action={
            <Button
              onClick={() => setGearOpen(true)}
              className="bg-primary hover:bg-primary/80 text-primary-foreground"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add your first piece of gear
            </Button>
          }
        />
      )}
      <div className="space-y-12 pb-16">
        {GEAR_SECTIONS.map((section) => {
          const items = gear.filter((g) => g.gear_type === section.key);
          const IconComponent = section.icon;
          const isSectionCollapsed = !!collapsedSections[section.key];
          return (
            <section key={section.key} className="space-y-4">
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-primary/20 pb-3 pt-2"
              >
                <button
                  type="button"
                  className="flex items-center gap-3 cursor-pointer select-none group text-left"
                  onClick={() => toggleSectionCollapse(section.key)}
                  aria-expanded={!isSectionCollapsed}
                >
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm group-hover:bg-primary/20 transition-colors">
                    <IconComponent className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="font-display text-base font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                        {section.title}
                        <span className="text-primary" aria-hidden>
                          {isSectionCollapsed ? (
                            <ChevronDown className="h-4 w-4 inline" />
                          ) : (
                            <ChevronUp className="h-4 w-4 inline" />
                          )}
                        </span>
                      </h2>
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-primary/10 text-primary border border-primary/20 font-semibold">
                        {items.length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {section.blurb}
                    </p>
                  </div>
                </button>
                <div onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGearType(section.key);
                      setGearOpen(true);
                    }}
                    className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary/90 text-xs self-start sm:self-auto font-medium"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add{" "}
                    {TYPE_LABELS[section.key].toLowerCase()}
                  </Button>
                </div>
              </div>
              <div
                className={`grid transition-[grid-template-rows,opacity,margin-bottom] duration-300 ease-out ${
                  isSectionCollapsed
                    ? "grid-rows-[0fr] opacity-0 mb-0"
                    : "grid-rows-[1fr] opacity-100 mb-4"
                }`}
              >
                <div className="overflow-hidden">
                {items.length === 0 ? (
                  <div className="hud-panel p-8 text-center text-xs text-muted-foreground/70 border-dashed border-primary/20 bg-card/20 rounded-xl my-2">
                    No {TYPE_LABELS[section.key].toLowerCase()} registered yet.
                    Click the button above to add your equipment.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2 pb-2">
                    {items.map((g) => {
                      // Parts and logs load lazily per card (paged for logs)
                      // so hanger first paint only waits on the gear tables.
                      return (
                        <GearCard
                          key={g.id}
                          gear={g}
                          onDeleteGear={handleDeleteClick}
                          onUpdateGear={(
                            gearId,
                            name,
                            brand,
                            serviceInterval,
                            packCount,
                            cells,
                            connectorType,
                            purchaseCost,
                          ) =>
                            updateGear.mutate({
                              gearId,
                              name,
                              brand,
                              serviceInterval,
                              packCount,
                              cells,
                              connectorType,
                              purchaseCost,
                            })
                          }
                          onUpdatePackCount={(gearId, newCount) =>
                            updatePackCount.mutate({
                              gearId,
                              newCount,
                              previousCount: g.pack_count,
                            })
                          }
                          onAddPart={(
                            gearId,
                            partName,
                            category,
                            description,
                          ) =>
                            addPart.mutate({
                              gearId,
                              partName,
                              category,
                              description,
                            })
                          }
                          onRemovePart={(partId) => removePart.mutate(partId)}
                          onAddLog={(gearId, description, cost) =>
                            addLog.mutate({ gearId, description, cost })
                          }
                          onRemoveLog={(logId) => removeLog.mutate(logId)}
                          onService={(gearId, minutes, notes) =>
                            serviceGear.mutate({ gearId, minutes, notes })
                          }
                          isDeleting={deletingGearId === g.id}
                        />
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
