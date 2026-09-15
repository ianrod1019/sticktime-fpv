/**
 * use-jha — data layer for the Job Hazard Analysis module.
 *
 * Reads/writes go straight to jha.templates / jha.submissions under RLS:
 * pilots create submissions and view their own history; safety officers /
 * org admins (public.ent_can_manage) see all org submissions for audit.
 * Template management is admin-only.
 *
 * See the migration (20261001000000_jha_schema.sql) for the full policy
 * set — this file never widens what RLS allows.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useQaMode } from "@/hooks/use-qa-mode";
import {
  type JhaChecklistSection,
  type JhaGateResult,
  type JhaSubmission,
  type JhaTemplate,
  type JhaTemplateDraft,
} from "@/types/jha";
import { QA_JHA_SUBMISSIONS, QA_JHA_TEMPLATES, QaWriteBlockedError } from "@/lib/qa-fixtures";

function templatesTable() {
  return supabase.schema("jha").from("templates");
}

function submissionsTable() {
  return supabase.schema("jha").from("submissions");
}

const templateKey = (orgId: string | null, qa: boolean) =>
  ["jha", "templates", orgId, qa ? "qa" : "live"] as const;

const submissionKey = (orgId: string | null, qa: boolean) =>
  ["jha", "submissions", orgId, qa ? "qa" : "live"] as const;

// -------------------------------------------------------------------
// Templates
// -------------------------------------------------------------------

/** Fetch all templates for an org. Admins manage these; pilots read them
 *  to drive the wizard. */
export function useJhaTemplates(orgId: string | null) {
  const qaMode = useQaMode();
  return useQuery({
    queryKey: templateKey(orgId, qaMode),
    enabled: !!orgId,
    queryFn: async (): Promise<JhaTemplate[]> => {
      if (qaMode) return QA_JHA_TEMPLATES.filter((t) => t.organization_id === orgId);
      const { data, error } = await templatesTable()
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as JhaTemplate[];
    },
  });
}

/** Admin-only: create a new template. */
export function useCreateJhaTemplate(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (draft: JhaTemplateDraft) => {
      if (qaMode) throw new QaWriteBlockedError();
      const { data, error } = await templatesTable()
        .insert({
          organization_id: orgId,
          title: draft.title,
          items: draft.items as unknown as JhaChecklistSection[],
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as JhaTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKey(orgId, false) });
    },
  });
}

/** Admin-only: delete a template. */
export function useDeleteJhaTemplate(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (templateId: string) => {
      if (qaMode) throw new QaWriteBlockedError();
      const { error } = await templatesTable()
        .delete()
        .eq("template_id", templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKey(orgId, false) });
    },
  });
}

// -------------------------------------------------------------------
// Submissions
// -------------------------------------------------------------------

/** Pilot's own submissions + admin audit view — RLS decides which rows. */
export function useJhaSubmissions(orgId: string | null) {
  const qaMode = useQaMode();
  return useQuery({
    queryKey: submissionKey(orgId, qaMode),
    enabled: !!orgId,
    queryFn: async (): Promise<JhaSubmission[]> => {
      if (qaMode) return QA_JHA_SUBMISSIONS.filter((s) => s.organization_id === orgId);
      const { data, error } = await submissionsTable()
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as JhaSubmission[];
    },
  });
}

/** File a new JHA submission. The wizard calls this with the computed
 *  status ('passed' | 'failed') and the collected responses. */
export function useSubmitJhaChecklist(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (payload: {
      template_id: string | null;
      airframe_id: string | null;
      dispatch_id: string | null;
      responses: Record<string, { passed: boolean; note?: string }>;
      status: "passed" | "failed";
    }) => {
      if (qaMode) throw new QaWriteBlockedError();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const { data, error } = await submissionsTable()
        .insert({
          organization_id: orgId,
          user_id: user.id,
          template_id: payload.template_id,
          airframe_id: payload.airframe_id,
          dispatch_id: payload.dispatch_id,
          responses: payload.responses,
          status: payload.status,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as JhaSubmission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: submissionKey(orgId, false) });
    },
  });
}

/** Check the flight gate: does this pilot have a valid (passed, recent)
 *  JHA submission? Wraps the jha.check_flight_gate RPC. */
export function useJhaGateCheck() {
  return useMutation({
    mutationFn: async (payload: {
      org: string;
      user: string;
      airframe?: string;
      window_min?: number;
    }): Promise<JhaGateResult> => {
      const { data, error } = await supabase.rpc("check_flight_gate" as any, {
        _org: payload.org,
        _user: payload.user,
        _airframe: payload.airframe ?? null,
        _window_min: payload.window_min ?? 60,
      });
      if (error) throw error;
      return (data as unknown as JhaGateResult) ?? {
        valid: false,
        submission_id: null,
        reason: "Gate check failed.",
      };
    },
  });
}
