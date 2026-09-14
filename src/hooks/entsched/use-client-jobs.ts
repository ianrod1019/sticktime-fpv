/**
 * use-entsched — the data layer for the client-job CRM plane.
 *
 * Reads/writes go straight to ent_scheduling tables under RLS (same
 * shape as the edu module); confirmation and token rotation go through
 * the SECURITY DEFINER RPCs, which are the only writers of those
 * server-managed transitions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ClientConfirmResult,
  ClientJob,
  ClientJobDraft,
  ClientJobView,
  JobDeliverable,
} from "@/types/entsched";

function jobsTable() {
  return supabase.schema("ent_scheduling").from("client_jobs");
}
function deliverablesTable() {
  return supabase.schema("ent_scheduling").from("job_deliverables");
}

/** All jobs for one org (the internal board). */
export function useOrgClientJobs(orgId: string | null) {
  return useQuery({
    queryKey: ["entsched", "jobs", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ClientJob[]> => {
      const { data, error } = await jobsTable()
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientJob[];
    },
  });
}

/** Deliverables of one job. */
export function useJobDeliverables(jobId: string | null) {
  return useQuery({
    queryKey: ["entsched", "deliverables", jobId],
    enabled: !!jobId,
    queryFn: async (): Promise<JobDeliverable[]> => {
      const { data, error } = await deliverablesTable()
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as JobDeliverable[];
    },
  });
}

export function useCreateClientJob(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ClientJobDraft): Promise<ClientJob> => {
      const { data, error } = await jobsTable()
        .insert({
          ...draft,
          description: draft.description || null,
          location: draft.location || null,
          client_email: draft.client_email || null,
          organization_id: orgId,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ClientJob;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entsched", "jobs", orgId] });
    },
  });
}

export function useUpdateJobStatus(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      status,
    }: {
      jobId: string;
      status: ClientJob["status"];
    }) => {
      const { error } = await jobsTable().update({ status }).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entsched", "jobs", orgId] });
    },
  });
}

/**
 * Drag-and-drop move: reassign a job to a person and/or shift its
 * window. Duration preservation is the caller's job (the board keeps
 * it); the server only validates RLS + the status machine, both of
 * which are orthogonal to moves.
 */
export function useMoveClientJob(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      assigned_to,
      scheduled_start,
      scheduled_end,
    }: {
      jobId: string;
      assigned_to: string | null;
      scheduled_start: string;
      scheduled_end: string;
    }) => {
      const { error } = await jobsTable()
        .update({ assigned_to, scheduled_start, scheduled_end })
        .eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entsched", "jobs", orgId] });
    },
  });
}

export function useDeleteClientJob(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await jobsTable().delete().eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entsched", "jobs", orgId] });
    },
  });
}

/**
 * Upload a deliverable: storage object first (private bucket, path
 * contract <job_id>/<file uuid>), then the catalog row. The storage
 * policy (storage_job_access) and the stage trigger enforce the same
 * rules server-side.
 */
export function useUploadDeliverable(job: ClientJob) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<JobDeliverable> => {
      const path = `${job.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("client-deliverables")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (upErr) throw upErr;
      const { data, error } = await deliverablesTable()
        .insert({
          job_id: job.id,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          storage_path: path,
        })
        .select()
        .single();
      if (error) {
        await supabase.storage.from("client-deliverables").remove([path]);
        throw error;
      }
      return data as JobDeliverable;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["entsched", "deliverables", job.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["entsched", "jobs", job.organization_id],
      });
    },
  });
}

export function useDeleteDeliverable(job: ClientJob) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (d: JobDeliverable) => {
      const { error } = await deliverablesTable().delete().eq("id", d.id);
      if (error) throw error;
      await supabase.storage
        .from("client-deliverables")
        .remove([d.storage_path]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["entsched", "deliverables", job.id],
      });
    },
  });
}

/** Rotate the client link — old link dies, new token returned. */
export function useRotateClientToken(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("entsched_rotate_token", {
        _job: jobId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entsched", "jobs", orgId] });
    },
  });
}

/* -----------------------------------------------------------------------
 * Public (anon) surface — the /client/$token page. No session exists.
 * -------------------------------------------------------------------- */

export async function fetchClientJobView(
  token: string,
): Promise<ClientJobView> {
  const { data, error } = await supabase.rpc("entsched_client_job", {
    _token: token,
  });
  if (error) throw error;
  return data as ClientJobView;
}

export async function confirmClientJob(
  token: string,
): Promise<ClientConfirmResult> {
  const { data, error } = await supabase.rpc("entsched_confirm_job", {
    _token: token,
  });
  if (error) throw error;
  return data as ClientConfirmResult;
}

/** Build the client-link URL for the admin to copy/send. */
export function clientLinkFor(token: string): string {
  return `${window.location.origin}/client/${token}`;
}
