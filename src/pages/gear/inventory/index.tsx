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
  InventoryProBanner,
  InventoryStatsBar,
  PartCard,
  PartDetailModal,
  PartFormModal,
} from "@/components/inventory";
import { useInventory, type InventoryFilters } from "@/hooks/inventory";
import { useProAccess } from "@/hooks/inventory";
import type { DronePart, PartInput } from "@/lib/inventory";

/**
 * Master inventory dashboard — the global bench of every hardware component
 * the pilot owns (personal_gear.drone_parts). Basic cataloging is free;
 * relational assignment + lifespan analytics are Pro-gated at component level.
 */
export function InventoryPage() {
  const inventory = useInventory();
  const { hasProAccess } = useProAccess();

  const [formOpen, setFormOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<DronePart | null>(null);
  const [detailPart, setDetailPart] = useState<DronePart | null>(null);

  const handleSubmit = async (input: PartInput) => {
    if (editingPart) {
      return inventory.updatePart(editingPart.id, input);
    }
    return inventory.addPart(input);
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

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Bench Inventory"
        subtitle="Your global master inventory of motors, AIOs, frames and every other spare — cataloged in one place."
        action={
          <Button
            onClick={openAdd}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-[inset_0_1px_0_oklch(1_0_0/0.18),0_1px_2px_oklch(0_0_0/0.3),0_6px_16px_-8px_var(--primary)]"
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add part
          </Button>
        }
      />

      {!hasProAccess && <InventoryProBanner />}

      <InventoryFilterBar
        category={inventory.filters.category}
        status={inventory.filters.status}
        search={inventory.filters.search}
        resultCount={inventory.parts.length}
        onCategoryChange={inventory.setCategory}
        onStatusChange={inventory.setStatus}
        onSearchChange={inventory.setSearch}
        onReset={inventory.resetFilters}
      />

      {inventory.parts.length > 0 && (
        <InventoryStatsBar parts={inventory.parts} />
      )}

      {inventory.pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inventory.setPage(inventory.pageIndex - 1)}
            disabled={inventory.pageIndex === 0}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            Page {inventory.pageIndex + 1} of {inventory.pageCount}
            {inventory.total > 0 ? ` · ${inventory.total} parts` : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => inventory.setPage(inventory.pageIndex + 1)}
            disabled={inventory.pageIndex >= inventory.pageCount - 1}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {inventory.isLoading ? (
        <LoadingPanel label="Loading the bench…" />
      ) : inventory.isError ? (
        <ErrorPanel
          message="Could not load your inventory. Check your connection and try again."
          onRetry={inventory.resetFilters}
        />
      ) : inventory.parts.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No parts match your bench yet"
          description="Add motors, VTXs, AIOs, frames and other components here, then (with Pro) attach them to specific airframes."
          action={
            <Button
              onClick={openAdd}
              className="bg-primary hover:bg-primary/80 text-primary-foreground"
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add your first
              part
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {inventory.parts.map((part) => (
            <PartCard key={part.id} part={part} onClick={setDetailPart} />
          ))}
        </div>
      )}

      <PartFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        part={editingPart}
      />

      <PartDetailModal
        open={detailPart !== null}
        onOpenChange={(open) => {
          if (!open) setDetailPart(null);
        }}
        part={detailPart}
        onEdit={openEdit}
        onDelete={async (part) => {
          await inventory.deletePart(part.id);
        }}
      />
    </div>
  );
}

export type { InventoryFilters };
