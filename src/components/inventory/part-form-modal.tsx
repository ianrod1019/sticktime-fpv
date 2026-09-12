import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_LABELS,
  PART_CATEGORIES,
  PART_STATUSES,
  STATUS_LABELS,
  normalizeSpecs,
  specFieldsFor,
  type DronePart,
  type PartCategory,
  type PartInput,
  type PartStatus,
} from "@/lib/inventory";
import { linkPartToDrone } from "@/hooks/gear-item/use-drone-build";
import { useDroneOptions, useProAccess } from "@/hooks/inventory";

interface PartFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Persists the part. Resolves to the new part's id on create (or `true`
   * on update, falsy on failure). Callers that handle installs themselves
   * (e.g. the drone-detail panel) resolve to `false` to suppress this
   * form's built-in install step.
   */
  onSubmit: (input: PartInput) => Promise<string | boolean | null>;
  /** When set, the form edits this part; otherwise it creates a new one. */
  part?: DronePart | null;
  /** Hides the install section (used when the host page installs directly). */
  suppressInstallSection?: boolean;
  /** Hides the status field (used when the host controls status semantics). */
  suppressStatusField?: boolean;
}

interface FormState {
  name: string;
  brand: string;
  category: PartCategory;
  status: PartStatus;
  quantity: number;
  notes: string;
  specs: Record<string, string>;
  purchaseCost: string;
  purchaseDate: string;
  vendor: string;
}

function stateFromPart(part: DronePart | null | undefined): FormState {
  if (!part) {
    return {
      name: "",
      brand: "",
      category: "motor",
      status: "shelf",
      quantity: 1,
      notes: "",
      specs: {},
      purchaseCost: "",
      purchaseDate: "",
      vendor: "",
    };
  }
  const specs = normalizeSpecs(part.specs);
  const notes = specs["notes"] ?? "";
  const quantity = Number(specs["quantity"]) || 1;
  const rest = Object.fromEntries(
    Object.entries(specs).filter(
      ([key]) => key !== "notes" && key !== "quantity",
    ),
  );
  return {
    name: part.name,
    brand: part.brand ?? "",
    category: (part.category as PartCategory) ?? "other",
    status: (part.status as PartStatus) ?? "shelf",
    quantity,
    notes,
    specs: rest,
    purchaseCost:
      part.purchase_cost === null || part.purchase_cost === undefined
        ? ""
        : String(part.purchase_cost),
    purchaseDate: part.purchase_date
      ? String(part.purchase_date).slice(0, 10)
      : "",
    vendor: part.vendor ?? "",
  };
}

/**
 * Managed add/edit form for master-inventory parts. Spec inputs are dynamic
 * per category and flattened into the specs JSONB column.
 *
 * "Quantity owned" is a first-class field (how many identical units the pilot
 * owns — e.g. 4 motors for one quad). When the part is marked Installed, a
 * follow-up card lists every registered airframe so the matching-quantity
 * install can be recorded immediately — no trip to the detail modal needed.
 */
