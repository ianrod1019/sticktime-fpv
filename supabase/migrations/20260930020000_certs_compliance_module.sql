-- ============================================================
-- Migration: certs — Advanced Pilot Credentialing, Specialized
-- Qualifications & Recurrent Training Management
--
-- Extends the Certification & Waiver Vault (20260928010000) into the
-- compliance engine:
--
--   certs.credential_definitions   master credential catalog (platform)
--   certs.org_credential_policies  per-org adoption + warning cadence
--   certs.pilot_credentials        issued credentials per pilot
--   certs.credential_documents     versioned, hash-pinned evidence
--   certs.credential_approvals     internal checkout sign-off chain
--   certs.org_waivers              org-level FAA waivers / COAs
--   certs.pilot_waiver_authorizations  pilot linkage to org waivers
--   certs.mission_profiles         booking requirement templates
--   certs.notification_outbox      queued in-app/email/SMS dispatch
--   certs.sensitive_access_grants  medical-record RBAC upgrades
--   certs.audit_log                append-only compliance audit trail
--
-- THE GATE ("No-Fly, No-Schedule"): unlike the vault — where expiration
-- is informational — this migration hard-locks operations. BEFORE
-- triggers on edu.schedules (bookings) and
-- org_gear.squadron_gear_checkouts (gear checkout) raise errcode
-- 'P0001' with a "NO-FLY" message when a required credential is
-- missing, expired, or unverified. Gated sets:
--   * bookings WITH a mission profile → the profile's credential codes
--     and waiver types, UNION org-mandated (required_for_all) codes;
--   * bookings WITHOUT a profile → org-mandated codes only;
--   * gear with required_credential_code → that code at checkout.
-- The check ALWAYS recomputes from dates and flight recency — the
-- materialized status column is never trusted.
--
-- Admin override: org managers may override a compliance block by
-- setting edu.schedules.compliance_override_by (must be themselves) +
-- _reason (trigger-checked to public.ent_can_manage, audit-logged).
-- Expired FEDERAL CERTIFICATES (category 'federal_certificate') can
-- never be overridden.
--
-- Access model reuses the enterprise role plane (20260927100100):
-- pilots own their rows; squadron/district/site admins (ent_can_manage)
-- verify, approve, and manage. Sensitive credentials (medical) are
-- hidden from plain admins — subject, district admin, site admin, or
-- an explicit certs.sensitive_access_grants row only; the compliance
-- RPC masks their dates for everyone else (color, not data).
--
-- Notifications: in-app rows go to the existing public.notifications;
-- email/sms rows queue in certs.notification_outbox for the
-- certs-notification-worker edge function (dev-safe: without provider
-- keys nothing sends). pg_cron dispatch mirrors the account-purge sweep
-- pattern (20260920030000): schedule if available, else notice.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS certs;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- digest() for sign-off signatures

-- ---------------------------------------------------------------------------
-- 1. credential_definitions — the master catalog (platform-seeded)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.credential_definitions (
  code                  text PRIMARY KEY,
  name                  text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description           text,
  category              text NOT NULL CHECK (category IN (
                          'federal_certificate', 'federal_authorization',
                          'internal_checkout', 'medical', 'jurisdictional',
                          'company_currency')),
  jurisdiction          text NOT NULL DEFAULT 'FAA' CHECK (jurisdiction IN (
                          'FAA', 'EASA', 'TC', 'FCC', 'internal')),
  default_validity_days integer CHECK (default_validity_days IS NULL OR default_validity_days > 0),
  evidence_required     boolean NOT NULL DEFAULT true,
  verification_required boolean NOT NULL DEFAULT false,
  -- {"type":"flights_in_window","count":3,"window_days":90,"night_only":true}
  recency_rule          jsonb,
  applies_to            text CHECK (applies_to IS NULL OR applies_to IN ('payload', 'airframe_class')),
  applies_key           text,
  regulatory_citation   text,
  sensitive             boolean NOT NULL DEFAULT false,
  active                boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 100,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credential_definitions_recency_shape CHECK (
    recency_rule IS NULL OR (
      recency_rule->>'type' = 'flights_in_window'
      AND (recency_rule->>'count')::int > 0
      AND (recency_rule->>'window_days')::int > 0
    )
  )
);

ALTER TABLE certs.credential_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credential_definitions_select ON certs.credential_definitions;
CREATE POLICY credential_definitions_select
  ON certs.credential_definitions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS credential_definitions_write ON certs.credential_definitions;
CREATE POLICY credential_definitions_write
  ON certs.credential_definitions FOR ALL
  TO authenticated
  USING (public.ent_is_site_admin())
  WITH CHECK (public.ent_is_site_admin());

-- ---------------------------------------------------------------------------
-- 2. Supporting DDL on existing tables (needs the catalog to exist)
-- ---------------------------------------------------------------------------
-- Night recency: currency for night ops derives from real logged flights.
ALTER TABLE public.flights
  ADD COLUMN IF NOT EXISTS night_flight boolean NOT NULL DEFAULT false;

-- Airframe/payload-specific checkout requirement: when set, checking this
-- gear out requires the named internal credential (the gear-checkout gate).
ALTER TABLE org_gear.squadron_gear
  ADD COLUMN IF NOT EXISTS required_credential_code text
  REFERENCES certs.credential_definitions(code) ON DELETE SET NULL;

-- Mission-profile linkage + signed override on the dispatch ledger.
ALTER TABLE edu.schedules
  ADD COLUMN IF NOT EXISTS mission_profile_id uuid;
ALTER TABLE edu.schedules
  ADD COLUMN IF NOT EXISTS compliance_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE edu.schedules
  ADD COLUMN IF NOT EXISTS compliance_override_reason text;

-- ---------------------------------------------------------------------------
-- 3. Shared helpers (used by RLS policies below — created before use)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION certs.credential_is_sensitive(_code text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'certs'
  AS $function$
  SELECT COALESCE((SELECT d.sensitive FROM certs.credential_definitions d WHERE d.code = _code), false);
$function$;

-- Who may READ sensitive (medical) credential rows unmasked: district
-- admin, site admin, or an explicit grantee. Squadron admins see colors,
-- not data, until the district admin grants them.
CREATE OR REPLACE FUNCTION certs.caller_can_view_sensitive(_org uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
  SELECT public.ent_is_district_admin(_org)
      OR public.ent_is_site_admin()
      OR EXISTS (
        SELECT 1 FROM certs.sensitive_access_grants g
         WHERE g.organization_id = _org
           AND g.grantee_id = auth.uid()
           AND g.scope = 'medical'
      );
$function$;

-- ---------------------------------------------------------------------------
-- 4. sensitive_access_grants — medical-record RBAC upgrades.
--    Granted by the DISTRICT admin (billing owner) or site admin only;
--    a manager cannot grant themselves.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.sensitive_access_grants (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  grantee_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  scope           text NOT NULL DEFAULT 'medical' CHECK (scope IN ('medical')),
  granted_at      timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, grantee_id, scope),
  CONSTRAINT sensitive_grant_not_self CHECK (granted_by <> grantee_id)
);

ALTER TABLE certs.sensitive_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sensitive_access_grants_select ON certs.sensitive_access_grants;
CREATE POLICY sensitive_access_grants_select
  ON certs.sensitive_access_grants FOR SELECT
  TO authenticated
  USING (
    grantee_id = auth.uid()
    OR public.ent_is_district_admin(organization_id)
    OR public.ent_is_site_admin()
  );

DROP POLICY IF EXISTS sensitive_access_grants_write ON certs.sensitive_access_grants;
CREATE POLICY sensitive_access_grants_write
  ON certs.sensitive_access_grants FOR ALL
  TO authenticated
  USING (public.ent_is_district_admin(organization_id) OR public.ent_is_site_admin())
  WITH CHECK (
    granted_by = auth.uid()
    AND (public.ent_is_district_admin(organization_id) OR public.ent_is_site_admin())
  );

-- ---------------------------------------------------------------------------
-- 5. org_credential_policies — per-org adoption + cadence.
--    A MISSING row = the org has not adopted that credential: it shows
--    "N/A" in the matrix and never gates anything.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.org_credential_policies (
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  credential_code  text NOT NULL REFERENCES certs.credential_definitions(code) ON DELETE CASCADE,
  required_for_all boolean NOT NULL DEFAULT false,
  warn_windows     integer[] NOT NULL DEFAULT '{60,30,14,0}',
  grace_days       integer NOT NULL DEFAULT 0 CHECK (grace_days BETWEEN 0 AND 365),
  enabled          boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, credential_code)
);

