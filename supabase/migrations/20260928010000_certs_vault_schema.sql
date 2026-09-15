-- ============================================================
-- Migration: certs — Certification & Waiver Vault
--
-- Dedicated schema (not public), exposed via PostgREST (see
-- supabase/config.toml `api.schemas`). Single table:
--   certs.vault_documents — one row per uploaded cert/waiver.
--
-- Access model reuses the existing enterprise role plane
-- (20260927100100/100120) rather than inventing a new one:
--   * Pilots: read/write only their own rows.
--   * squadron_admin / district_admin / site_admin
--     (public.ent_can_manage): view + verify + audit every row in
--     the org. There is no separate "safety officer" role in this
--     codebase (team_role is only owner/manager/member) — org admins
--     ARE the safety-officer tier here. A dedicated per-member grant
--     (mirroring can_edit_gear/ledger_access) is the upgrade path if
--     a non-admin safety-officer designation is ever needed.
--
-- Expiration is informational ONLY: certs.vault_documents_status
-- computes active/expiring_soon/expired for UI badges. Nothing in
-- this migration touches scheduling/booking — expired documents
-- never block anything server-side, by design.
--
-- Storage: files live in Supabase Storage today (bucket 'cert-vault'),
-- uploaded straight from the browser via supabase-js, matching the
-- house pattern in ent_scheduling. file_path is an opaque object key
-- so swapping the storage backend (e.g. Backblaze B2 directly) later
-- only touches the client upload helper, not this schema.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS certs;

-- ---------------------------------------------------------------------------
-- 1. vault_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.vault_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  document_type    text NOT NULL CHECK (document_type IN (
                     'part_107', 'trust', 'parental_waiver', 'liability_waiver'
                   )),

  file_name        text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 200),
  mime_type        text NOT NULL DEFAULT 'application/octet-stream',
  file_path        text NOT NULL, -- storage object key (bucket-relative), never a public URL

  issue_date       date,
  expiration_date  date, -- NULL = does not expire (e.g. a trust document)

  verified_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at      timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vault_documents_dates_order
    CHECK (issue_date IS NULL OR expiration_date IS NULL OR expiration_date >= issue_date),
  CONSTRAINT vault_documents_verified_at_needs_verifier
    CHECK ((verified_by IS NULL) = (verified_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_vault_documents_org_user
  ON certs.vault_documents(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_vault_documents_org_type
  ON certs.vault_documents(organization_id, document_type);

ALTER TABLE certs.vault_documents ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Verification integrity trigger
--
-- Only an org admin (public.ent_can_manage) may set verified_by/
-- verified_at. A non-admin insert/update always has them stripped back
-- to NULL (insert) or the prior value (update) regardless of what the
-- client sends — WITH CHECK alone can't express "unless you're an
-- admin, this column is read-only". Also: any non-admin edit to the
-- file, its type, or its dates invalidates a prior verification, so a
-- swapped-in file can never keep riding an old "verified" badge.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION certs.vault_documents_verification_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
BEGIN
  IF public.ent_can_manage(NEW.organization_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.document_type IS DISTINCT FROM OLD.document_type
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date THEN
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
  ELSE
    NEW.verified_by := OLD.verified_by;
    NEW.verified_at := OLD.verified_at;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vault_documents_verification_guard ON certs.vault_documents;
CREATE TRIGGER vault_documents_verification_guard
  BEFORE INSERT OR UPDATE ON certs.vault_documents
  FOR EACH ROW EXECUTE FUNCTION certs.vault_documents_verification_guard();

CREATE OR REPLACE FUNCTION certs.touch_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'certs'
  AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vault_documents_touch ON certs.vault_documents;
CREATE TRIGGER vault_documents_touch
  BEFORE UPDATE ON certs.vault_documents
  FOR EACH ROW EXECUTE FUNCTION certs.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — own documents (pilot) or org admin (squadron/district/site).
--    Uses the existing public.ent_is_org_member / public.ent_can_manage
--    helpers (20260927100100) — one source of role truth, no duplicate
--    role logic here.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vault_documents_select ON certs.vault_documents;
CREATE POLICY vault_documents_select
  ON certs.vault_documents FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.ent_can_manage(organization_id)
  );

DROP POLICY IF EXISTS vault_documents_insert ON certs.vault_documents;
CREATE POLICY vault_documents_insert
  ON certs.vault_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.ent_is_org_member(organization_id))
    OR public.ent_can_manage(organization_id)
  );

DROP POLICY IF EXISTS vault_documents_update ON certs.vault_documents;
CREATE POLICY vault_documents_update
  ON certs.vault_documents FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.ent_can_manage(organization_id)
  )
  WITH CHECK (
    (user_id = auth.uid() AND public.ent_is_org_member(organization_id))
    OR public.ent_can_manage(organization_id)
  );

DROP POLICY IF EXISTS vault_documents_delete ON certs.vault_documents;
CREATE POLICY vault_documents_delete
  ON certs.vault_documents FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.ent_can_manage(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Expiration status view — UI badges ONLY. No booking/scheduling
--    table references it; nothing reads this to gate anything.
--    security_invoker so it enforces vault_documents' own RLS as the
--    querying role, instead of running as the view owner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW certs.vault_documents_status
  WITH (security_invoker = true) AS
SELECT
  d.*,
  CASE
    WHEN d.expiration_date IS NULL THEN 'active'
    WHEN d.expiration_date < CURRENT_DATE THEN 'expired'
    WHEN d.expiration_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'active'
  END AS status
FROM certs.vault_documents d;

-- ---------------------------------------------------------------------------
-- 5. Storage — private 'cert-vault' bucket. Path contract
--    <organization_id>/<user_id>/<file>, checked directly against the
--    object name (no lookup needed, unlike ent_scheduling's job-id
--    indirection). 25 MB cap comfortably covers a scanned PDF/photo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION certs.storage_access(_path text)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  v_org  uuid;
  v_user uuid;
BEGIN
  BEGIN
    v_org  := split_part(_path, '/', 1)::uuid;
    v_user := split_part(_path, '/', 2)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF v_org IS NULL OR v_user IS NULL THEN
    RETURN false;
  END IF;

  RETURN (v_user = auth.uid() AND public.ent_is_org_member(v_org))
      OR public.ent_can_manage(v_org);
END;
$function$;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('cert-vault', 'cert-vault', false, 26214400) -- 25 MB
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS cert_vault_insert ON storage.objects;
CREATE POLICY cert_vault_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cert-vault' AND certs.storage_access(name));

DROP POLICY IF EXISTS cert_vault_select ON storage.objects;
CREATE POLICY cert_vault_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cert-vault' AND certs.storage_access(name));

DROP POLICY IF EXISTS cert_vault_delete ON storage.objects;
CREATE POLICY cert_vault_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cert-vault' AND certs.storage_access(name));

-- ---------------------------------------------------------------------------
-- 6. Grants — RLS is the boundary, grants keep the surface narrow.
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA certs FROM anon, PUBLIC;
GRANT USAGE ON SCHEMA certs TO authenticated;

REVOKE ALL ON certs.vault_documents FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certs.vault_documents TO authenticated;

REVOKE ALL ON certs.vault_documents_status FROM anon, PUBLIC, authenticated;
GRANT SELECT ON certs.vault_documents_status TO authenticated;

REVOKE ALL ON FUNCTION certs.storage_access(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.vault_documents_verification_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.touch_updated_at() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
