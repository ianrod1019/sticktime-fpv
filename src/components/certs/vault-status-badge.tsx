import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VaultDocumentStatus } from "@/types/certs";

/**
 * Visual-only. Never wire this into a gate that blocks booking or
 * scheduling — expiration here is a warning, not a lockout (see the
 * migration header comment).
 */
const STATUS_COPY: Record<VaultDocumentStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "border-transparent bg-secondary text-secondary-foreground" },
  expiring_soon: { label: "Expiring soon", className: "border-transparent bg-amber-500 text-white" },
  expired: { label: "Expired", className: "border-transparent bg-destructive text-destructive-foreground" },
};

export function VaultStatusBadge({ status }: { status: VaultDocumentStatus }) {
  const copy = STATUS_COPY[status];
  return <Badge className={cn(copy.className)}>{copy.label}</Badge>;
}
