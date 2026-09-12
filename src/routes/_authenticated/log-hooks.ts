import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import { type SessionRow } from "@/lib/fpv";

export function useLogData() {
  const queryClient = useQueryClient();

  const dataQuery = useQuery({
    queryKey: ["log-data"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user?.id;

      if (!user) {
        return { sessions: [], gear: [] as SessionRow[] };
      }

      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_user_sessions_with_gear",
        rpcParams: { p_user_id: user },
      });

      if (error) throw error;

      return {
        sessions: (data ?? []) as SessionRow[],
        gear: [],
      };
    },
  });

  const removeSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const currentList = dataQuery.data?.sessions ?? [];
      const sessionToDelete = currentList.find((s) => s.id === id);

      queryClient.setQueryData<
        { sessions: SessionRow[]; gear: SessionRow[] } | undefined
      >(["log-data"], (old) => {
        if (!old) return undefined;
        return {
          sessions: old.sessions.filter((s) => s.id !== id),
          gear: old.gear,
        };
      });

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
      queryClient.invalidateQueries({ queryKey: ["log-data"] });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["log-data"] });
      import("sonner").then(({ toast }) => toast.error(e.message));
    },
  });

  return {
    sessions: dataQuery.data?.sessions ?? [],
    gear: dataQuery.data?.gear ?? [],
    isLoading: dataQuery.isLoading,
    isError: dataQuery.isError,
    removeSession: removeSessionMutation,
  };
}
