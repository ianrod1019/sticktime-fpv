import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
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
  ArrowLeft,
  Lock,
} from "lucide-react";
import { db_request, primeDeltaSyncCache } from "@/lib/db_request";
import {
  GearScopeProvider,
  useGearScopeContext,
} from "@/lib/gear-scope";
import {
  GEAR_REGISTRY,
  GEAR_TYPES,
  type GearTypeUi,
} from "@/lib/gear-registry";
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

export const Route = createFileRoute("/_authenticated/hanger/squadron/$uuid")({
  head: () => ({
    meta: [
      { title: "Squadron Hanger — StickTime FPV" },
      {
        name: "description",
        content:
          "The shared gear hanger of your squadron: org-owned quads, radios, goggles, battery sets and bench gear.",
      },
    ],
  }),
  component: SquadronHangerPage,
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
      "Squadron airframes — shared crash counters, cell counts and service tracking.",
    icon: Cpu,
  },
  {
    key: "transmitter",
    title: "Controllers & Radios",
    blurb: "Org transmitters available to the whole squad.",
    icon: Radio,
  },
  {
    key: "goggles",
    title: "FPV Goggles",
    blurb: "Shared headsets and video receivers.",
    icon: Glasses,
  },
  {
    key: "battery",
    title: "Battery Sets",
    blurb: "Squadron LiPo / Li-Ion sets and their pack counts.",
    icon: BatteryCharging,
  },
  {
    key: "other",
    title: "Other Equipment",
    blurb: "Chargers, tools, field cases and squad accessories.",
    icon: ShieldAlert,
  },
];

function SquadronHangerPage() {
  const { uuid: teamId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <GearScopeProvider scope={{ kind: "org", teamId }}>
      <OrgHanger
        teamId={teamId}
        navigate={navigate}
        queryClient={queryClient}
      />
    </GearScopeProvider>
  );
}

