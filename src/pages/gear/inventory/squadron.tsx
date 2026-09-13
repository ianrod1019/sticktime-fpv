import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorPanel,
  LoadingPanel,
} from "@/components/state-panels";
import {
  InventoryFilterBar,
  InventoryStatsBar,
  PartCard,
  PartDetailModal,
  PartFormModal,
  OrgPartInstallPanel,
} from "@/components/inventory";
import { useSquadronInventory, useOrgPartInstalls } from "@/hooks/inventory";
import { GearScopeProvider } from "@/lib/gear-scope";
import type { DronePart, PartInput } from "@/lib/inventory";

/**
 * Squadron bench inventory — the shared org twin of the personal Bench
 * Inventory. Reads org_gear.drone_parts: every member catalogs parts and
 * records installs; money fields (purchase cost/date/vendor) and deletion
 * of financial records stay owner/manager-locked by the org money-lock
 * trigger, mirrored in the UI via canEditMoney.
 */
export function SquadronInventoryPage({ teamId }: { teamId: string }) {
  return (
    <GearScopeProvider scope={{ kind: "org", teamId }}>
      <SquadronInventoryInner teamId={teamId} />
    </GearScopeProvider>
  );
}

function SquadronInventoryInner({ teamId }: { teamId: string }) {
  const inv = useSquadronInventory(teamId);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<DronePart | null>(null);
  const [detailPart, setDetailPart] = useState<DronePart | null>(null);

  const handleSubmit = async (input: PartInput) => {
    if (editingPart) {
      return inv.updatePart(editingPart.id, input);
    }
    return inv.addPart(input);
  };

  const openAdd = () => {
    setEditingPart(null);
    setFormOpen(true);
  };

  const openEdit = (part: DronePart) => {
    setDetailPart(null);
    setEditingPart(part);
    setFormOpen(true);
  };

  if (inv.isLoadingMembership) {
    return <LoadingPanel label="Checking squadron access…" />;
  }

  if (inv.notMember) {
    return (
      <EmptyState
        icon={Plus}
        title="Not your squadron"
        description="You are not a member of this squadron, so its shared bench is not available."
      />
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title={`Squadron Bench — ${inv.teamName ?? "loading…"}`}
        subtitle="The squadron's shared spare-parts bench. Members catalog and install together; money fields are owner/manager-locked."
        action={
          inv.canWrite ? (
            <Button
              onClick={openAdd}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-[inset_0_1px_0_oklch(1_0_0/0.18),0_1px_2px_oklch(0_0_0/0.3),0_6px_16px_-8px_var(--primary)]"
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add part
            </Button>
          ) : undefined
        }
      />

      <InventoryFilterBar
        category={inv.filters.category}
        status={inv.filters.status}
        search={inv.filters.search}
        resultCount={inv.parts.length}
        onCategoryChange={inv.setCategory}
        onStatusChange={inv.setStatus}
        onSearchChange={inv.setSearch}
        onReset={inv.resetFilters}
      />

      {inv.parts.length > 0 && <InventoryStatsBar parts={inv.parts} />}

      {inv.pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inv.setPage(inv.pageIndex - 1)}
            disabled={inv.pageIndex === 0}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            Page {inv.pageIndex + 1} of {inv.pageCount}
            {inv.total > 0 ? ` · ${inv.total} parts` : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => inv.setPage(inv.pageIndex + 1)}
            disabled={inv.pageIndex >= inv.pageCount - 1}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {inv.isLoading ? (
        <LoadingPanel label="Loading the squadron bench…" />
      ) : inv.isError ? (
        <ErrorPanel
          message="Could not load the squadron bench. Check your connection and try again."
          onRetry={inv.resetFilters}
        />
      ) : inv.parts.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="The squadron bench is empty"
          description="Add the squad's shared motors, VTXs, AIOs, frames and other spares here — every member sees and manages them."
          action={
            inv.canWrite ? (
              <Button
                onClick={openAdd}
                className="bg-primary hover:bg-primary/80 text-primary-foreground"
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add the first
                part
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {inv.parts.map((part) => (
            <PartCard key={part.id} part={part} onClick={setDetailPart} />
          ))}
        </div>
      )}

      <PartFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        part={editingPart}
        // Org money lock: plain members never send purchase fields; the
        // money-lock trigger rejects non-manager writes anyway.
        suppressPurchaseFields={!inv.canEditMoney}
        suppressInstallSection
      />

      {detailPart && (
        <OrgPartDetailBridge
          teamId={teamId}
          part={detailPart}
          onOpenChange={(open) => {
            if (!open) setDetailPart(null);
          }}
          onEdit={openEdit}
          onDelete={async (part) => {
            await inv.deletePart(part.id);
          }}
          canEditMoney={inv.canEditMoney}
          canWrite={inv.canWrite}
        />
      )}
    </div>
  );
}

/** Loads org installs only while a part's detail modal is open. */
function OrgPartDetailBridge({
  teamId,
  part,
  onOpenChange,
  onEdit,
  onDelete,
  canEditMoney,
  canWrite,
}: {
  teamId: string;
  part: DronePart;
  onOpenChange: (open: boolean) => void;
  onEdit: (part: DronePart) => void;
  onDelete: (part: DronePart) => Promise<void> | void;
  canEditMoney: boolean;
  canWrite: boolean;
}) {
  const installs = useOrgPartInstalls(teamId, part.id);

  return (
    <PartDetailModal
      open
      onOpenChange={onOpenChange}
      part={part}
      onEdit={onEdit}
      onDelete={onDelete}
      suppressPurchaseInfo={!canEditMoney}
      canEdit={canWrite}
      installPanel={
        <OrgPartInstallPanel teamId={teamId} part={part} installs={installs} />
      }
    />
  );
}
