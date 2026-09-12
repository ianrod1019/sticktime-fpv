import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { db_request } from "@/lib/db_request";
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

/** Server-side page size for the bench inventory grid. */
export const INVENTORY_PAGE_SIZE = 60;

export function invalidateInventory(queryClient: {
  invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void;
}) {
  queryClient.invalidateQueries({ queryKey: [INVENTORY_KEY] });
}

interface FetchPartsArgs {
  filters: InventoryFilters;
  pageIndex: number;
}

async function fetchPartsPage({
  filters,
  pageIndex,
}: FetchPartsArgs): Promise<{ parts: DronePart[]; total: number }> {
  const filters_: Record<string, unknown> = {};
  if (filters.category !== "all") filters_["category"] = filters.category;
  if (filters.status !== "all") filters_["status"] = filters.status;
  if (filters.search.trim()) {
    // Server-side substring match on name/brand (PostgREST `ilike.*term*`).
    const term = filters.search.trim();
    filters_['or'] = `(name.ilike.*${term}*,brand.ilike.*${term}*)`;
  }

  const { data, error, count } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table: PARTS_TABLE,
    operation: "select",
    selectColumns: "*",
    filters: filters_,
    orderBy: { column: "created_at", ascending: false },
    pagination: { index: pageIndex, size: INVENTORY_PAGE_SIZE },
  });

  if (error) throw error;
  return { parts: (data ?? []) as DronePart[], total: count ?? 0 };
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
    queryKey: [
      INVENTORY_KEY,
      profile?.id ?? null,
      filters.category,
      filters.status,
      filters.search,
      pageIndex,
    ],
    queryFn: () => fetchPartsPage({ filters, pageIndex }),
    enabled: !!profile?.id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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
        data: { ...input, specs: input.specs ?? {} },
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
        data: input,
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

  const parts = query.data?.parts ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / INVENTORY_PAGE_SIZE));

  const bumpToFirstPage = (
    updater: (prev: InventoryFilters) => InventoryFilters,
  ) => {
    setFilters(updater);
    setPageIndex(0);
  };

  return {
    parts,
    total,
    pageIndex,
    pageCount,
    setPage: setPageIndex,
    isLoading: query.isLoading,
    isError: query.isError,
    filters,
    setCategory: (category) => bumpToFirstPage((prev) => ({ ...prev, category })),
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