function OrgHanger({
  teamId,
  navigate,
  queryClient,
}: {
  teamId: string;
  navigate: ReturnType<typeof useNavigate>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [gearOpen, setGearOpen] = useState(false);
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

  // Org scope resolution (membership + role gates) comes from the
  // GearScopeProvider above — shared with every org-scoped hook/mutation.
  const { resolution: scope } = useGearScopeContext();
  const { canWrite, canEditMoney } = scope;
  const schema = "org_gear" as const;

  // Per-gear-table queries (RLS scopes rows to team members). Reads run
  // through the delta-sync layer keyed by the TEAM scope: warm visits
  // transfer 0 rows no matter which member is looking.
  const gearQueries = GEAR_TYPES.map((type) =>
    useQuery({
      queryKey: ["hanger-org", teamId, type],
      queryFn: async () => {
        const { data, error } = await db_request({
          mode: "query",
          schema,
          table: GEAR_REGISTRY[type].table,
          operation: "select",
          selectColumns: "*",
          // Pin the pull to THIS squadron: a pilot can be a member of
          // several teams and org RLS only checks membership, so an
          // unfiltered select would mix every squad's fleet into one
          // team-keyed delta-sync cache.
          filters: { team_id: teamId },
          orderBy: { column: "created_at" },
          sync: "delta",
          syncScope: teamId,
        });
        if (error) throw error;
        return (data ?? []).map((g: Record<string, any>) => ({
          ...g,
          gear_type: type,
        }));
      },
      enabled: canWrite || scope.isMember,
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    }),
  );

  const gear = gearQueries.flatMap((q) => q.data ?? []);
  const isLoadingGear = gearQueries.some((q) => q.isLoading);
  const isErrorGear = gearQueries.some((q) => q.isError);

  const addGear = useMutation({
    mutationFn: async () => {
      const isBatt = gearType === "battery";
      const finalInterval = isBatt || serviceMode === "needed" ? 0 : interval;
      const finalCells =
        gearType === "battery" || gearType === "quad" ? cells : 0;
      const finalConnector =
        gearType === "battery" || gearType === "quad" ? connectorType : "";

      const data: Record<string, unknown> = {
        name,
        brand: brand || null,
        service_interval_minutes: finalInterval,
        purchase_cost: purchaseCost,
        team_id: teamId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (gearType === "battery") {
        data["pack_count"] = packCount;
        data["cells"] = finalCells;
        data["connector_type"] = finalConnector || null;
      } else if (gearType === "quad") {
        data["cells"] = finalCells;
        data["connector_type"] = finalConnector || null;
      }

      const { data: inserted, error } = await db_request({
        mode: "query",
        schema,
        table: GEAR_REGISTRY[gearType].table,
        operation: "insert",
        data,
      });
      if (error) throw error;
      if (inserted) {
        primeDeltaSyncCache(
          GEAR_REGISTRY[gearType].table,
          teamId,
          inserted as Record<string, unknown>,
          schema,
        );
      }
    },
    onSuccess: () => {
      toast.success("Added to the squadron hanger");
      setGearOpen(false);
      setName("");
      setBrand("");
      setServiceMode("interval");
      setIntervalMinutes(600);
      setPackCount(4);
      setCells(6);
      setConnectorType("XT60");
      setPurchaseCost(0);
      queryClient.invalidateQueries({ queryKey: ["hanger-org", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateGear = useMutation({
    mutationFn: async ({
      gearId,
      table,
      name,
      brand,
      serviceInterval,
      cells,
      connectorType,
      purchaseCost,
    }: {
      gearId: string;
      table: string;
      name: string;
      brand: string;
      serviceInterval: number;
      cells: number;
      connectorType: string;
      purchaseCost: number;
    }) => {
      const data: Record<string, unknown> = {
        name,
        brand: brand || null,
        service_interval_minutes: serviceInterval,
      };
      // Members without money access never send money fields — the DB
      // trigger is the enforcement, this keeps their payloads clean.
      if (canEditMoney) {
        data["purchase_cost"] = purchaseCost;
        data["cells"] = cells;
        data["connector_type"] = connectorType || null;
      }
      const { error } = await db_request({
        mode: "query",
        schema,
        table,
        operation: "update",
        data,
        filters: { id: gearId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gear updated");
      queryClient.invalidateQueries({ queryKey: ["hanger-org", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeGear = useMutation({
    mutationFn: async ({
      gearId,
      table,
    }: {
      gearId: string;
      table: string;
    }) => {
      const { error } = await db_request({
        mode: "query",
        schema,
        table,
        operation: "delete",
        filters: { id: gearId },
        syncScope: teamId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDeletingGearId(null);
      toast.success("Removed from the squadron hanger");
      queryClient.invalidateQueries({ queryKey: ["hanger-org", teamId] });
    },
    onError: (e: Error) => {
      setDeletingGearId(null);
      toast.error(e.message);
    },
  });

  const handleDeleteClick = (gear: { id: string; gear_type: GearType }) => {
    setDeletingGearId(gear.id);
    removeGear.mutate({
      gearId: gear.id,
      table: GEAR_REGISTRY[gear.gear_type].table,
    });
  };

  // Log service on org gear: adds minutes to the clock + notes, exactly like
  // the personal hanger (maintenance_logs is money-locked, so plain members
  // get the DB-gated behavior instead of a cost field).
  const serviceGear = useMutation({
    mutationFn: async ({
      gearId,
      table,
      minutes,
      notes,
    }: {
      gearId: string;
      table: string;
      minutes: number;
      notes: string;
    }) => {
      const { error } = await db_request({
        mode: "query",
        schema,
        table,
        operation: "update",
        data: {
          minutes_since_service: minutes,
          last_service_notes: notes || null,
        },
        filters: { id: gearId },
        syncScope: teamId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service logged");
      queryClient.invalidateQueries({ queryKey: ["hanger-org", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (scope.isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground font-mono animate-pulse">
        Checking squadron clearance…
      </div>
    );
  }

  if (!scope.isMember) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 hud-panel text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          You are not a member of this squadron's hanger.
        </p>
        <Button
          onClick={() => navigate({ to: "/hanger" })}
          className="w-full gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Hangers
        </Button>
      </div>
    );
  }

  const showCellsAndConnector = gearType === "battery" || gearType === "quad";

  return (
    <>
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/hanger" })}
          className="text-muted-foreground hover:text-foreground gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> All hangers
        </Button>
      </div>

      <PageHeader
        title={scope.teamName ? `${scope.teamName} Hanger` : "Squadron Hanger"}
        subtitle={
          canEditMoney
            ? "Shared squadron fleet — you can manage gear and its costs."
            : "Shared squadron fleet — costs are managed by the squadron owner or managers."
        }
        action={
          canWrite ? (
            <Dialog open={gearOpen} onOpenChange={setGearOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-[inset_0_1px_0_oklch(1_0_0/0.18),0_1px_2px_oklch(0_0_0/0.3),0_6px_16px_-8px_var(--primary)]">
                  <Plus className="mr-1.5 h-4 w-4" /> Add gear
                </Button>
              </DialogTrigger>
              <DialogContent className="border-primary/30 bg-background/95">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-foreground font-display">
                    <span className="w-2 h-2 rounded-full bg-primary"></span>{" "}
                    Add equipment to the squadron hanger
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
                  <div className="space-y-2">
                    <Label htmlFor="org-gname">Name</Label>
                    <Input
                      id="org-gname"
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
                    <Label htmlFor="org-brand">Brand / Manufacturer</Label>
                    <Input
                      id="org-brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="e.g. CNHL, Tattu, Radiomaster, DJI, TBS"
                    />
                  </div>
                  {showCellsAndConnector && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="org-cells">Cell Count (S)</Label>
                        <Select
                          value={String(cells)}
                          onValueChange={(v) => setCells(Number(v))}
                        >
                          <SelectTrigger id="org-cells">
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
                        <Label htmlFor="org-connector">Connector</Label>
                        <Select
                          value={connectorType}
                          onValueChange={setConnectorType}
                        >
                          <SelectTrigger id="org-connector">
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
                  )}
                  {gearType === "battery" && (
                    <div className="space-y-2">
                      <Label htmlFor="org-packCount">
                        Packs in this Battery Set
                      </Label>
                      <Input
                        id="org-packCount"
                        type="number"
                        min={1}
                        max={20}
                        value={packCount}
                        onChange={(e) =>
                          setPackCount(
                            Math.min(
                              20,
                              Math.max(1, Number(e.target.value) || 1),
                            ),
                          )
                        }
                        placeholder="e.g. 4"
                      />
                    </div>
                  )}
                  {gearType !== "battery" && (
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
                          <Label htmlFor="org-interval">
                            Service interval (minutes)
                          </Label>
                          <Input
                            id="org-interval"
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
                {canEditMoney && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="space-y-2">
                      <Label htmlFor="org-purchase-cost">
                        Purchase Cost ($)
                      </Label>
                      <Input
                        id="org-purchase-cost"
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
                )}
                <DialogFooter>
                  <Button
                    onClick={() => addGear.mutate()}
                    disabled={!name}
                    className="bg-primary hover:bg-primary/80 text-primary-foreground w-full sm:w-auto"
                  >
                    Add to squadron hanger
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {!canEditMoney && gear.length > 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Purchase costs and repair expenses on squadron gear are locked — only
          the owner and managers can change them.
        </div>
      )}

      {gear.length === 0 && !isLoadingGear && (
        <EmptyState
          icon={Cpu}
          title={
            canWrite ? "This squadron hanger is empty." : "No shared gear yet."
          }
          description={
            canWrite
              ? "Register the squadron's quads, radios, goggles, battery sets or field gear so every pilot can see and track them."
              : "The squadron owner hasn't added shared gear yet. Check back soon."
          }
          action={
            canWrite ? (
              <Button
                onClick={() => setGearOpen(true)}
                className="bg-primary hover:bg-primary/80 text-primary-foreground"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Add the first piece of gear
              </Button>
            ) : undefined
          }
        />
      )}

      {isErrorGear && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive mb-6">
          Couldn't load the squadron hanger. Check your connection and try
          again.
        </div>
      )}

      <div className="space-y-12 pb-16">
        {GEAR_SECTIONS.map((section) => {
          const items = gear.filter((g) => g.gear_type === section.key);
          const IconComponent = section.icon;
          const isSectionCollapsed = !!collapsedSections[section.key];
          return (
            <section key={section.key} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-primary/20 pb-3 pt-2">
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
                {canWrite && (
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
                )}
              </div>
              <div
                className={`grid transition-[grid-template-rows,opacity,margin-bottom] duration-300 ease-out ${
                  isSectionCollapsed || items.length === 0
                    ? "grid-rows-[0fr] opacity-0 mb-0"
                    : "grid-rows-[1fr] opacity-100 mb-4"
                }`}
              >
                <div className="overflow-hidden">
                  {items.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2 pb-2">
                      {items.map((g) => (
                        <GearCard
                          key={g.id}
                          gear={g}
                          canEdit={canWrite}
                          canEditMoney={canEditMoney}
                          canOpenDetail={false}
                          onDeleteGear={() =>
                            handleDeleteClick({
                              id: g.id,
                              gear_type: g.gear_type as GearType,
                            })
                          }
                          onUpdateGear={(
                            gearId,
                            name,
                            brand,
                            serviceInterval,
                            _packCount,
                            cells,
                            connectorType,
                            purchaseCost,
                          ) =>
                            updateGear.mutate({
                              gearId,
                              table:
                                GEAR_REGISTRY[g.gear_type as GearType].table,
                              name,
                              brand,
                              serviceInterval,
                              cells,
                              connectorType,
                              purchaseCost,
                            })
                          }
                          onService={(gearId, minutes, notes) =>
                            serviceGear.mutate({
                              gearId,
                              table:
                                GEAR_REGISTRY[g.gear_type as GearType].table,
                              minutes,
                              notes,
                            })
                          }
                          isDeleting={deletingGearId === g.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="pb-8">
        <Link
          to="/squadron/$squadronId"
          params={{ squadronId: teamId }}
          className="text-xs text-muted-foreground hover:text-primary"
        >
          Open Squadron HQ →
        </Link>
      </div>
    </>
  );
}
