import { useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REMOVAL_REASON_LABELS, type DronePart } from "@/lib/inventory";
import type { UseOrgPartInstallsResult } from "@/hooks/inventory";

interface OrgPartInstallPanelProps {
  teamId: string;
  part: DronePart;
  installs: UseOrgPartInstallsResult;
}

/**
 * Squadron install block inside the part detail modal: installs land on the
 * SQUADRON's airframes (org_gear), not the pilot's own hangar. Members can
 * install/uninstall; the shared history is visible to the whole team.
 */
export function OrgPartInstallPanel({
  teamId,
  part,
  installs,
}: OrgPartInstallPanelProps) {
  const [droneId, setDroneId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const availableDrones = installs.drones;
  const openInstalls = installs.installs.filter((i) => !i.uninstalled_at);
  const pastInstalls = installs.installs
    .filter((i) => i.uninstalled_at)
    .sort(
      (a, b) =>
        Date.parse(b.uninstalled_at ?? "") - Date.parse(a.uninstalled_at ?? ""),
    );

  const handleInstall = async () => {
    const ok = await installs.installPart(droneId, quantity);
    if (ok) {
      setDroneId("");
      setQuantity(1);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        Squadron airframe installs
      </div>

      {openInstalls.length > 0 ? (
        <ul className="space-y-2">
          {openInstalls.map((install) => (
            <li
              key={install.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-primary/15 bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-foreground">
                  {install.quantity > 1 ? `${install.quantity}× ` : ""}
                  installed
                </div>
                <div className="text-[11px] text-muted-foreground">
                  since {new Date(install.installed_at).toLocaleDateString()}
                </div>
              </div>
              {installs.canWrite && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                    onClick={() => installs.uninstallPart(install.id, "broken")}
                    disabled={installs.isMutating}
                    title="The part died — mark it dead and end the install"
                  >
                    Died
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      installs.uninstallPart(install.id, "maintenance")
                    }
                    disabled={installs.isMutating}
                    aria-label="Return part to the squadron bench"
                    title="Part still works — return it to the squadron bench"
                  >
                    <Unlink className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-primary/20 p-3 text-xs text-muted-foreground">
          On the squadron bench — not installed on any airframe.
        </p>
      )}

      {pastInstalls.length > 0 && (
        <ul className="space-y-1">
          {pastInstalls.map((install) => (
            <li
              key={install.id}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground"
            >
              <span>
                {install.quantity > 1 ? `${install.quantity}× ` : ""}
                {new Date(install.installed_at).toLocaleDateString()} →{" "}
                {new Date(install.uninstalled_at ?? "").toLocaleDateString()}
              </span>
              <Badge
                variant="outline"
                className={
                  install.removal_reason === "broken"
                    ? "border-destructive/40 text-destructive text-[9px]"
                    : "text-[9px]"
                }
              >
                {REMOVAL_REASON_LABELS[install.removal_reason ?? "other"]}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {installs.canWrite && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <Label htmlFor="org-install-drone">Install on airframe</Label>
            <Select value={droneId} onValueChange={setDroneId}>
              <SelectTrigger
                id="org-install-drone"
                aria-label="Choose airframe"
              >
                <SelectValue
                  placeholder={
                    availableDrones.length === 0
                      ? "No squadron drones yet"
                      : "Pick a squad quad"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableDrones.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-20 space-y-1.5">
            <Label htmlFor="org-install-qty">Qty</Label>
            <Input
              id="org-install-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </div>
          <Button
            size="sm"
            onClick={handleInstall}
            disabled={!droneId || installs.isMutating}
          >
            Install
          </Button>
        </div>
      )}
    </div>
  );
}