ALTER TABLE certs.org_credential_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_credential_policies_select ON certs.org_credential_policies;
CREATE POLICY org_credential_policies_select
  ON certs.org_credential_policies FOR SELECT
  TO authenticated
  USING (public.ent_is_org_member(organization_id));

DROP POLICY IF EXISTS org_credential_policies_write ON certs.org_credential_policies;
CREATE POLICY org_credential_policies_write
  ON certs.org_credential_policies FOR ALL
  TO authenticated
  USING (public.ent_can_manage(organization_id))
  WITH CHECK (public.ent_can_manage(organization_id));

-- Windows validation (per-element range can't be a CHECK on an array).
CREATE OR REPLACE FUNCTION certs.org_credential_policies_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'certs'
  AS $function$
DECLARE
  w integer;
BEGIN
  IF cardinality(NEW.warn_windows) = 0 THEN
    RAISE EXCEPTION 'warn_windows must contain at least one tier' USING ERRCODE = '23514';
  END IF;
  FOREACH w IN ARRAY NEW.warn_windows LOOP
    IF w < 0 OR w > 3650 THEN
      RAISE EXCEPTION 'warn_windows elements must be between 0 and 3650 (0 = day-of-expiry notice)' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS org_credential_policies_guard ON certs.org_credential_policies;
CREATE TRIGGER org_credential_policies_guard
  BEFORE INSERT OR UPDATE ON certs.org_credential_policies
  FOR EACH ROW EXECUTE FUNCTION certs.org_credential_policies_guard();

-- ---------------------------------------------------------------------------
-- 6. pilot_credentials — the issued-credential registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.pilot_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_code   text NOT NULL REFERENCES certs.credential_definitions(code),

  -- pending_approval → active → expired | revoked | suspended.
  -- expired is materialized by the daily dispatcher for indexing, but the
  -- gate always recomputes currency from expires_date — never this column.
  status            text NOT NULL DEFAULT 'pending_approval'
                    CHECK (status IN ('pending_approval', 'active', 'expired', 'revoked', 'suspended')),

  issued_date       date,
  expires_date      date, -- NULL = does not expire
  issuing_authority text,
  source            text NOT NULL DEFAULT 'upload'
                    CHECK (source IN ('upload', 'internal_signoff', 'import')),
  notes             text CHECK (notes IS NULL OR char_length(notes) <= 2000),

  -- Verification (admin stamps) — same integrity contract as the vault.
  verified_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at       timestamptz,

  -- Internal sign-off actor (approval chain stamps this).
  issued_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Renewal chain: the credential this row supersedes.
  supersedes_id     uuid REFERENCES certs.pilot_credentials(id) ON DELETE SET NULL,

  -- Highest warning tier already dispatched (60 < 30 < 14 < 0). NULL = none.
  notified_tier     integer,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pilot_credentials_dates_order
    CHECK (issued_date IS NULL OR expires_date IS NULL OR expires_date >= issued_date),
  CONSTRAINT pilot_credentials_verified_pair
    CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
  -- Upload-sourced credentials only become active through admin verification.
  CONSTRAINT pilot_credentials_active_needs_provenance CHECK (
    status <> 'active' OR source <> 'upload' OR verified_at IS NOT NULL
  )
);

-- One live credential per (org, pilot, code): renewals supersede the old row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pilot_credentials_live
  ON certs.pilot_credentials(organization_id, user_id, credential_code)
  WHERE status IN ('pending_approval', 'active', 'suspended');

CREATE INDEX IF NOT EXISTS idx_pilot_credentials_org_expires
  ON certs.pilot_credentials(organization_id, expires_date);
CREATE INDEX IF NOT EXISTS idx_pilot_credentials_user
  ON certs.pilot_credentials(user_id, credential_code);

ALTER TABLE certs.pilot_credentials ENABLE ROW LEVEL SECURITY;

-- Sensitive-aware select: subject always; admins only non-sensitive rows;
-- sensitive rows for district/site admins and explicit grantees.
DROP POLICY IF EXISTS pilot_credentials_select ON certs.pilot_credentials;
CREATE POLICY pilot_credentials_select
  ON certs.pilot_credentials FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.ent_can_manage(organization_id)
      AND NOT certs.credential_is_sensitive(credential_code)
    )
    OR (
      certs.credential_is_sensitive(credential_code)
      AND certs.caller_can_view_sensitive(organization_id)
    )
  );

DROP POLICY IF EXISTS pilot_credentials_insert ON certs.pilot_credentials;
CREATE POLICY pilot_credentials_insert
  ON certs.pilot_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.ent_is_org_member(organization_id))
    OR public.ent_can_manage(organization_id)
  );