export function PartFormModal({
  open,
  onOpenChange,
  onSubmit,
  part,
  suppressInstallSection = false,
  suppressStatusField = false,
}: PartFormModalProps) {
  const [state, setState] = useState<FormState>(() => stateFromPart(part));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = !!part;

  // Install-step state lives outside `state` so it never leaks into the
  // specs JSONB or the PartInput payload.
  const [shouldAssign, setShouldAssign] = useState(true);
  const [droneId, setDroneId] = useState("");
  const [installedQty, setInstalledQty] = useState(1);
  const { hasProAccess } = useProAccess();

  // Lists every airframe the pilot owns (RLS scopes to own drones), so the
  // Installed status can offer a full drone picker even for brand-new parts.
  const dronesQuery = useDroneOptions(open && hasProAccess);
  const droneOptions = dronesQuery.data ?? [];

  useEffect(() => {
    if (open) {
      setState(stateFromPart(part));
      setShouldAssign(true);
      setDroneId("");
      setInstalledQty(1);
    }
  }, [open, part]);

  const specFields = specFieldsFor(state.category);
  const isInstalled = state.status === "installed";

  const setSpecValue = (key: string, value: string) =>
    setState((prev) => ({
      ...prev,
      specs: { ...prev.specs, [key]: value },
    }));

  const handleCategoryChange = (category: PartCategory) =>
    setState((prev) => ({
      ...prev,
      category,
      specs: specFieldsFor(category).length > 0 ? {} : prev.specs,
    }));

  const handleSubmit = async () => {
    if (!state.name.trim()) {
      toast.error("Give the part a name first");
      return;
    }
    if (isInstalled && shouldAssign && !droneId) {
      toast.error("Pick an airframe to install this part on");
      return;
    }
    if (
      !isEdit &&
      isInstalled &&
      shouldAssign &&
      installedQty > state.quantity
    ) {
      toast.error(`You only have ${state.quantity} of this part on the bench`);
      return;
    }

    setIsSubmitting(true);
    const specs: Record<string, string> = { ...state.specs };
    if (state.notes.trim()) specs["notes"] = state.notes.trim();
    specs["quantity"] = String(state.quantity);
    const costValue =
      state.purchaseCost.trim() === "" ? null : Number(state.purchaseCost);
    if (costValue !== null && Number.isNaN(costValue)) {
      toast.error("Purchase cost must be a number");
      setIsSubmitting(false);
      return;
    }
    const result = await onSubmit({
      name: state.name.trim(),
      brand: state.brand.trim() || null,
      category: state.category,
      status: state.status,
      specs,
      purchase_cost: costValue,
      purchase_date: state.purchaseDate || null,
      vendor: state.vendor.trim() || null,
    });
    if (!result) {
      setIsSubmitting(false);
      return;
    }
    if (isInstalled && shouldAssign && droneId) {
      const partId = isEdit
        ? part.id
        : typeof result === "string"
          ? result
          : "";
      const assigned = partId
        ? await linkPartToDrone({
            droneId,
            partId,
            quantity: installedQty,
          })
        : false;
      if (!assigned) {
        toast.error(
          "Part saved, but the install could not be recorded. Open the part and assign it from there.",
        );
        setIsSubmitting(false);
        return;
      }
      const droneName =
        droneOptions.find((d) => d.id === droneId)?.name ?? "airframe";
      toast.success(`Installed on ${droneName}`);
    }

    setIsSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/30 bg-background/95 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            {isEdit ? "Edit bench part" : "Add part to the bench"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="part-name">Name</Label>
              <Input
                id="part-name"
                value={state.name}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. T-Motor F60 Pro V"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="part-brand">Brand</Label>
              <Input
                id="part-brand"
                value={state.brand}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, brand: e.target.value }))
                }
                placeholder="e.g. T-Motor"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={state.category}
                onValueChange={(v) => handleCategoryChange(v as PartCategory)}
              >
                <SelectTrigger aria-label="Part category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PART_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!suppressStatusField && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={state.status}
                  onValueChange={(v) =>
                    setState((prev) => ({ ...prev, status: v as PartStatus }))
                  }
                >
                  <SelectTrigger aria-label="Part status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PART_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="part-qty">Quantity owned</Label>
            <Input
              id="part-qty"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={state.quantity}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  quantity: Math.max(
                    1,
                    Math.floor(Number(e.target.value) || 1),
                  ),
                }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              How many identical units you own — e.g. 4 motors for one quad.
              Installs are tracked separately per airframe.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-primary/15 bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Purchase (for the cost ledger)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="part-cost">Cost</Label>
                <Input
                  id="part-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={state.purchaseCost}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      purchaseCost: e.target.value,
                    }))
                  }
                  placeholder="e.g. 24.99"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="part-purchase-date">Purchase date</Label>
                <Input
                  id="part-purchase-date"
                  type="date"
                  value={state.purchaseDate}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      purchaseDate: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="part-vendor">Vendor</Label>
              <Input
                id="part-vendor"
                value={state.vendor}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, vendor: e.target.value }))
                }
                placeholder="e.g. RaceDayQuads"
              />
            </div>
          </div>

          {isInstalled && !suppressInstallSection && (
            <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                Install on an airframe
              </div>
              {!hasProAccess ? (
                <p className="text-[11px] text-muted-foreground">
                  Airframe installs are a{" "}
                  <Link
                    to="/settings"
                    className="text-primary underline underline-offset-2"
                  >
                    Pro
                  </Link>{" "}
                  feature — the part will still be saved to the bench.
                </p>
              ) : droneOptions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No drones registered yet — add one in the Hanger to record
                  installs.
                </p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={shouldAssign}
                      onChange={(e) => setShouldAssign(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--primary)]"
                    />
                    Record the install now
                  </label>
                  {shouldAssign && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="form-assign-drone">Airframe</Label>
                        <Select value={droneId} onValueChange={setDroneId}>
                          <SelectTrigger
                            id="form-assign-drone"
                            aria-label="Choose airframe"
                          >
                            <SelectValue placeholder="Pick a quad" />
                          </SelectTrigger>
                          <SelectContent>
                            {droneOptions.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-24 space-y-1.5">
                        <Label htmlFor="form-assign-qty">Qty installed</Label>
                        <Input
                          id="form-assign-qty"
                          type="number"
                          min={1}
                          value={installedQty}
                          onChange={(e) =>
                            setInstalledQty(
                              Math.max(
                                1,
                                Math.floor(Number(e.target.value) || 1),
                              ),
                            )
                          }
                        />
                      </div>
                      {!isEdit && installedQty > state.quantity && (
                        <p className="text-[11px] text-destructive">
                          Only {state.quantity} on the bench — lower the install
                          qty or raise Quantity owned.
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        The install is recorded on the airframe’s build sheet;
                        the part stays marked Installed in the bench list.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {specFields.length > 0 && (
            <div className="space-y-3 rounded-lg border border-primary/15 bg-muted/20 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[state.category]} specifications
              </div>
              <div className="grid grid-cols-2 gap-3">
                {specFields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`spec-${field.key}`}>
                      {field.label}
                      {field.suffix ? ` (${field.suffix})` : ""}
                    </Label>
                    <Input
                      id={`spec-${field.key}`}
                      type={field.type ?? "text"}
                      inputMode={
                        field.type === "number" ? "decimal" : undefined
                      }
                      value={state.specs[field.key] ?? ""}
                      onChange={(e) => setSpecValue(field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="part-notes">Notes</Label>
            <Textarea
              id="part-notes"
              value={state.notes}
              onChange={(e) =>
                setState((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Winding condition, crash history, spare props included…"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!state.name.trim() || isSubmitting}
            className="bg-primary hover:bg-primary/80 text-primary-foreground w-full sm:w-auto"
          >
            {isEdit ? "Save changes" : "Add to bench"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
