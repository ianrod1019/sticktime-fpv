import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db_request } from "@/lib/db_request";
import { sanitizePartInput } from "@/lib/sanitize";
import { usePilot } from "@/hooks/use-pilot";
import {
  PARTS_TABLE,
  type DronePart,
  type PartInput,
  type PartCategory,
  type PartStatus,
} from "@/lib/inventory";

export type CategoryFilter = PartCategory | "all";
export type StatusFilter = PartStatus | "all";

export interface InventoryFilters {
  category: CategoryFilter;
  status: StatusFilter;
  search: string;
}

export const DEFAULT_FILTERS: InventoryFilters = {
  category: "all",
  status: "all",
  search: "",
};

const INVENTORY_KEY = "master-inventory";

/**
 * The bench reads the whole parts list through the delta-sync layer (warm
 * visits transfer 0 rows) and filters/paginates client-side — changing a
 * filter or page refetches nothing. The row cache degrades gracefully to
 * paged streaming above 2000 parts, so the bench never loads unbounded.
 */
export function invalidateInventory(queryClient: {
  invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void;
}) {
  queryClient.invalidateQueries({ queryKey: [INVENTORY_KEY] });
}

export interface UseInventoryResult {
  parts: DronePart[];
  total: number;
  pageIndex: number;
  pageCount: number;
  setPage: (index: number) => void;
  isLoading: boolean;
  isError: boolean;
  filters: InventoryFilters;
  setCategory: (category: CategoryFilter) => void;
  setStatus: (status: StatusFilter) => void;
  setSearch: (search: string) => void;
  resetFilters: () => void;
  addPart: (input: PartInput) => Promise<string | false>;
  updatePart: (id: string, input: Partial<PartInput>) => Promise<boolean>;
  deletePart: (id: string) => Promise<boolean>;
  isMutating: boolean;
}

export function useInventory(): UseInventoryResult {
  const queryClient = useQueryClient();
  const { profile } = usePilot();
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS);
  const [pageIndex, setPageIndex] = useState(0);

  const query = useQuery({
    queryKey: [INVENTORY_KEY, profile?.id ?? null],
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: PARTS_TABLE,
        operation: "select",
        selectColumns: "*",
        orderBy: { column: "created_at", ascending: false },
        sync: "delta",
      });
      if (error) throw error;
      return (data ?? []) as DronePart[];
    },
    enabled: !!profile?.id,
    staleTime: 30_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [INVENTORY_KEY] });

  const addPart = useMutation({
    mutationFn: async (input: PartInput) => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: PARTS_TABLE,
        operation: "insert",
        data: { ...sanitizePartInput(input), specs: input.specs ?? {} },
        single: true,
      });
      if (error) throw error;
      return data as DronePart;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Part added to the bench");
    },
    onError: (e: Error) => toast.error(e.message || "Could not add part"),
  });

  const updatePart = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: Partial<PartInput>;
    }) => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: PARTS_TABLE,
        operation: "update",
        data: sanitizePartInput(input),
        filters: { id },
        single: true,
      });
      if (error) throw error;
      return data as DronePart;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Part updated");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update part"),
  });

  const deletePart = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db_request({
        mode: "query",
        schema: "personal_gear",
        table: PARTS_TABLE,
        operation: "delete",
        filters: { id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Part removed from inventory");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete part"),
  });

  const isMutating =
    addPart.isPending || updatePart.isPending || deletePart.isPending;

  // ---- Client-side filter + pagination (0 network on change) --------------
  const allParts = query.data ?? [];
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    if (filters.category === "all" && filters.status === "all" && !q) {
      return allParts;
    }
    return allParts.filter((part) => {
      if (filters.category !== "all" && part.category !== filters.category) {
        return false;
      }
      if (filters.status !== "all" && part.status !== filters.status) {
        return false;
      }
      if (
        q &&
        !part.name.toLowerCase().includes(q) &&
        !(part.brand ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [allParts, filters]);

  const pageCount = Math.max(
    1,
    Math.ceil(filtered.length / INVENTORY_PAGE_SIZE),
  );
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const parts = useMemo(
    () =>
      filtered.slice(
        safePageIndex * INVENTORY_PAGE_SIZE,
        (safePageIndex + 1) * INVENTORY_PAGE_SIZE,
      ),
    [filtered, safePageIndex],
  );

  const bumpToFirstPage = (
    updater: (prev: InventoryFilters) => InventoryFilters,
  ) => {
    setFilters(updater);
    setPageIndex(0);
  };

  return {
    parts,
    total: filtered.length,
    pageIndex: safePageIndex,
    pageCount,
    setPage: setPageIndex,
    isLoading: query.isLoading,
    isError: query.isError,
    filters,
    setCategory: (category) =>
      bumpToFirstPage((prev) => ({ ...prev, category })),
    setStatus: (status) => bumpToFirstPage((prev) => ({ ...prev, status })),
    setSearch: (search) => bumpToFirstPage((prev) => ({ ...prev, search })),
    resetFilters: () => {
      setFilters(DEFAULT_FILTERS);
      setPageIndex(0);
    },
    // Resolves to the new part's id (or false) so callers can immediately
    // link the freshly created part to an airframe.
    addPart: (input) =>
      addPart.mutateAsync(input).then((created) => created?.id ?? false),
    updatePart: (id, input) =>
      updatePart.mutateAsync({ id, input }).then(() => true),
    deletePart: (id) => deletePart.mutateAsync(id).then(() => true),
    isMutating,
  };
}

/** Client-side page size for the bench inventory grid. */
export const INVENTORY_PAGE_SIZE = 60;
