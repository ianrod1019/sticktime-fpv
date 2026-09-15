import { useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Link as LinkIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/state-panels";
import {
  useCreateDelivery,
  useDeleteDelivery,
  useDeleteDeliveryFile,
  useDeliveryFiles,
  useOrgDeliveries,
  useUploadDeliveryFile,
  deliveryLinkFor,
} from "@/hooks/portals/use-deliveries";
import { getDeliveryFileUrl } from "@/lib/portals/storage";
import {
  DELIVERY_EXPIRATION_DAYS,
  formatBytes,
  type Delivery,
  type DeliveryExpirationDays,
} from "@/types/portals";

function isExpired(delivery: Delivery): boolean {
  return new Date(delivery.expires_at).getTime() < Date.now();
}

/**
 * The internal delivery-portal dashboard. Any org member can create
 * and manage the org's portals — RLS (portals.deliveries policies) is
 * the real gate; this component only renders what the server allows.
 */
export function DeliveryPortalDashboard({ orgId }: { orgId: string }) {
  const { data: deliveries, isLoading } = useOrgDeliveries(orgId);
  const create = useCreateDelivery(orgId);
  const remove = useDeleteDelivery(orgId);

  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<DeliveryExpirationDays>(7);
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#6366f1");
  const [agencyName, setAgencyName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = () => {
    setClientName("");
    setProjectTitle("");
    setExpiresInDays(7);
    setLogoUrl("");
    setBrandColor("#6366f1");
    setAgencyName("");
  };

  const handleCreate = async () => {
    if (!clientName.trim() || !projectTitle.trim()) return;
    try {
      const branding_config: import("@/types/portals").BrandingConfig = {};
      if (logoUrl.trim()) branding_config.logo_url = logoUrl.trim();
      if (brandColor.trim()) branding_config.brand_color = brandColor.trim();
      if (agencyName.trim()) branding_config.agency_name = agencyName.trim();

      await create.mutateAsync({
        client_name: clientName.trim(),
        project_title: projectTitle.trim(),
        expires_in_days: expiresInDays,
        branding_config,
      });
      toast.success("Delivery portal created.");
      setOpen(false);
      resetForm();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the portal.",
      );
    }
  };

  const copyLink = (token: string) => {
    void navigator.clipboard.writeText(deliveryLinkFor(token));
    toast.success("Link copied.");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Client Delivery Portals</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <LinkIcon className="mr-2 h-4 w-4" />
              New delivery
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New delivery portal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Client name</Label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div>
                <Label>Project title</Label>
                <Input
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                />
              </div>
              <div>
                <Label>Link expires in</Label>
                <Select
                  value={String(expiresInDays)}
                  onValueChange={(v) =>
                    setExpiresInDays(Number(v) as DeliveryExpirationDays)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_EXPIRATION_DAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Agency name</Label>
                  <Input
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Brand color</Label>
                  <Input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-9 p-1"
                  />
                </div>
              </div>
              <div>
                <Label>Logo URL</Label>
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={
                  !clientName.trim() || !projectTitle.trim() || create.isPending
                }
              >
                {create.isPending ? "Creating…" : "Create portal"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && deliveries?.length === 0 && (
          <EmptyState
            icon={LinkIcon}
            title="No delivery portals yet"
            description="Create one to hand a branded, expiring link to a client."
          />
        )}
        {deliveries?.map((delivery) => (
          <div key={delivery.delivery_id} className="rounded-md border">
            <div className="flex items-center justify-between gap-3 p-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() =>
                  setExpandedId((id) =>
                    id === delivery.delivery_id ? null : delivery.delivery_id,
                  )
                }
              >
                {expandedId === delivery.delivery_id ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {delivery.project_title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {delivery.client_name}
                  </p>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={isExpired(delivery) ? "outline" : "default"}>
                  {isExpired(delivery)
                    ? "Expired"
                    : `Expires ${new Date(delivery.expires_at).toLocaleDateString()}`}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyLink(delivery.access_token)}
                  aria-label="Copy link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove.mutate(delivery.delivery_id)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {expandedId === delivery.delivery_id && (
              <DeliveryFilesPanel delivery={delivery} />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DeliveryFilesPanel({ delivery }: { delivery: Delivery }) {
  const { data: files, isLoading } = useDeliveryFiles(delivery.delivery_id);
  const upload = useUploadDeliveryFile(delivery);
  const remove = useDeleteDeliveryFile(delivery);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success("File uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const handlePreview = async (path: string) => {
    try {
      const url = await getDeliveryFileUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open file.");
    }
  };

  return (
    <div className="space-y-2 border-t bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Files
        </Label>
        <label>
          <Button size="sm" variant="outline" asChild>
            <span>
              <Upload className="mr-2 h-3.5 w-3.5" />
              {upload.isPending ? "Uploading…" : "Add file"}
            </span>
          </Button>
          <input
            type="file"
            className="hidden"
            disabled={upload.isPending}
            onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!isLoading && files?.length === 0 && (
        <p className="text-xs text-muted-foreground">No files attached yet.</p>
      )}
      {files?.map((f) => (
        <div
          key={f.file_id}
          className="flex items-center justify-between gap-3 rounded border bg-background p-2"
        >
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm"
            onClick={() => void handlePreview(f.storage_path)}
          >
            {f.file_name}
          </button>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatBytes(f.file_size)}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => remove.mutate(f)}
            aria-label="Delete file"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
