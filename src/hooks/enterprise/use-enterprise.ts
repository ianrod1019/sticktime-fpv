/**
 * use-enterprise — the data layer for the enterprise plane.
 *
 * Every call goes through the RPC contract
 * (20260927100300_enterprise_rpcs.sql) so the UI can never widen the
 * server's decision: RLS and trigger enforcement stay authoritative;
 * the flags here only drive rendering.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db_request } from "@/lib/db_request";
import {
  type EnterpriseMetrics,
  type MeetupDraft,
  type MeetupResponse,
  type MyEnterpriseMembership,
  type PolicyPatch,
  type ResolvedPolicy,
  type SquadronMeetup,
} from "@/types/enterprise";

/** All enterprise memberships of the caller (district + org roles). */
export function useMyEnterprises() {
  return useQuery({
    queryKey: ["enterprises", "my-enterprises"],
    staleTime: 60_000,
    queryFn: async (): Promise<MyEnterpriseMembership[]> => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_my_enterprises",
      });
      if (error) throw error;
      return (data ?? []) as MyEnterpriseMembership[];
    },
  });
}

/** Aggregate metrics across a district's sub-squadrons. */
export function useEnterpriseMetrics(enterpriseId: string | null) {
  return useQuery({
    queryKey: ["enterprises", "metrics", enterpriseId],
    enabled: !!enterpriseId,
    staleTime: 60_000,
    queryFn: async (): Promise<EnterpriseMetrics | null> => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_enterprise_metrics",
        rpcParams: { _enterprise: enterpriseId },
      });
      if (error) throw error;
      return (data as EnterpriseMetrics) ?? null;
    },
  });
}

/** Resolved policy set for an org (org rows + inherited defaults). */
export function useOrgPolicies(orgId: string | null) {
  return useQuery({
    queryKey: ["enterprises", "policies", orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<ResolvedPolicy[]> => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_org_policies",
        rpcParams: { _org: orgId },
      });
      if (error) throw error;
      return (data ?? []) as ResolvedPolicy[];
    },
  });
}

export function useSetOrgPolicies(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patches: PolicyPatch[]) => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "set_org_policies",
        rpcParams: { _org: orgId, _policies: patches },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["enterprises", "policies", orgId],
      });
    },
  });
}

/** Meetups for an org with attendance counts + the caller's response. */
export function useOrgMeetups(orgId: string | null) {
  return useQuery({
    queryKey: ["enterprises", "meetups", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<SquadronMeetup[]> => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_org_meetups",
        rpcParams: { _org: orgId },
      });
      if (error) throw error;
      return (data ?? []) as SquadronMeetup[];
    },
  });
}

export function useCreateMeetup(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: MeetupDraft) => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "create_meetup",
        rpcParams: {
          _org: orgId,
          _title: draft.title,
          _start_time: new Date(draft.start_time).toISOString(),
          _end_time: new Date(draft.end_time).toISOString(),
          _description: draft.description || null,
          _location: draft.location || null,
        },
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["enterprises", "meetups", orgId],
      });
    },
  });
}

export function useDeleteMeetup(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (meetupId: string) => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "delete_meetup",
        rpcParams: { _meetup: meetupId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["enterprises", "meetups", orgId],
      });
    },
  });
}

export function useRespondToMeetup(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      meetupId,
      response,
    }: {
      meetupId: string;
      response: MeetupResponse;
    }) => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "respond_to_meetup",
        rpcParams: { _meetup: meetupId, _response: response },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["enterprises", "meetups", orgId],
      });
    },
  });
}

/**
 * Link a logged session to a meetup — the "flight session logging"
 * half of the scheduler contract. Returns the session id so the caller
 * can hand it to the log flow.
 */
export function useLinkMeetupSession(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      meetupId,
      sessionId,
    }: {
      meetupId: string;
      sessionId: string;
    }) => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "link_meetup_session",
        rpcParams: { _meetup: meetupId, _session: sessionId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["enterprises", "meetups", orgId],
      });
    },
  });
}
