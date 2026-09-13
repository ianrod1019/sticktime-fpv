import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db_request } from "@/lib/db_request";
import { sanitizePartInput } from "@/lib/sanitize";
import { useGearScopeContext } from "@/lib/gear-scope";
import {
  PARTS_TABLE,
  type DronePart,
  type PartInput,
  type PartCategory,
  type PartStatus,
} from "@/lib/inventory";
import {
  INVENTORY_PAGE_SIZE,
  DEFAULT_FILTERS,
  type InventoryFilters,
  type CategoryFilter,
  type StatusFilter,
} from "./use-inventory";

export type { InventoryFilters, CategoryFilter, StatusFilter };
export { DEFAULT_FILTERS };

const SQUAD_INVENTORY_KEY = "squadron-inventory";

/**
 * Squadron bench inventory — the org twin of `useInventory`.
 *
 * Reads org_gear.drone_parts (the shared, team-owned parts table). Every
 * request pins the pull to THIS squadron (`team_id` filter): a pilot can be
 * a member of several teams and org RLS only checks membership, so an
 * unfiltered select would mix every squad's bench into one team-keyed
 * delta-sync cache. Reads go through the delta-sync layer with the TEAM as
 * scope — warm visits transfer 0 rows no matter which member is looking.
 *
 * Permissions come from GearScope (resolved from team_members):
 *  - every member reads + writes (cataloging, status, specs)
 *  - money fields (purchase_cost / purchase_date / vendor) are owner/
 *    manager only — enforced by the org money-lock trigger, and the UI
 *    hides/disables them via `canEditMoney`.
 */
/** Minimal structural subset of UseInventoryResult the page consumes. */
interface UseInventoryShape {
  parts: DronePart[];
  total: number;
  pageIndex: number;
  pageCount: number;
  setPage: (index: number) => void;
  isLoading: boolean;
  isError: boolean;
  filters: InventoryFilters;
  setCategory: (category: PartCategory | "all") => void;
  setStatus: (status: PartStatus | "all") => void;
  setSearch: (search: string) => void;
  resetFilters: () => void;
  addPart: (input: PartInput) => Promise<string | false>;
  updatePart: (id: string, input: Partial<PartInput>) => Promise<boolean>;
  deletePart: (id: string) => Promise<boolean>;
  isMutating: boolean;
}

export interface UseSquadronInventoryResult extends UseInventoryShape {
  canWrite: boolean;
  canEditMoney: boolean;
  teamName: string | null;
  teamRole: string | null;
  isLoadingMembership: boolean;
  notMember: boolean;
}

export function useSquadronInventory(
  teamId: string,
): UseSquadronInventoryResult {
  const queryClient = useQueryClient();
  const { resolution } = useGearScopeContext();
  const { canWrite, canEditMoney } = resolution;
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS);
  const [pageIndex, setPageIndex] = useState(0);

  const query = useQuery({
    queryKey: [SQUAD_INVENTORY_KEY, teamId],
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "org_gear",
        table: PARTS_TABLE,
        operation: "select",
        selectColumns: "*",
        // Pin to THIS squad — see doc above.
        filters: { team_id: teamId },
        orderBy: { column: "created_at", ascending: false },
        sync: "delta",
        syncScope: teamId,
      });
      if (error) throw error;
      return (data ?? []) as DronePart[];
    },
    enabled: !!teamId && resolution.isMember,
    staleTime: 30_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [SQUAD_INVENTORY_KEY, teamId] });

  const addPart = useMutation({
    mutationFn: async (input: PartInput) => {
      const { data, error } = await db_request({
        mode: "query",
        schema: "org_gear",
        table: PARTS_TABLE,
        operation: "insert",
        data: {
          ...sanitizePartInput(input),
          specs: input.specs ?? {},
          team_id: teamId,
        },
        single: true,
        // Team scope so insert/update eviction+priming hit the same
        // delta-sync cache the team-scoped reads use.
        syncScope: teamId,
      });
      if (error) throw error;
      return data as DronePart;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Part added to the squadron bench");
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
        schema: "org_gear",
        table: PARTS_TABLE,
        operation: "update",
        data: sanitizePartInput(input),
        filters: { id, team_id: teamId },
        single: true,
        syncScope: teamId,
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
        schema: "org_gear",
        table: PARTS_TABLE,
        operation: "delete",
        filters: { id, team_id: teamId },
        syncScope: teamId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Part removed from the squadron bench");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete part"),
  });

  const isMutating =
    addPart.isPending || updatePart.isPending || deletePart.isPending;

  // ---- Client-side filter + pagination (0 network on change) --------------
  const filtered = useMemo(() => {
    const allParts = query.data ?? [];
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
  }, [query.data, filters]);

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
    addPart: (input) =>
      addPart.mutateAsync(input).then((created) => created?.id ?? false),
    updatePart: (id, input) =>
      updatePart.mutateAsync({ id, input }).then(() => true),
    deletePart: (id) => deletePart.mutateAsync(id).then(() => true),
    isMutating,
    canWrite,
    canEditMoney,
    teamName: resolution.teamName,
    teamRole: resolution.teamRole,
    isLoadingMembership: resolution.isLoading,
    notMember: !resolution.isMember && !resolution.isLoading,
  };
}
