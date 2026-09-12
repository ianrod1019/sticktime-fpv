import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProWall } from "@/components/auth/pro-wall";
import {
  Trash2,
  Pencil,
  Check,
  X,
  ExternalLink,
  Clock3,
  Tag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell";
import {
  type HangerItem,
  getHangerTypeLabel,
  getHangerTypeColor,
  type HangerItemResult,
} from "@/hooks/useHangerItem";

interface HangerHeaderProps {
  type: string;
  item: HangerItem;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function HangerHeader({ type, item, canEdit = false, canDelete = false }: HangerHeaderProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editBrand, setEditBrand] = useState(item.brand ?? "");

  const handleEditSave = async () => {
    if (!editName.trim() || !item) return;
    // TODO: Implement update via db_request or use a mutation hook
    setEditName(item.name);
    setEditBrand(item.brand ?? "");
    setIsEditDialogOpen(false);
  };

  const handleStartDelete = () => {
    setIsConfirmingDelete(true);
  };

  const handleCancelDelete = () => {
    setIsConfirmingDelete(false);
  };

  const handleConfirmDelete = async () => {
    // TODO: Implement delete via db_request or use a mutation hook
    setIsConfirmingDelete(false);
  };

  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={`${getHangerTypeLabel(type)} • ${item.total_minutes}m total`}
        action={
          <>
            <ProWall
              featureName="Edit Gear"
              description="Editing gear details requires a Pro subscription."
              allowAdminOverride
            >
              <Dialog
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                    aria-label="Edit gear"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-primary/30 bg-background/95">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-foreground font-display">
                      <span className="w-2 h-2 rounded-full bg-primary"></span>
                      Edit {getHangerTypeLabel(type)}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">Name</Label>
                      <Input
                        id="edit-name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Gear name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-brand">Brand</Label>
                      <Input
                        id="edit-brand"
                        value={editBrand}
                        onChange={(e) => setEditBrand(e.target.value)}
                        placeholder="Brand / Manufacturer"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                      <span>Item ID: {item.id}</span>
                      <span>
                        Last updated:{" "}
                        {new Date(item.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleEditSave}
                      disabled={!editName.trim()}
                    >
                      Save changes
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </ProWall>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/20"
              onMouseEnter={handleStartDelete}
              onMouseLeave={handleCancelDelete}
              onClick={handleConfirmDelete}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-card/50 rounded-xl border border-primary/10">
        <div className="flex items-start gap-3">
          <div
            className={`${getHangerTypeColor(type)} h-10 w-10 flex items-center justify-center rounded-full shrink-0`}
          >
            {type === "drone" ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M3 3l18 18M3 21l18-18"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
            ) : type === "battery" ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <rect
                  x="2"
                  y="7"
                  width="20"
                  height="10"
                  rx="2"
                  strokeWidth={2}
                />
                <path
                  d="M12 2v5"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : type === "goggles" ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="10" strokeWidth={2} />
                <path d="M8 8l8 8" strokeWidth={2} strokeLinecap="round" />
              </svg>
            ) : type === "transmitter" ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <rect
                  x="4"
                  y="4"
                  width="16"
                  height="16"
                  rx="2"
                  strokeWidth={2}
                />
                <path d="M8 12h8" strokeWidth={2} strokeLinecap="square" />
                <path d="M12 8v8" strokeWidth={2} strokeLinecap="square" />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M5 5l14 14M5 19l14-14"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">
              {item.name}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {item.brand ? (
                <span className="text-primary font-medium">{item.brand}</span>
              ) : (
                ""
              )}
              {item.brand ? " · " : ""}
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0 border-primary/30 text-primary"
              >
                {getHangerTypeLabel(type)}
              </Badge>
            </p>
          </div>
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            <span>Status: Active</span>
          </div>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span>
              Created: {new Date(item.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <span>Record ID: {item.id.slice(0, 8)}...</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg border border-border">
        <div className="text-center">
          <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
            Total Time
          </div>
          <div className="font-mono font-medium text-foreground">
            {item.total_minutes}m
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
            Packs
          </div>
          <div className="font-mono font-medium text-foreground">
            {item.pack_count}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
            Crashes
          </div>
          <div className="font-mono font-medium text-foreground">
            {item.crash_count}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
            Service
          </div>
          <div className="font-mono font-medium text-foreground">
            {item.service_interval_minutes > 0
              ? `${Math.round((item.minutes_since_service / item.service_interval_minutes) * 100)}%`
              : "As needed"}
          </div>
        </div>
      </div>
    </>
  );
}
