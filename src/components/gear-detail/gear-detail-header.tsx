import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  DollarSign,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { GearItem } from "@/hooks/gear-item";

export const GEAR_TYPE_LABELS: Record<string, string> = {
  drone: "Drone / Quad",
  battery: "Battery Set",
  goggles: "FPV Goggles",
  goggle: "FPV Goggles",
  transmitter: "Controller / Radio",
  other: "Other Gear",
};

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface GearDetailHeaderProps {
  item: GearItem;
  canEdit: boolean;
  onEdit: () => void;
  /** Omit (or pass undefined) to hide the Service button (e.g. batteries). */
  onService?: (() => void) | undefined;
  onDelete: () => void;
  isMutating: boolean;
  /** Show flight-time / since-service stats (hidden for batteries). */
  showUsageStats?: boolean;
}

export function GearDetailHeader({
  item,
  canEdit,
  onEdit,
  onService,
  onDelete,
  isMutating,
  showUsageStats = true,
}: GearDetailHeaderProps) {
  const navigate = useNavigate();
  const typeLabel = GEAR_TYPE_LABELS[item.type] ?? item.type;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate({ to: "/hanger" })}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Hanger
      </button>

      <div className="hud-panel p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-primary/40 text-primary"
              >
                {typeLabel}
              </Badge>{" "}
              {!!item.crash_count && item.crash_count > 0 && (
                <Badge
                  variant="outline"
                  className="border-destructive/40 text-destructive"
                >
                  {item.crash_count} crashes
                </Badge>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground truncate">
              {item.name}
            </h1>
            {item.brand && (
              <p className="text-sm text-muted-foreground">{item.brand}</p>
            )}
          </div>

          {canEdit && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                disabled={isMutating}
                className="gap-2"
              >
                <CalendarDays className="h-4 w-4" aria-hidden />
                Edit
              </Button>
              {onService && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onService}
                  disabled={isMutating}
                  className="gap-2"
                >
                  <Wrench className="h-4 w-4" aria-hidden />
                  Service
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isMutating}
                    className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the gear, unlinks its sessions,
                      and deletes its parts and maintenance logs. This action
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HeaderStat
            icon={<DollarSign className="h-3.5 w-3.5" aria-hidden />}
            label="Cost"
            value={`$${Number(item.purchase_cost ?? 0).toFixed(2)}`}
          />
          <HeaderStat
            icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
            label="Added"
            value={formatDate(item.created_at)}
          />
          {showUsageStats && (
            <>
              <HeaderStat
                icon={<Wrench className="h-3.5 w-3.5" aria-hidden />}
                label="Flight Time"
                value={formatMinutes(item.total_minutes)}
              />
              <HeaderStat
                icon={<Wrench className="h-3.5 w-3.5" aria-hidden />}
                label="Since Service"
                value={formatMinutes(item.minutes_since_service)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-muted/30 border border-primary/10 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-mono text-sm text-foreground mt-0.5">{value}</div>
    </div>
  );
}
