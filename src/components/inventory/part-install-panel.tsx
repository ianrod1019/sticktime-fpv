import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Crown,
  History,
  Link2,
  Lock,
  Skull,
  Unlink,
} from "lucide-react";
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
import { InventoryProBanner } from "./inventory-pro-banner";
import {
  REMOVAL_REASON_LABELS,
  formatMinutes,
  computeLifespan,
  type DronePart,
  type RemovalReason,
} from "@/lib/inventory";
import type { UsePartInstallsResult } from "@/hooks/inventory";

interface PartInstallPanelProps {
  part: DronePart;
  installs: UsePartInstallsResult;
}

/** Airframe install block inside the detail modal (Pro only). */
export function PartInstallPanel({ part, installs }: PartInstallPanelProps) {
  const [droneId, setDroneId] = useState("");
  const [quantity, setQuantity] = useState(1);

  if (!installs.hasProAccess) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Airframe installs
        </div>
        <InventoryProBanner compact />
        <p className="text-xs text-muted-foreground">
          Pro pilots can mount every spare on a specific quad and see which
          airframe each component lives on.
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-primary/40 text-primary"
        >
          <Link to="/settings">
            <Crown className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Unlock with Pro
          </Link>
        </Button>
      </div>
    );
  }

  const lifespan = computeLifespan(part, installs.installs);
  const availableDrones = installs.drones;
  const openInstalls = installs.installs.filter((i) => !i.uninstalled_at);
  const pastInstalls = installs.installs
    .filter((i) => i.uninstalled_at)
    .sort(
      (a, b) =>
        Date.parse(b.uninstalled_at ?? "") -
        Date.parse(a.uninstalled_at ?? ""),
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
        Airframe installs
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
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                  onClick={() => installs.uninstallPart(install.id, "broken")}
                  disabled={installs.isMutating}
                  title="The part died — mark it dead and end the install"
                >
                  <Skull className="mr-1 h-3 w-3" aria-hidden />
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
                  aria-label="Return part to the bench"
                  title="Part still works — return it to the bench"
                >
                  <Unlink className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-primary/20 p-3 text-xs text-muted-foreground">
          On the bench — not installed on any airframe.
        </p>
      )}

      {pastInstalls.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <History className="h-3 w-3" aria-hidden />
            Install history
          </div>
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
                  {REMOVAL_REASON_LABELS[
                    install.removal_reason ?? "other"
                  ]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1 space-y-1.5">
          <Label htmlFor="install-drone">Install on airframe</Label>
          <Select value={droneId} onValueChange={setDroneId}>
            <SelectTrigger id="install-drone" aria-label="Choose airframe">
              <SelectValue
                placeholder={
                  availableDrones.length === 0
                    ? "No drones registered"
                    : "Pick a quad"
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
          <Label htmlFor="install-qty">Qty</Label>
          <Input
            id="install-qty"
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

      <div className="flex flex-wrap items-center gap-2 border-t border-primary/10 pt-3">
        <Badge variant="outline" className="border-primary/30 text-primary">
          Lifespan: {formatMinutes(lifespan.minutesInstalled)}
        </Badge>
        <Badge variant="secondary">
          {lifespan.airframesUsed} airframe
          {lifespan.airframesUsed === 1 ? "" : "s"} used
        </Badge>
      </div>
    </div>
  );
}
