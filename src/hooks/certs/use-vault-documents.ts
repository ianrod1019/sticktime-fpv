/**
 * use-vault-documents — data layer for the Certification & Waiver Vault.
 *
 * Reads/writes go straight to certs.vault_documents under RLS: pilots
 * see/edit their own rows, org admins see/edit every row in the org
 * (public.ent_can_manage — see the migration). The status view is
 * read-only and feeds UI badges only; nothing here ever blocks a
 * booking or scheduling action based on expiration.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VaultDocumentDraft, VaultDocumentWithStatus } from "@/types/certs";
import { removeVaultFile, uploadVaultFile, vaultObjectPath } from "@/lib/certs/storage";
import { useQaMode } from "@/hooks/use-qa-mode";
import { QA_VAULT_DOCS, QaWriteBlockedError } from "@/lib/qa-fixtures";

function vaultStatusView() {
  return supabase.schema("certs").from("vault_documents_status");
}
function vaultTable() {
  return supabase.schema("certs").from("vault_documents");
}

/** Own documents for a pilot, or every org document for an org admin — RLS decides which. QA mode: fixtures. */
export function useVaultDocuments(orgId: string | null) {
  const qaMode = useQaMode();
  return useQuery({
    queryKey: ["certs", "vault-documents", orgId, qaMode ? "qa" : "live"],
    enabled: !!orgId,
    queryFn: async (): Promise<VaultDocumentWithStatus[]> => {
      if (qaMode) {
        return QA_VAULT_DOCS.filter((d) => d.organization_id === orgId);
      }
      const { data, error } = await vaultStatusView()
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VaultDocumentWithStatus[];
    },
  });
}

export function useUploadVaultDocument(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async ({
      file,
      draft,
    }: {
      file: File;
      draft: VaultDocumentDraft;
    }) => {
      if (qaMode) throw new QaWriteBlockedError();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const path = vaultObjectPath(orgId, user.id, file.name);
      await uploadVaultFile(path, file);

      const { data, error } = await vaultTable()
        .insert({
          organization_id: orgId,
          user_id: user.id,
          document_type: draft.document_type,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          file_path: path,
          issue_date: draft.issue_date,
          expiration_date: draft.expiration_date,
        })
        .select()
        .single();
      if (error) {
        await removeVaultFile(path);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["certs", "vault-documents", orgId],
      });
    },
  });
}

export function useDeleteVaultDocument(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (doc: VaultDocumentWithStatus) => {
      if (qaMode) throw new QaWriteBlockedError();
      const { error } = await vaultTable().delete().eq("id", doc.id);
      if (error) throw error;
      await removeVaultFile(doc.file_path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["certs", "vault-documents", orgId],
      });
    },
  });
}

/** Org-admin action: stamp a document verified. RLS + the verification
 * guard trigger enforce that only an admin's write actually sticks. */
export function useVerifyVaultDocument(orgId: string) {
  const queryClient = useQueryClient();
  const qaMode = useQaMode();
  return useMutation({
    mutationFn: async (docId: string) => {
      if (qaMode) throw new QaWriteBlockedError();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await vaultTable()
        .update({ verified_by: user?.id ?? null, verified_at: new Date().toISOString() })
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["certs", "vault-documents", orgId],
      });
    },
  });
}