DROP POLICY IF EXISTS pilot_credentials_update ON certs.pilot_credentials;
CREATE POLICY pilot_credentials_update
  ON certs.pilot_credentials FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.ent_can_manage(organization_id)
      AND NOT certs.credential_is_sensitive(credential_code)
    )
    OR (
      certs.credential_is_sensitive(credential_code)
      AND certs.caller_can_view_sensitive(organization_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.ent_can_manage(organization_id)
  );

-- History is compliance evidence: only managers may prune mistakes, and the
-- audit trail records it.
DROP POLICY IF EXISTS pilot_credentials_delete ON certs.pilot_credentials;
CREATE POLICY pilot_credentials_delete
  ON certs.pilot_credentials FOR DELETE
  TO authenticated
  USING (public.ent_can_manage(organization_id));

-- ---------------------------------------------------------------------------
-- 6b. Verification guard — only ent_can_manage sets verified_*/lifecycle
--     columns. A pilot's insert always lands as pending_approval; any
--     pilot edit to evidence-bearing fields invalidates a prior
--     verification (a swapped certificate can never ride an old badge).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION certs.pilot_credentials_verification_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  v_is_admin boolean := public.ent_can_manage(NEW.organization_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_admin THEN
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
      NEW.issued_by   := NULL;
      NEW.notified_tier := NULL;
      NEW.status := 'pending_approval'; -- admin verification or approval chain activates it
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT v_is_admin THEN
    -- read-only columns for the owner: verification, lifecycle, provenance
    NEW.verified_by   := OLD.verified_by;
    NEW.verified_at   := OLD.verified_at;
    NEW.issued_by     := OLD.issued_by;
    NEW.notified_tier := OLD.notified_tier;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status := OLD.status;
    END IF;
    -- Any edit to evidence-bearing fields invalidates a prior verification
    -- (admins re-verify after re-upload; that is the point).
    IF NEW.issued_date IS DISTINCT FROM OLD.issued_date
       OR NEW.expires_date IS DISTINCT FROM OLD.expires_date
       OR NEW.credential_code IS DISTINCT FROM OLD.credential_code THEN
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS pilot_credentials_verification_guard ON certs.pilot_credentials;
CREATE TRIGGER pilot_credentials_verification_guard
  BEFORE INSERT OR UPDATE ON certs.pilot_credentials
  FOR EACH ROW EXECUTE FUNCTION certs.pilot_credentials_verification_guard();

-- ---------------------------------------------------------------------------
-- 6c. Audit trigger for pilot_credentials lifecycle changes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.audit_log (
  id         bigserial PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity     text NOT NULL,
  entity_id  text,
  action     text NOT NULL,
  old_state  jsonb,
  new_state  jsonb,
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_time ON certs.audit_log(org_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON certs.audit_log(entity, entity_id);

ALTER TABLE certs.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON certs.audit_log;
CREATE POLICY audit_log_select
  ON certs.audit_log FOR SELECT
  TO authenticated
  USING (
    public.ent_can_manage(org_id)
    OR actor_id = auth.uid()
  );

-- Writers go through security-definer functions only; no update/delete ever.
REVOKE INSERT, UPDATE, DELETE ON certs.audit_log FROM authenticated;
GRANT INSERT ON certs.audit_log TO service_role;

CREATE OR REPLACE FUNCTION certs.write_audit(
  _org uuid, _actor uuid, _entity text, _entity_id text,
  _action text, _old jsonb DEFAULT NULL, _new jsonb DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
BEGIN
  INSERT INTO certs.audit_log (org_id, actor_id, entity, entity_id, action, old_state, new_state)
  VALUES (_org, _actor, _entity, _entity_id, _action, _old, _new);
END;
$function$;

REVOKE ALL ON FUNCTION certs.write_audit(uuid, uuid, text, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION certs.write_audit(uuid, uuid, text, text, text, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION certs.pilot_credentials_audit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM certs.write_audit(
      NEW.organization_id, auth.uid(), 'pilot_credentials', NEW.id::text,
      'created', NULL,
      jsonb_build_object('credential_code', NEW.credential_code, 'status', NEW.status,
                         'expires_date', NEW.expires_date, 'user_id', NEW.user_id));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.expires_date IS DISTINCT FROM NEW.expires_date
       OR OLD.verified_at IS DISTINCT FROM NEW.verified_at THEN
      PERFORM certs.write_audit(
        NEW.organization_id, auth.uid(), 'pilot_credentials', NEW.id::text,
        CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_changed' ELSE 'updated' END,
        jsonb_build_object('status', OLD.status, 'expires_date', OLD.expires_date,
                           'verified_at', OLD.verified_at),
        jsonb_build_object('status', NEW.status, 'expires_date', NEW.expires_date,
                           'verified_at', NEW.verified_at));
    END IF;
  ELSE
    PERFORM certs.write_audit(
      OLD.organization_id, auth.uid(), 'pilot_credentials', OLD.id::text,
      'deleted', jsonb_build_object('credential_code', OLD.credential_code, 'status', OLD.status), NULL);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS pilot_credentials_audit ON certs.pilot_credentials;
CREATE TRIGGER pilot_credentials_audit
  AFTER INSERT OR UPDATE OR DELETE ON certs.pilot_credentials
  FOR EACH ROW EXECUTE FUNCTION certs.pilot_credentials_audit();

-- ---------------------------------------------------------------------------
-- 7. credential_documents — versioned, hash-pinned evidence.
--    sha256 computed client-side (crypto.subtle) at upload; immutable.
--    Versions retire (is_current=false, superseded_by_id set) but a
--    current version can never be deleted — evidence outlives the credential.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.credential_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id    uuid NOT NULL REFERENCES certs.pilot_credentials(id) ON DELETE CASCADE,
  version_no       integer NOT NULL CHECK (version_no > 0),
  file_name        text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 200),
  mime_type        text NOT NULL DEFAULT 'application/octet-stream',
  file_path        text NOT NULL, -- storage object key (cert-vault bucket), never public
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  is_current       boolean NOT NULL DEFAULT true,
  superseded_by_id uuid REFERENCES certs.credential_documents(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT credential_documents_version_unique UNIQUE (credential_id, version_no),
  CONSTRAINT credential_documents_supersede_shape CHECK (
    (is_current AND superseded_by_id IS NULL)
    OR (NOT is_current AND (superseded_by_id IS NULL OR superseded_by_id <> id))
  )
);

CREATE INDEX IF NOT EXISTS idx_credential_documents_credential
  ON certs.credential_documents(credential_id);

ALTER TABLE certs.credential_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credential_documents_select ON certs.credential_documents;
CREATE POLICY credential_documents_select
  ON certs.credential_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM certs.pilot_credentials pc
      WHERE pc.id = credential_id
        AND (
          pc.user_id = auth.uid()
          OR (
            public.ent_can_manage(pc.organization_id)
            AND NOT certs.credential_is_sensitive(pc.credential_code)
          )
          OR (
            certs.credential_is_sensitive(pc.credential_code)
            AND certs.caller_can_view_sensitive(pc.organization_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS credential_documents_insert ON certs.credential_documents;
CREATE POLICY credential_documents_insert
  ON certs.credential_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM certs.pilot_credentials pc
      WHERE pc.id = credential_id
        AND (pc.user_id = auth.uid() OR public.ent_can_manage(pc.organization_id))
    )
  );

DROP POLICY IF EXISTS credential_documents_update ON certs.credential_documents;
CREATE POLICY credential_documents_update
  ON certs.credential_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM certs.pilot_credentials pc
      WHERE pc.id = credential_id
        AND (pc.user_id = auth.uid() OR public.ent_can_manage(pc.organization_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM certs.pilot_credentials pc
      WHERE pc.id = credential_id
        AND (pc.user_id = auth.uid() OR public.ent_can_manage(pc.organization_id))
    )
  );

DROP POLICY IF EXISTS credential_documents_delete ON certs.credential_documents;
CREATE POLICY credential_documents_delete
  ON certs.credential_documents FOR DELETE
  TO authenticated
  USING (
    is_current = false
    AND EXISTS (
      SELECT 1 FROM certs.pilot_credentials pc
      WHERE pc.id = credential_id
        AND (pc.user_id = auth.uid() OR public.ent_can_manage(pc.organization_id))
    )
  );

CREATE OR REPLACE FUNCTION certs.credential_documents_immutability()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'certs'
  AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_current THEN
      RAISE EXCEPTION 'Current evidence versions are immutable and cannot be deleted'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: file identity is frozen at creation.
  IF NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.credential_id IS DISTINCT FROM OLD.credential_id
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
    RAISE EXCEPTION 'Evidence file identity is immutable; upload a new version instead'
      USING ERRCODE = '42501';
  END IF;

  -- Retiring must record the successor; un-retiring is not allowed.
  IF NOT NEW.is_current AND NEW.superseded_by_id IS NULL AND OLD.is_current THEN
    RAISE EXCEPTION 'Retiring a version requires superseded_by_id' USING ERRCODE = '23514';
  END IF;
  IF OLD.is_current = false AND NEW.is_current THEN
    RAISE EXCEPTION 'Retired versions cannot be restored; upload a new version instead'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS credential_documents_immutability ON certs.credential_documents;
CREATE TRIGGER credential_documents_immutability
  BEFORE UPDATE OR DELETE ON certs.credential_documents
  FOR EACH ROW EXECUTE FUNCTION certs.credential_documents_immutability();

-- ---------------------------------------------------------------------------
-- 8. credential_approvals — internal checkout sign-off chain.
--    evaluation → document_review → final_signoff. Ordered by trigger;
--    final approval activates the credential (definer) and stamps
--    issued_by + a signature hash as digital sign-off evidence.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.credential_approvals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id    uuid NOT NULL REFERENCES certs.pilot_credentials(id) ON DELETE CASCADE,
  stage            text NOT NULL CHECK (stage IN ('evaluation', 'document_review', 'final_signoff')),
  decided_by       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  decision         text NOT NULL CHECK (decision IN ('approved', 'rejected', 'requested_changes')),
  evaluation_notes text CHECK (evaluation_notes IS NULL OR char_length(evaluation_notes) <= 4000),
  flight_log_refs  text[] NOT NULL DEFAULT '{}',
  signature_sha256 text,
  decided_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT credential_approvals_stage_unique UNIQUE (credential_id, stage),
  CONSTRAINT credential_approvals_signature_on_approve CHECK (
    decision <> 'approved' OR signature_sha256 IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_credential_approvals_credential
  ON certs.credential_approvals(credential_id);

ALTER TABLE certs.credential_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credential_approvals_select ON certs.credential_approvals;
CREATE POLICY credential_approvals_select
  ON certs.credential_approvals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM certs.pilot_credentials pc
      WHERE pc.id = credential_id
        AND (pc.user_id = auth.uid() OR public.ent_can_manage(pc.organization_id))
    )
  );

DROP POLICY IF EXISTS credential_approvals_write ON certs.credential_approvals;
CREATE POLICY credential_approvals_write
  ON certs.credential_approvals FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM certs.pilot_credentials pc
      WHERE pc.id = credential_id AND public.ent_can_manage(pc.organization_id)
    )
  )
  WITH CHECK (
    decided_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM certs.pilot_credentials pc
      WHERE pc.id = credential_id AND public.ent_can_manage(pc.organization_id)
    )
  );

CREATE OR REPLACE FUNCTION certs.credential_approvals_lifecycle()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  v_stage_order text[] := ARRAY['evaluation', 'document_review', 'final_signoff'];
  v_idx         integer;
  v_prev        text;
  v_org         uuid;
  v_user        uuid;
  v_code        text;
BEGIN
  v_idx := array_position(v_stage_order, NEW.stage);
  IF v_idx > 1 THEN
    v_prev := v_stage_order[v_idx - 1];
    IF NOT EXISTS (
      SELECT 1 FROM certs.credential_approvals a
      WHERE a.credential_id = NEW.credential_id
        AND a.stage = v_prev AND a.decision = 'approved'
    ) THEN
      RAISE EXCEPTION 'Stage % requires % to be approved first', NEW.stage, v_prev
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT organization_id, user_id, credential_code
    INTO v_org, v_user, v_code
    FROM certs.pilot_credentials WHERE id = NEW.credential_id;

  IF NEW.decision = 'approved' THEN
    NEW.signature_sha256 := encode(
      extensions.digest(NEW.credential_id::text || ':' || NEW.stage || ':' || NEW.decided_by::text || ':' || NEW.decided_at::text, 'sha256'),
      'hex'
    );
    IF NEW.stage = 'final_signoff' THEN
      UPDATE certs.pilot_credentials
         SET status = 'active',
             issued_by = NEW.decided_by,
             source = 'internal_signoff',
             issued_date = COALESCE(issued_date, CURRENT_DATE),
             updated_at = now()
       WHERE id = NEW.credential_id;
      PERFORM certs.write_audit(
        v_org, NEW.decided_by, 'pilot_credentials', NEW.credential_id::text,
        'internal_checkout_activated',
        jsonb_build_object('credential_code', v_code, 'status', 'pending_approval'),
        jsonb_build_object('credential_code', v_code, 'status', 'active', 'pilot', v_user)
      );
    END IF;
  ELSE
    -- rejected / requested_changes returns the credential to pending.
    UPDATE certs.pilot_credentials
       SET status = 'pending_approval', updated_at = now()
     WHERE id = NEW.credential_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS credential_approvals_lifecycle ON certs.credential_approvals;
CREATE TRIGGER credential_approvals_lifecycle
  BEFORE INSERT ON certs.credential_approvals
  FOR EACH ROW EXECUTE FUNCTION certs.credential_approvals_lifecycle();

-- ---------------------------------------------------------------------------
-- 9. org_waivers + pilot_waiver_authorizations — org-level exemptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.org_waivers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  waiver_type      text NOT NULL CHECK (waiver_type IN (
                     'part_107_29_night', 'part_107_31_vehicle', 'part_107_39_people',
                     'part_107_41_bvlos', 'coa', 'other')),
  identifier       text NOT NULL, -- e.g. WAIVER-2026-1142 or COA number
  authority        text NOT NULL DEFAULT 'FAA',
  jurisdiction     text NOT NULL DEFAULT 'FAA' CHECK (jurisdiction IN ('FAA', 'EASA', 'TC', 'FCC', 'internal')),
  effective_date   date NOT NULL,
  expiration_date  date NOT NULL,
  restrictions     text[] NOT NULL DEFAULT '{}',
  document_path    text, -- cert-vault object key of the FAA letter
  notes            text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'surrendered')),
  notified_tier    integer,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT org_waivers_dates_order CHECK (expiration_date >= effective_date)
);

