import { useState } from "react";
import { toast } from "sonner";
import { Download, ShieldCheck, Trash2, Upload } from "lucide-react";
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
import {
  useDeleteVaultDocument,
  useUploadVaultDocument,
  useVaultDocuments,
  useVerifyVaultDocument,
} from "@/hooks/certs/use-vault-documents";
import { getVaultFileUrl } from "@/lib/certs/storage";
import {
  VAULT_DOCUMENT_TYPES,
  VAULT_DOCUMENT_TYPE_LABELS,
  type VaultDocumentType,
} from "@/types/certs";
import { VaultStatusBadge } from "./vault-status-badge";

/**
 * The Certification & Waiver Vault. `canManage` is the caller's
 * squadron_admin/district_admin/site_admin status for this org (e.g.
 * from useMyEnterprises()'s my_role !== 'pilot') — it only changes what
 * renders, never what the server allows; RLS is the real gate.
 *
 * Expiration badges are informational. This component never disables
 * booking or scheduling based on status — see the migration header.
 */
export function VaultPanel({
  orgId,
  canManage,
}: {
  orgId: string;
  canManage: boolean;
}) {
  const { data: docs, isLoading } = useVaultDocuments(orgId);
  const upload = useUploadVaultDocument(orgId);
  const remove = useDeleteVaultDocument(orgId);
  const verify = useVerifyVaultDocument(orgId);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<VaultDocumentType>("part_107");
  const [issueDate, setIssueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");

  const resetForm = () => {
    setFile(null);
    setDocumentType("part_107");
    setIssueDate("");
    setExpirationDate("");
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      await upload.mutateAsync({
        file,
        draft: {
          document_type: documentType,
          issue_date: issueDate || null,
          expiration_date: expirationDate || null,
        },
      });
      toast.success("Document uploaded.");
      setOpen(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const url = await getVaultFileUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open file.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Certification & Waiver Vault</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload a document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Document type</Label>
                <Select
                  value={documentType}
                  onValueChange={(v) => setDocumentType(v as VaultDocumentType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAULT_DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {VAULT_DOCUMENT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>File (PDF or image)</Label>
                <Input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Issue date</Label>
                  <Input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Expiration date</Label>
                  <Input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleUpload}
                disabled={!file || upload.isPending}
              >
                {upload.isPending ? "Uploading…" : "Upload"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && docs?.length === 0 && (
          <p className="text-sm text-muted-foreground">No documents on file yet.</p>
        )}
        {docs?.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-md border p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {VAULT_DOCUMENT_TYPE_LABELS[doc.document_type]}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {doc.file_name}
                {doc.expiration_date ? ` · expires ${doc.expiration_date}` : ""}
                {doc.verified_at ? " · verified" : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <VaultStatusBadge status={doc.status} />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDownload(doc.file_path)}
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
              {canManage && !doc.verified_at && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => verify.mutate(doc.id)}
                  aria-label="Verify"
                >
                  <ShieldCheck className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove.mutate(doc)}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
