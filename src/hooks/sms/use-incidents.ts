/**
 * use-incidents — data layer for the SMS incident log.
 *
 * Reads/writes go straight to sms.incidents under RLS: pilots see/file
 * their own reports, safety officers / org admins (public.ent_can_manage)
 * see and review every report in the org. See the migration for the
 * full policy set — this file never widens what RLS allows.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Incident, IncidentDraft, IncidentReview } from "@/types/sms";
import {
  incidentAttachmentPath,
  removeIncidentAttachment,
  uploadIncidentAttachment,
} from "@/lib/sms/storage";
import { useQaMode } from "@/hooks/use-qa-mode";
import { QA_INCIDENTS, QaWriteBlockedError, qaIncidentFromDraft } from "@/lib/qa-fixtures";

function incidentsTable() {
  return supabase.schema("sms").from("incidents");
}

const queryKey = (orgId: string | null, qa: boolean) => [
  "sms",
  "incidents",
  orgId,
  qa ? "qa" : "live",
];

/** Own reports for a pilot, or every org report for a safety officer/admin — RLS decides which. QA mode: fixtures. */
export function useIncidents(orgId: string | null) {
  const qaMode = useQaMode();
  return useQuery({
    queryKey: queryKey(orgId, qaMode),
    enabled: !!orgId,
    queryFn: async (): Promise<Incident[]> => {
      if (qaMode) {
        return QA_INCIDENTS.filter((i) => i.organization_id === orgId);
      }
      const { data, error } = await incidentsTable()
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Incident[];
    },
  });
}

export function useCreateIncident(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async ({
      draft,
      file,
    }: {
      draft: IncidentDraft;
      file: File | null;
    }) => {
      if (qaMode) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        return qaIncidentFromDraft(orgId, user?.id ?? "qa-user-0001", draft);
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      let attachmentPath: string | null = null;
      if (file) {
        attachmentPath = incidentAttachmentPath(orgId, user.id, file.name);
        await uploadIncidentAttachment(attachmentPath, file);
      }

      const { data, error } = await incidentsTable()
        .insert({
          organization_id: orgId,
          user_id: user.id,
          airframe_id: draft.airframe_id,
          incident_date: draft.incident_date,
          severity_level: draft.severity_level,
          incident_type: draft.incident_type,
          description: draft.description,
          attachment_path: attachmentPath,
        })
        .select()
        .single();
      if (error) {
        if (attachmentPath) await removeIncidentAttachment(attachmentPath);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(orgId, false) });
    },
  });
}

/** Safety-officer/admin action: update status and corrective action. RLS
 * restricts writes to org admins; closing without a corrective_action is
 * rejected by the DB constraint. */
export function useReviewIncident(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async ({
      incidentId,
      review,
    }: {
      incidentId: string;
      review: IncidentReview;
    }) => {
      if (qaMode) throw new QaWriteBlockedError();
      const { error } = await incidentsTable()
        .update({
          status: review.status,
          corrective_action: review.corrective_action,
        })
        .eq("incident_id", incidentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(orgId, false) });
    },
  });
}