CREATE INDEX IF NOT EXISTS idx_org_waivers_org ON certs.org_waivers(organization_id, expiration_date);

ALTER TABLE certs.org_waivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_waivers_select ON certs.org_waivers;
CREATE POLICY org_waivers_select
  ON certs.org_waivers FOR SELECT
  TO authenticated
  USING (public.ent_is_org_member(organization_id));

DROP POLICY IF EXISTS org_waivers_write ON certs.org_waivers;
CREATE POLICY org_waivers_write
  ON certs.org_waivers FOR ALL
  TO authenticated
  USING (public.ent_can_manage(organization_id))
  WITH CHECK (public.ent_can_manage(organization_id));

CREATE TABLE IF NOT EXISTS certs.pilot_waiver_authorizations (
  waiver_id                 uuid NOT NULL REFERENCES certs.org_waivers(id) ON DELETE CASCADE,
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by                uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                date,
  acknowledged_restrictions boolean NOT NULL DEFAULT false,

  PRIMARY KEY (waiver_id, user_id),
  CONSTRAINT pilot_waiver_auth_not_self_granted CHECK (granted_by <> user_id)
);

ALTER TABLE certs.pilot_waiver_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pilot_waiver_authorizations_select ON certs.pilot_waiver_authorizations;
CREATE POLICY pilot_waiver_authorizations_select
  ON certs.pilot_waiver_authorizations FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM certs.org_waivers w
      WHERE w.id = waiver_id AND public.ent_is_org_member(w.organization_id)
    )
  );

