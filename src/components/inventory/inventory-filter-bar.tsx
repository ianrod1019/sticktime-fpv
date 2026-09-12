import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_LABELS,
  PART_CATEGORIES,
  PART_STATUSES,
  STATUS_LABELS,
  type PartCategory,
  type PartStatus,
} from "@/lib/inventory";
import type { CategoryFilter, StatusFilter } from "@/hooks/inventory";

interface InventoryFilterBarProps {
  category: CategoryFilter;
  status: StatusFilter;
  search: string;
  resultCount: number;
  onCategoryChange: (value: CategoryFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onSearchChange: (value: string) => void;
  onReset: () => void;
}

/**
 * Real-time filtering controls for the master inventory grid. Filters apply
 * instantly (category/status server-side, search client-side).
 */
export function InventoryFilterBar({
  category,
  status,
  search,
  resultCount,
  onCategoryChange,
  onStatusChange,
  onSearchChange,
  onReset,
}: InventoryFilterBarProps) {
  const isFiltered =
    category !== "all" || status !== "all" || search.trim() !== "";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-card/40 p-4 lg:flex-row lg:items-center">
      <div className="relative flex-1 min-w-[180px]">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name, brand or specs…"
          className="pl-9"
          aria-label="Search inventory"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={category}
          onValueChange={(v) => onCategoryChange(v as CategoryFilter)}
        >
          <SelectTrigger className="w-[160px]" aria-label="Filter by category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {PART_CATEGORIES.map((c: PartCategory) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => onStatusChange(v as StatusFilter)}
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PART_STATUSES.map((s: PartStatus) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span
          className="label-mono text-xs text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {resultCount} part{resultCount === 1 ? "" : "s"}
        </span>

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 px-2 text-muted-foreground"
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
