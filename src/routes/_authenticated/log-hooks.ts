import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import { type SessionRow } from "@/lib/fpv";

/** Server-side page size for the flight log list. */
export const LOG_PAGE_SIZE = 50;

export interface LogPage {
  sessions: SessionRow[];
  /** True when a further page exists on the server. */
  hasMore: boolean;
  nextOffset: number | null;
}

/**
 * Paginated flight-log data. Pages accumulate in a single cache entry under
 * ["log-data", userId] so deletion/realtime invalidation touches one key.
 */
export function useLogData(userId: string | null | undefined) {
  const queryClient = useQueryClient();

  const dataQuery = useQuery({
    queryKey: ["log-data", userId ?? null],
    enabled: !!userId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<LogPage> => {
      if (!userId) {
        return { sessions: [], hasMore: false, nextOffset: null };
      }

      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_user_sessions_with_gear",
        rpcParams: {
          p_user_id: userId,
          p_limit: LOG_PAGE_SIZE + 1,
          p_offset: 0,
        },
      });

      if (error) throw error;

      const rows = (data ?? []) as SessionRow[];
      const hasMore = rows.length > LOG_PAGE_SIZE;
      return {
        sessions: hasMore ? rows.slice(0, LOG_PAGE_SIZE) : rows,
        hasMore,
        nextOffset: hasMore ? LOG_PAGE_SIZE : null,
      };
    },
  });

  const fetchMore = useQuery({
    queryKey: ["log-data-more", userId ?? null, dataQuery.data?.nextOffset ?? null],
    enabled: !!userId && !!dataQuery.data?.hasMore,
    staleTime: 30_000,
    queryFn: async (): Promise<LogPage> => {
      const offset = dataQuery.data!.nextOffset!;
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_user_sessions_with_gear",
        rpcParams: {
          p_user_id: userId!,
          p_limit: LOG_PAGE_SIZE + 1,
          p_offset: offset,
        },
      });
      if (error) throw error;

      const rows = (data ?? []) as SessionRow[];
      const hasMore = rows.length > LOG_PAGE_SIZE;
      return {
        sessions: hasMore ? rows.slice(0, LOG_PAGE_SIZE) : rows,
        hasMore,
        nextOffset: hasMore ? offset + LOG_PAGE_SIZE : null,
      };
    },
  });

  // Merged view: accumulated pages in server order (newest first).
  const sessions: SessionRow[] = [
    ...(dataQuery.data?.sessions ?? []),
    ...(fetchMore.data?.sessions ?? []),
  ];
  const hasMore = fetchMore.data?.hasMore ?? dataQuery.data?.hasMore ?? false;
  const nextOffset = fetchMore.data?.nextOffset ?? dataQuery.data?.nextOffset ?? null;

  const removeSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const sessionToDelete = sessions.find((s) => s.id === id);

      // Optimistic removal across the base and "more" pages.
      queryClient.setQueryData<LogPage>(
        ["log-data", userId ?? null],
        (old) =>
          old && {
            ...old,
            sessions: old.sessions.filter((s) => s.id !== id),
          },
      );
      if (fetchMore.data) {
        queryClient.setQueryData<LogPage>(
          ["log-data-more", userId ?? null, fetchMore.data.nextOffset],
          (old) =>
            old && {
              ...old,
              sessions: old.sessions.filter((s) => s.id !== id),
            },
        );
      }

      if (sessionToDelete && !id.startsWith("local-")) {
        const { error } = await db_request({
          mode: "query",
          schema: "public",
          table: "sessions",
          operation: "delete",
          filters: { id },
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["log-data", userId ?? null] });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["log-data", userId ?? null] });
      import("sonner").then(({ toast }) => toast.error(e.message));
    },
  });

  return {
    sessions,
    hasMore,
    nextOffset,
    isLoading: dataQuery.isLoading,
    isError: dataQuery.isError,
    isFetchingMore: fetchMore.isFetching,
    loadMore: () => {
      if (hasMore && !fetchMore.isFetching) fetchMore.refetch();
    },
    removeSession: removeSessionMutation,
  };
}