DROP POLICY IF EXISTS pilot_waiver_authorizations_write ON certs.pilot_waiver_authorizations;
CREATE POLICY pilot_waiver_authorizations_write
  ON certs.pilot_waiver_authorizations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM certs.org_waivers w
      WHERE w.id = waiver_id AND public.ent_can_manage(w.organization_id)
    )
  )
  WITH CHECK (
    granted_by = auth.uid()
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM certs.org_waivers w
      WHERE w.id = waiver_id AND public.ent_can_manage(w.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 10. mission_profiles — booking requirement templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.mission_profiles (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                      text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description               text,
  required_credential_codes text[] NOT NULL DEFAULT '{}',
  required_waiver_types     text[] NOT NULL DEFAULT '{}',
  jurisdiction              text NOT NULL DEFAULT 'FAA' CHECK (jurisdiction IN ('FAA', 'EASA', 'TC', 'FCC', 'internal')),
  default_duration_minutes  integer,
  active                    boolean NOT NULL DEFAULT true,
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_profiles_org ON certs.mission_profiles(organization_id);

ALTER TABLE certs.mission_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mission_profiles_select ON certs.mission_profiles;
CREATE POLICY mission_profiles_select
  ON certs.mission_profiles FOR SELECT
  TO authenticated
  USING (public.ent_is_org_member(organization_id));

DROP POLICY IF EXISTS mission_profiles_write ON certs.mission_profiles;
CREATE POLICY mission_profiles_write
  ON certs.mission_profiles FOR ALL
  TO authenticated
  USING (public.ent_can_manage(organization_id))
  WITH CHECK (public.ent_can_manage(organization_id));

-- Referential validation for the arrays (subqueries are illegal in CHECK).
CREATE OR REPLACE FUNCTION certs.mission_profiles_validate()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'certs'
  AS $function$
DECLARE
  c text;
  w text;
BEGIN
  FOREACH c IN ARRAY NEW.required_credential_codes LOOP
    IF NOT EXISTS (SELECT 1 FROM certs.credential_definitions d WHERE d.code = c) THEN
      RAISE EXCEPTION 'Unknown credential code in required_credential_codes: %', c
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOREACH w IN ARRAY NEW.required_waiver_types LOOP
    IF w NOT IN ('part_107_29_night', 'part_107_31_vehicle', 'part_107_39_people',
                 'part_107_41_bvlos', 'coa', 'other') THEN
      RAISE EXCEPTION 'Unknown waiver type in required_waiver_types: %', w
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS mission_profiles_validate ON certs.mission_profiles;
CREATE TRIGGER mission_profiles_validate
  BEFORE INSERT OR UPDATE ON certs.mission_profiles
  FOR EACH ROW EXECUTE FUNCTION certs.mission_profiles_validate();

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedules_mission_profile_fkey'
  ) THEN
    ALTER TABLE edu.schedules
      ADD CONSTRAINT schedules_mission_profile_fkey
      FOREIGN KEY (mission_profile_id) REFERENCES certs.mission_profiles(id) ON DELETE SET NULL;
  END IF;
END $do$;

-- ---------------------------------------------------------------------------
-- 11. notification_outbox — queued channel dispatch (idempotent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certs.notification_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel         text NOT NULL CHECK (channel IN ('in_app', 'email', 'sms')),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ref_type        text NOT NULL CHECK (ref_type IN ('credential', 'waiver', 'recency')),
  ref_id          text,
  cadence_day     integer,
  subject         text NOT NULL,
  body            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
  scheduled_for   timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  attempts        integer NOT NULL DEFAULT 0,
  dedupe_key      text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT outbox_sent_needs_timestamp CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON certs.notification_outbox(status, scheduled_for)
  WHERE status = 'pending';

ALTER TABLE certs.notification_outbox ENABLE ROW LEVEL SECURITY;

-- Pilots see their own queue; org admins see the org's queue; only the
-- service role (worker edge function) transitions status.
DROP POLICY IF EXISTS outbox_select ON certs.notification_outbox;
CREATE POLICY outbox_select
  ON certs.notification_outbox FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.ent_can_manage(organization_id)
  );

DROP POLICY IF EXISTS outbox_insert ON certs.notification_outbox;
CREATE POLICY outbox_insert
  ON certs.notification_outbox FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS outbox_update ON certs.notification_outbox;
CREATE POLICY outbox_update
  ON certs.notification_outbox FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 12. Audit: signed compliance overrides on bookings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION certs.schedules_override_audit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  v_org uuid;
BEGIN
  IF NEW.compliance_override_by IS NOT NULL AND NEW.mission_profile_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.compliance_override_by IS NULL) THEN
    SELECT organization_id INTO v_org
      FROM certs.mission_profiles WHERE id = NEW.mission_profile_id;
    PERFORM certs.write_audit(
      v_org, NEW.compliance_override_by, 'edu_schedules', NEW.id::text,
      'compliance_override',
      NULL,
      jsonb_build_object('reason', NEW.compliance_override_reason,
                         'assigned_user_id', NEW.assigned_user_id));
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS schedules_override_audit ON edu.schedules;
CREATE TRIGGER schedules_override_audit
  AFTER INSERT OR UPDATE ON edu.schedules
  FOR EACH ROW EXECUTE FUNCTION certs.schedules_override_audit();

-- ---------------------------------------------------------------------------
-- 13. CURRENCY ENGINE
-- ---------------------------------------------------------------------------

-- All org members (roster for the matrix). Callsigns come from
-- pilot_settings, never email (FERPA — see 20260927000000).
CREATE OR REPLACE FUNCTION certs.org_roster(_org uuid)
  RETURNS TABLE (user_id uuid, callsign text, team_role text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
  SELECT tm.user_id,
         COALESCE(NULLIF(btrim(ps.callsign), ''), 'Pilot ' || left(tm.user_id::text, 8)) AS callsign,
         tm.team_role::text AS team_role
    FROM public.team_members tm
    JOIN public.organizations o ON o.team_id = tm.team_id
    LEFT JOIN public.pilot_settings ps ON ps.user_id = tm.user_id
   WHERE o.id = _org
   ORDER BY 2;
$function$;

REVOKE ALL ON FUNCTION certs.org_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION certs.org_roster(uuid) TO authenticated;

-- THE single source of truth for currency, consumed by the gate, the
-- fleet matrix, and the passport. Computes, per org member × adopted
-- credential: date currency (recomputed from expires_date + grace),
-- verification state, and flight recency (against public.flights).
-- Sensitive rows are returned with dates MASKED unless the caller may
-- view sensitive data (color-only in the matrix).
CREATE OR REPLACE FUNCTION certs.pilot_compliance_status(
  _org uuid,
  _on date DEFAULT CURRENT_DATE
)
  RETURNS TABLE (
    user_id          uuid,
    credential_code  text,
    state            text,      -- active | expiring | expiring_soon | recency_lapsed | unverified | pending_approval | missing | expired | revoked | suspended | not_adopted
    ok               boolean,   -- may gated operations proceed?
    reason           text,
    issued_date      date,
    expires_date     date,
    days_to_expiry   integer,
    verified         boolean,
    recency_ok       boolean,
    recency_count    integer,
    recency_required integer,
    sensitive        boolean,
    category         text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  r_member  record;
  r_policy  record;
  v_cred    record;
  v_days    integer;
  v_state   text;
  v_ok      boolean;
  v_reason  text;
  v_rec_ok  boolean;
  v_rec_n   integer;
  v_rec_req integer;
  v_warn    integer;
  v_mask    boolean;
BEGIN
  -- No-JWT context (migrations, pg_cron, direct SQL as postgres) is a
  -- trusted service context; the membership check only applies to JWT callers.
  IF auth.uid() IS NOT NULL
     AND NOT (public.ent_is_org_member(_org) OR public.ent_can_manage(_org)) THEN
    RAISE EXCEPTION 'Not a member of this organization' USING ERRCODE = '42501';
  END IF;

  v_mask := NOT certs.caller_can_view_sensitive(_org);

  FOR r_member IN
    SELECT tm.user_id
      FROM public.team_members tm
      JOIN public.organizations o ON o.team_id = tm.team_id
     WHERE o.id = _org
  LOOP
    FOR r_policy IN
      SELECT p.credential_code, p.required_for_all, p.warn_windows, p.grace_days,
             d.category, d.sensitive, d.recency_rule, d.verification_required
        FROM certs.org_credential_policies p
        JOIN certs.credential_definitions d ON d.code = p.credential_code
       WHERE p.organization_id = _org AND p.enabled
    LOOP
      v_state := NULL; v_ok := false; v_reason := NULL;
      v_rec_ok := true; v_rec_n := NULL; v_rec_req := NULL;
      v_days := NULL;
      SELECT max(w) INTO v_warn FROM unnest(r_policy.warn_windows) w;

      SELECT * INTO v_cred FROM certs.pilot_credentials pc
       WHERE pc.organization_id = _org
         AND pc.user_id = r_member.user_id
         AND pc.credential_code = r_policy.credential_code
         AND pc.status IN ('pending_approval', 'active', 'suspended')
       LIMIT 1;

      IF v_cred.id IS NULL THEN
        IF r_policy.required_for_all THEN
          v_state := 'missing'; v_ok := false;
          v_reason := 'Required credential not on file';
        ELSE
          v_state := 'not_adopted'; v_ok := true;
          v_reason := 'Optional — not held';
        END IF;
      ELSE
        IF v_cred.status = 'pending_approval' THEN
          v_state := 'pending_approval'; v_ok := false;
          v_reason := 'Awaiting sign-off';
        ELSIF v_cred.status IN ('revoked', 'suspended') THEN
          v_state := v_cred.status; v_ok := false;
          v_reason := initcap(v_cred.status) || ' by safety management';
        ELSIF r_policy.verification_required AND v_cred.verified_at IS NULL THEN
          v_state := 'unverified'; v_ok := false;
          v_reason := 'Awaiting admin verification';
        ELSE
          -- Date currency — recomputed, never the stored status column.
          IF v_cred.expires_date IS NOT NULL THEN
            v_days := (v_cred.expires_date + r_policy.grace_days - _on);
            IF v_days < 0 THEN
              v_state := 'expired'; v_ok := false;
              v_reason := 'Expired ' || abs(v_days)::text || ' day(s) ago';
            END IF;
          END IF;

          -- Flight recency — computed against real logged flights.
          IF v_state IS NULL AND r_policy.recency_rule IS NOT NULL THEN
            v_rec_req := (r_policy.recency_rule->>'count')::int;
            v_rec_n := (
              SELECT count(*)::int FROM public.flights f
               WHERE f.user_id = r_member.user_id
                 AND f.date >= (_on - (r_policy.recency_rule->>'window_days')::int)
                 AND (NOT COALESCE((r_policy.recency_rule->>'night_only')::boolean, false) OR f.night_flight)
            );
            v_rec_ok := v_rec_n >= v_rec_req;
            IF NOT v_rec_ok THEN
              v_state := 'recency_lapsed'; v_ok := false;
              v_reason := 'Recency lapsed: ' || v_rec_n::text || '/' || v_rec_req::text
                          || ' qualifying flight(s) in window';
            END IF;
          END IF;

          IF v_state IS NULL THEN
            IF v_cred.expires_date IS NOT NULL AND v_days <= v_warn THEN
              v_state := CASE WHEN v_days <= 14 THEN 'expiring_soon' ELSE 'expiring' END;
              v_reason := 'Expires in ' || v_days::text || ' day(s)';
            ELSE
              v_state := 'active'; v_reason := 'Current';
            END IF;
            v_ok := true;
          END IF;
        END IF;
      END IF;

      user_id          := r_member.user_id;
      credential_code  := r_policy.credential_code;
      state            := v_state;
      ok               := v_ok;
      reason           := v_reason;
      -- Mask sensitive dates for callers without sensitive access.
      issued_date      := CASE WHEN (r_policy.sensitive AND v_mask) THEN NULL ELSE v_cred.issued_date END;
      expires_date     := CASE WHEN (r_policy.sensitive AND v_mask) THEN NULL ELSE v_cred.expires_date END;
      days_to_expiry   := CASE WHEN (r_policy.sensitive AND v_mask) THEN NULL ELSE v_days END;
      verified         := (v_cred.verified_at IS NOT NULL);
      recency_ok       := v_rec_ok;
      recency_count    := v_rec_n;
      recency_required := v_rec_req;
      sensitive        := r_policy.sensitive;
      category         := r_policy.category;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION certs.pilot_compliance_status(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION certs.pilot_compliance_status(uuid, date) TO authenticated;

-- Point check used by the gate: is the pilot OK for each required code?
CREATE OR REPLACE FUNCTION certs.booking_credential_check(
  _org uuid,
  _user uuid,
  _codes text[],
  _on date DEFAULT CURRENT_DATE
)
  RETURNS TABLE (credential_code text, ok boolean, reason text, category text)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  r      text;
  v_row  record;
BEGIN
  FOREACH r IN ARRAY _codes LOOP
    SELECT * INTO v_row
      FROM certs.pilot_compliance_status(_org, _on) s
     WHERE s.user_id = _user AND s.credential_code = r
     LIMIT 1;

    IF NOT FOUND THEN
      credential_code := r; ok := false;
      reason := 'Not adopted by this organization (configure org credential policy)';
      category := 'unknown';
    ELSE
      credential_code := r; ok := v_row.ok; reason := v_row.reason; category := v_row.category;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION certs.booking_credential_check(uuid, uuid, text[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION certs.booking_credential_check(uuid, uuid, text[], date) TO authenticated;

-- Waiver check: org waiver active + pilot authorized under it.
CREATE OR REPLACE FUNCTION certs.booking_waiver_check(
  _org uuid,
  _user uuid,
  _waiver_types text[],
  _on date DEFAULT CURRENT_DATE
)
  RETURNS TABLE (waiver_type text, ok boolean, reason text)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  w        text;
  v_waiver record;
BEGIN
  FOREACH w IN ARRAY _waiver_types LOOP
    SELECT * INTO v_waiver FROM certs.org_waivers ow
     WHERE ow.organization_id = _org AND ow.waiver_type = w AND ow.status = 'active'
       AND ow.effective_date <= _on AND ow.expiration_date >= _on
     ORDER BY ow.expiration_date DESC LIMIT 1;

    IF NOT FOUND THEN
      waiver_type := w; ok := false;
      reason := 'No active organizational waiver/COA of this type — contact your safety manager';
    ELSIF NOT EXISTS (
      SELECT 1 FROM certs.pilot_waiver_authorizations a
       WHERE a.waiver_id = v_waiver.id AND a.user_id = _user
         AND (a.expires_at IS NULL OR a.expires_at >= _on)
    ) THEN
      waiver_type := w; ok := false;
      reason := 'Organization waiver exists but you are not authorized under it';
    ELSE
      waiver_type := w; ok := true;
      reason := 'Authorized under ' || v_waiver.identifier;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION certs.booking_waiver_check(uuid, uuid, text[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION certs.booking_waiver_check(uuid, uuid, text[], date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. THE GATE — "No-Fly, No-Schedule"
-- ---------------------------------------------------------------------------

-- Booking gate on edu.schedules. NOTE: edu.schedules.organization_id
-- references teams.id, so map team → organizations.id first. Gated set:
-- mission-profile requirements UNION org-mandated (required_for_all)
-- credentials — a pilot without current Part 107 cannot book anything.
CREATE OR REPLACE FUNCTION certs.schedules_credential_gate()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  v_org          uuid;
  v_codes        text[] := '{}';
  v_profile      record;
  v_waivers      text[] := '{}';
  v_fail         jsonb  := '[]'::jsonb;
  v_fail_federal boolean := false;
  r              record;
BEGIN
  SELECT o.id INTO v_org
    FROM public.organizations o
   WHERE o.team_id = NEW.organization_id;

  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('scheduled', 'checked_in') THEN
    RETURN NEW; -- history rows never gate
  END IF;

  -- Org-mandated credentials always gate active bookings.
  SELECT COALESCE(array_agg(p.credential_code), '{}') INTO v_codes
    FROM certs.org_credential_policies p
   WHERE p.organization_id = v_org AND p.enabled AND p.required_for_all;

  -- Mission-profile requirements join the mandated set.
  IF NEW.mission_profile_id IS NOT NULL THEN
    SELECT * INTO v_profile FROM certs.mission_profiles WHERE id = NEW.mission_profile_id;
    IF v_profile.id IS NOT NULL THEN
      v_codes := ARRAY(
        SELECT DISTINCT unnest(array_cat(v_codes, v_profile.required_credential_codes))
      );
      v_waivers := v_profile.required_waiver_types;
    END IF;
  END IF;

  -- Credential requirements
  IF cardinality(v_codes) > 0 THEN
    FOR r IN SELECT * FROM certs.booking_credential_check(v_org, NEW.assigned_user_id, v_codes)
    LOOP
      IF NOT r.ok THEN
        v_fail := v_fail || jsonb_build_object('kind', 'credential', 'code', r.credential_code, 'reason', r.reason);
        IF r.category = 'federal_certificate' THEN
          v_fail_federal := true;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Waiver requirements
  IF cardinality(v_waivers) > 0 THEN
    FOR r IN SELECT * FROM certs.booking_waiver_check(v_org, NEW.assigned_user_id, v_waivers)
    LOOP
      IF NOT r.ok THEN
        v_fail := v_fail || jsonb_build_object('kind', 'waiver', 'code', r.waiver_type, 'reason', r.reason);
      END IF;
    END LOOP;
  END IF;

  IF jsonb_array_length(v_fail) = 0 THEN
    RETURN NEW; -- fully compliant
  END IF;

  -- Override path: the ACTING user must be a manager overriding in their
  -- own name with a documented reason — and federal certificates never
  -- override.
  IF NEW.compliance_override_by IS NOT NULL
     AND NEW.compliance_override_by = auth.uid()
     AND COALESCE(btrim(NEW.compliance_override_reason), '') <> ''
     AND public.ent_can_manage(v_org)
     AND NOT v_fail_federal THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'No-Fly, No-Schedule: booking violates credential requirements'
    USING ERRCODE = 'P0001',
          DETAIL = v_fail::text,
          HINT = CASE WHEN v_fail_federal
                 THEN 'An expired federal certificate cannot be overridden. The pilot must renew first.'
                 ELSE 'A safety manager may override non-federal blocks with a documented reason (set compliance_override_by/_reason).' END;
END;
$function$;

DROP TRIGGER IF EXISTS schedules_credential_gate ON edu.schedules;
CREATE TRIGGER schedules_credential_gate
  BEFORE INSERT OR UPDATE OF mission_profile_id, status, assigned_user_id,
                             compliance_override_by, compliance_override_reason
  ON edu.schedules
  FOR EACH ROW EXECUTE FUNCTION certs.schedules_credential_gate();

-- Gear checkout gate: gear with required_credential_code demands it.
CREATE OR REPLACE FUNCTION certs.checkout_credential_gate()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'org_gear', 'certs'
  AS $function$
DECLARE
  v_org  uuid;
  v_code text;
  v_row  record;
BEGIN
  SELECT o.id, sg.required_credential_code
    INTO v_org, v_code
    FROM org_gear.squadron_gear sg
    JOIN public.organizations o ON o.team_id = sg.team_id
   WHERE sg.id = NEW.gear_id;

  IF v_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_row
    FROM certs.booking_credential_check(v_org, NEW.checked_out_by, ARRAY[v_code])
    LIMIT 1;

  IF v_row.ok IS NOT TRUE THEN
    RAISE EXCEPTION 'No-Fly, No-Schedule: gear checkout blocked'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object('kind', 'credential', 'code', v_code, 'reason', v_row.reason)::text,
            HINT = 'Obtain the required credential before checking out this gear.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS checkout_credential_gate ON org_gear.squadron_gear_checkouts;
CREATE TRIGGER checkout_credential_gate
  BEFORE INSERT ON org_gear.squadron_gear_checkouts
  FOR EACH ROW EXECUTE FUNCTION certs.checkout_credential_gate();

-- Friendly pre-flight preview for the booking dialog (server truth).
CREATE OR REPLACE FUNCTION certs.preview_booking_requirements(
  _org uuid,
  _profile uuid,
  _user uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    kind        text,
    code        text,
    label       text,
    ok          boolean,
    reason      text,
    overridable boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  v_codes   text[];
  v_waivers text[];
  r         record;
BEGIN
  -- Members may preview only themselves; managers may preview anyone.
  IF _user <> auth.uid() AND NOT public.ent_can_manage(_org) THEN
    RAISE EXCEPTION 'Not permitted to preview another pilot''s requirements' USING ERRCODE = '42501';
  END IF;

  SELECT required_credential_codes, required_waiver_types
    INTO v_codes, v_waivers
    FROM certs.mission_profiles
   WHERE id = _profile AND organization_id = _org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission profile not found in this organization' USING ERRCODE = 'P0002';
  END IF;

  FOR r IN SELECT * FROM certs.booking_credential_check(_org, _user, v_codes) LOOP
    kind := 'credential'; code := r.credential_code;
    label := COALESCE(
      (SELECT d.name FROM certs.credential_definitions d WHERE d.code = r.credential_code),
      r.credential_code);
    ok := r.ok; reason := r.reason;
    overridable := (r.category <> 'federal_certificate');
    RETURN NEXT;
  END LOOP;

  FOR r IN SELECT * FROM certs.booking_waiver_check(_org, _user, v_waivers) LOOP
    kind := 'waiver'; code := r.waiver_type;
    label := 'Waiver: ' || r.waiver_type;
    ok := r.ok; reason := r.reason;
    overridable := false; -- org-level: fix the org waiver, don't override the pilot
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION certs.preview_booking_requirements(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION certs.preview_booking_requirements(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 15. DISPATCHER — expiration sweep + warning cadence (pg_cron daily).
--     Tiers: 60 (early) / 30 & 14 (urgent) / 0 (critical). Idempotent via
--     notified_tier + unique dedupe_key + org warn_windows. In-app rows
--     also land in public.notifications immediately; email/sms queue for
--     the worker edge function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION certs.dispatch_expiration_notices(_as_of date DEFAULT CURRENT_DATE)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'certs'
  AS $function$
DECLARE
  v_sent    integer := 0;
  r         record;
  a         record;
  v_tier    integer;
  v_windows integer[];
  v_subject text;
  v_body    text;
  v_admins  uuid[];
BEGIN
  -- 1. Materialize expired transitions (the gate recomputes anyway; this
  --    keeps matrix queries and indexes honest).
  UPDATE certs.pilot_credentials pc
     SET status = 'expired', updated_at = now()
   WHERE pc.status = 'active'
     AND pc.expires_date IS NOT NULL
     AND pc.expires_date + COALESCE((
       SELECT p.grace_days FROM certs.org_credential_policies p
        WHERE p.organization_id = pc.organization_id
          AND p.credential_code = pc.credential_code), 0) < _as_of;

  UPDATE certs.org_waivers
     SET status = 'expired', updated_at = now()
   WHERE status = 'active' AND expiration_date < _as_of;

  -- 2. Credential notices.
  FOR r IN
    SELECT pc.id, pc.organization_id, pc.user_id, pc.credential_code,
           pc.expires_date, pc.notified_tier, d.name AS cred_name,
           COALESCE(p.warn_windows, ARRAY[60, 30, 14, 0]) AS windows
      FROM certs.pilot_credentials pc
      JOIN certs.credential_definitions d ON d.code = pc.credential_code
      LEFT JOIN certs.org_credential_policies p
        ON p.organization_id = pc.organization_id AND p.credential_code = pc.credential_code
     WHERE pc.status IN ('active', 'pending_approval')
       AND pc.expires_date IS NOT NULL
       AND pc.expires_date < _as_of + 60
  LOOP
    v_tier := CASE
      WHEN r.expires_date < _as_of THEN 0
      WHEN r.expires_date <= _as_of + 14 THEN 14
      WHEN r.expires_date <= _as_of + 30 THEN 30
      ELSE 60 END;

    -- Skip tiers the org did not adopt, and tiers already dispatched.
    CONTINUE WHEN r.notified_tier IS NOT NULL AND v_tier >= r.notified_tier;
    CONTINUE WHEN NOT (v_tier = ANY (r.windows));

    v_subject := CASE
      WHEN v_tier = 0 THEN 'CRITICAL: ' || r.cred_name || ' has expired'
      WHEN v_tier >= 30 THEN 'URGENT: ' || r.cred_name || ' expires in ' || (r.expires_date - _as_of)::text || ' days'
      ELSE 'Notice: ' || r.cred_name || ' expires in ' || (r.expires_date - _as_of)::text || ' days' END;
    v_body := CASE
      WHEN v_tier = 0 THEN 'Your ' || r.cred_name || ' has EXPIRED. Scheduling and gear checkout are locked until renewed.'
      ELSE 'Your ' || r.cred_name || ' expires on ' || r.expires_date::text || '. Renew now to stay current.' END;

    -- In-app (immediate) + queued email.
    INSERT INTO public.notifications (title, message, target_user_id)
    VALUES (v_subject, v_body, r.user_id);
    INSERT INTO certs.notification_outbox (channel, user_id, organization_id, ref_type, ref_id, cadence_day, subject, body, dedupe_key)
    VALUES ('in_app', r.user_id, r.organization_id, 'credential', r.id::text, v_tier, v_subject, v_body,
            'cred:' || r.id || ':in_app:' || v_tier)
    ON CONFLICT (dedupe_key) DO NOTHING;
    INSERT INTO certs.notification_outbox (channel, user_id, organization_id, ref_type, ref_id, cadence_day, subject, body, dedupe_key)
    VALUES ('email', r.user_id, r.organization_id, 'credential', r.id::text, v_tier, v_subject, v_body,
            'cred:' || r.id || ':email:' || v_tier)
    ON CONFLICT (dedupe_key) DO NOTHING;

    -- Urgent tiers also notify org admins (supervisors).
    IF v_tier <= 30 THEN
      v_admins := ARRAY(
        SELECT DISTINCT tm.user_id
          FROM public.team_members tm
          JOIN public.organizations o ON o.team_id = tm.team_id
         WHERE o.id = r.organization_id AND tm.team_role IN ('owner', 'manager'));
      FOREACH a IN ARRAY v_admins LOOP
        CONTINUE WHEN a = r.user_id;
        INSERT INTO public.notifications (title, message, target_user_id)
        VALUES ('[Pilot alert] ' || v_subject, v_body, a);
        INSERT INTO certs.notification_outbox (channel, user_id, organization_id, ref_type, ref_id, cadence_day, subject, body, dedupe_key)
        VALUES ('email', a, r.organization_id, 'credential', r.id::text, v_tier, '[Pilot alert] ' || v_subject, v_body,
                'cred:' || r.id || ':admin:' || a::text || ':' || v_tier)
        ON CONFLICT (dedupe_key) DO NOTHING;
      END LOOP;
    END IF;

    UPDATE certs.pilot_credentials SET notified_tier = v_tier WHERE id = r.id;
    v_sent := v_sent + 1;
  END LOOP;

  -- 3. Waiver notices (org-level → admins only).
  FOR r IN
    SELECT w.id, w.organization_id, w.waiver_type, w.identifier, w.expiration_date, w.notified_tier
      FROM certs.org_waivers w
     WHERE w.status = 'active' AND w.expiration_date < _as_of + 60
  LOOP
    v_tier := CASE
      WHEN r.expiration_date < _as_of THEN 0
      WHEN r.expiration_date <= _as_of + 14 THEN 14
      WHEN r.expiration_date <= _as_of + 30 THEN 30
      ELSE 60 END;
    CONTINUE WHEN r.notified_tier IS NOT NULL AND v_tier >= r.notified_tier;

    v_subject := CASE WHEN v_tier = 0
      THEN 'CRITICAL: organizational waiver ' || r.identifier || ' has expired'
      ELSE 'Organizational waiver ' || r.identifier || ' expires in ' || (r.expiration_date - _as_of)::text || ' days' END;
    v_body := 'Renew the organizational waiver (' || r.waiver_type || ') to keep those operations lawful.';

    v_admins := ARRAY(
      SELECT DISTINCT tm.user_id
        FROM public.team_members tm
        JOIN public.organizations o ON o.team_id = tm.team_id
       WHERE o.id = r.organization_id AND tm.team_role IN ('owner', 'manager'));
    FOREACH a IN ARRAY v_admins LOOP
      INSERT INTO public.notifications (title, message, target_user_id)
      VALUES (v_subject, v_body, a);
      INSERT INTO certs.notification_outbox (channel, user_id, organization_id, ref_type, ref_id, cadence_day, subject, body, dedupe_key)
      VALUES ('email', a, r.organization_id, 'waiver', r.id::text, v_tier, v_subject, v_body,
              'waiver:' || r.id || ':admin:' || a::text || ':' || v_tier)
      ON CONFLICT (dedupe_key) DO NOTHING;
    END LOOP;

    UPDATE certs.org_waivers SET notified_tier = v_tier WHERE id = r.id;
    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$function$;

REVOKE ALL ON FUNCTION certs.dispatch_expiration_notices(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION certs.dispatch_expiration_notices(date) TO service_role;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('sticktime-certs-expiration-dispatch')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sticktime-certs-expiration-dispatch');
    PERFORM cron.schedule(
      'sticktime-certs-expiration-dispatch',
      '37 5 * * *',
      'SELECT certs.dispatch_expiration_notices()'
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — schedule certs.dispatch_expiration_notices() manually.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule cron job: %', SQLERRM;
END;
$do$;

-- ---------------------------------------------------------------------------
-- 16. Grants — RLS is the boundary; grants keep the surface narrow.
-- ---------------------------------------------------------------------------
REVOKE ALL ON certs.credential_definitions FROM anon, PUBLIC, authenticated;
GRANT SELECT ON certs.credential_definitions TO authenticated;

REVOKE ALL ON certs.org_credential_policies FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certs.org_credential_policies TO authenticated;

REVOKE ALL ON certs.pilot_credentials FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certs.pilot_credentials TO authenticated;

REVOKE ALL ON certs.credential_documents FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certs.credential_documents TO authenticated;

REVOKE ALL ON certs.credential_approvals FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT ON certs.credential_approvals TO authenticated;

REVOKE ALL ON certs.org_waivers FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certs.org_waivers TO authenticated;

REVOKE ALL ON certs.pilot_waiver_authorizations FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certs.pilot_waiver_authorizations TO authenticated;

REVOKE ALL ON certs.mission_profiles FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certs.mission_profiles TO authenticated;

REVOKE ALL ON certs.notification_outbox FROM anon, PUBLIC, authenticated;
GRANT SELECT ON certs.notification_outbox TO authenticated;

REVOKE ALL ON certs.sensitive_access_grants FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certs.sensitive_access_grants TO authenticated;

REVOKE ALL ON certs.audit_log FROM anon, PUBLIC, authenticated;
GRANT SELECT ON certs.audit_log TO authenticated;

REVOKE ALL ON FUNCTION certs.credential_is_sensitive(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION certs.credential_is_sensitive(text) TO authenticated;
REVOKE ALL ON FUNCTION certs.caller_can_view_sensitive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION certs.caller_can_view_sensitive(uuid) TO authenticated;
REVOKE ALL ON FUNCTION certs.pilot_credentials_verification_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.credential_documents_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.credential_approvals_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.pilot_credentials_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.schedules_override_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.schedules_credential_gate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.checkout_credential_gate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.org_credential_policies_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION certs.mission_profiles_validate() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
