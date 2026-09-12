import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Cpu, Layers, PackageOpen, Plus, Skull, Unlink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  summarizeBuild,
  linkPartToDrone,
  createPart,
  unlinkPartFromDrone,
  type InstalledPart,
} from "@/hooks/gear-item";
import { PartFormModal } from "@/components/inventory/part-form-modal";
import { useProAccess } from "@/hooks/inventory";
import type { PartInput } from "@/lib/inventory";
import { specLabel } from "./spec-grid";

function PartSummary({ parts }: { parts: InstalledPart[] }) {
  const { totalParts, byCategory } = useMemo(
    () => summarizeBuild(parts),
    [parts],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="border-primary/30 text-primary">
        <Layers className="h-3 w-3 mr-1" aria-hidden />
        {totalParts} component{totalParts === 1 ? "" : "s"} installed
      </Badge>
      {Object.entries(byCategory).map(([category, count]) => (
        <Badge key={category} variant="secondary" className="text-[10px]">
          {count}× {specLabel(category)}
        </Badge>
      ))}
    </div>
  );
}

interface DronePartsPanelProps {
  droneId: string;
  parts: InstalledPart[];
}

/**
 * Hardware breakdown for a single airframe. "Add hardware" creates the
 * component straight into the master inventory (personal_gear.drone_parts)
 * and immediately records the install on this drone
 * (personal_gear.drone_part_installs) in one step — no detour through the
 * bench inventory required.
 */
export function DronePartsPanel({ droneId, parts }: DronePartsPanelProps) {
  const queryClient = useQueryClient();
  const { hasProAccess } = useProAccess();
  const [formOpen, setFormOpen] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["drone-build", droneId] });

  const handleUnlink = async (linkId: string) => {
    setBusyLinkId(linkId);
    const ok = await unlinkPartFromDrone(linkId);
    setBusyLinkId(null);
    if (ok) {
      toast.success("Part returned to the bench");
      invalidate();
    } else {
      toast.error("Could not remove part");
    }
  };

  const handleDie = async (linkId: string, name: string) => {
    setBusyLinkId(linkId);
    const ok = await unlinkPartFromDrone(linkId, "broken");
    setBusyLinkId(null);
    if (ok) {
      toast.success(`${name} marked as dead`);
      invalidate();
    } else {
      toast.error("Could not update the part");
    }
  };

  const handleAddHardware = async (input: PartInput) => {
    const { part: created, error: createError } = await createPart({
      category: input.category,
      name: input.name,
      brand: input.brand ?? null,
      purchase_cost: input.purchase_cost ?? null,
      purchase_date: input.purchase_date ?? null,
      vendor: input.vendor ?? null,
    });
    if (!created) {
      toast.error(createError ?? "Could not create the part");
      return false;
    }
    const linked = await linkPartToDrone({
      droneId,
      partId: created.id,
      quantity: 1,
    });
    if (!linked) {
      toast.error("Part saved to the bench, but the install failed");
      invalidate();
      return false;
    }
    toast.success("Hardware installed on this airframe");
    invalidate();
    return true;
  };

  return (
    <Card className="bg-card/50 border-primary/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-primary text-base">
          <Cpu className="h-4 w-4" aria-hidden />
          Hardware Breakdown
        </CardTitle>
        {hasProAccess && (
          <Button
            size="sm"
            variant="outline"
            className="border-primary/40 text-primary"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Add hardware
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <PartSummary parts={parts} />

        {parts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">
            <PackageOpen className="h-5 w-5 shrink-0" aria-hidden />
            No hardware on this airframe yet.{" "}
            {hasProAccess
              ? "Use “Add hardware” to register a motor, VTX, AIO or any other component directly onto this build."
              : "Components from your bench inventory (Pro) can be installed here."}
          </div>
        ) : (
          <ul className="space-y-2">
            {parts.map(({ link_id, quantity, part }) => (
              <li
                key={link_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-primary/10 bg-muted/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {quantity > 1 ? `${quantity}× ` : ""}
                    {part.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {part.brand ? `${part.brand} · ` : ""}
                    {specLabel(part.category)}
                    {part.status && part.status !== "installed"
                      ? ` · ${part.status}`
                      : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                    onClick={() => handleDie(link_id, part.name)}
                    disabled={busyLinkId === link_id}
                    title="The part died — mark it dead and end the install"
                  >
                    <Skull className="mr-1 h-3 w-3" aria-hidden />
                    Died
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleUnlink(link_id)}
                    disabled={busyLinkId === link_id}
                    aria-label={`Remove ${part.name} from build`}
                    title="Part still works — return it to the bench"
                  >
                    <Unlink className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <PartFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleAddHardware}
        suppressInstallSection
        suppressStatusField
      />
    </Card>
  );
}
