-- ============================================================
-- Migration: sms — Safety Management System incident logging
--
-- Dedicated schema (not public), exposed via PostgREST (see
-- supabase/config.toml `api.schemas`). Single table:
--   sms.incidents — one row per reported safety incident.
--
-- Access model reuses the existing enterprise role plane
-- (20260927100100/100120) rather than inventing a new one — same
-- decision the certs vault made (20260928010000): this codebase's
-- team_role is only owner/manager/member, so there is no separate
-- "Safety Officer" role. squadron_admin / district_admin / site_admin
-- (public.ent_can_manage) ARE the safety-officer tier here. A
-- dedicated per-member grant is the upgrade path if a non-admin
-- safety-officer designation is ever needed.
--
-- Enums use text + CHECK, matching every other table in this codebase
-- (see certs.vault_documents.document_type) rather than native
-- Postgres ENUM types, which are painful to ALTER later.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS sms;

-- ---------------------------------------------------------------------------
-- 1. incidents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms.incidents (
  incident_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  airframe_id      uuid REFERENCES org_gear.drones(id) ON DELETE SET NULL,

  incident_date    date NOT NULL DEFAULT CURRENT_DATE,

  severity_level   text NOT NULL CHECK (severity_level IN (
                     'low', 'medium', 'high', 'catastrophic'
                   )),
  incident_type    text NOT NULL CHECK (incident_type IN (
                     'crash', 'flyaway', 'near_miss', 'property_damage', 'airspace_violation'
                   )),

  description       text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 5000),
  corrective_action  text CHECK (corrective_action IS NULL OR char_length(btrim(corrective_action)) BETWEEN 1 AND 5000),

  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'closed')),

  attachment_path  text, -- storage object key (bucket-relative), never a public URL

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- A closed incident must document what was done about it.
  CONSTRAINT incidents_closed_requires_corrective_action
    CHECK (status <> 'closed' OR corrective_action IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_incidents_org_status
  ON sms.incidents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_org_severity
  ON sms.incidents(organization_id, severity_level);
CREATE INDEX IF NOT EXISTS idx_incidents_org_user
  ON sms.incidents(organization_id, user_id);

ALTER TABLE sms.incidents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION sms.touch_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'sms'
  AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS incidents_touch ON sms.incidents;
CREATE TRIGGER incidents_touch
  BEFORE UPDATE ON sms.incidents
  FOR EACH ROW EXECUTE FUNCTION sms.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS — pilots create + read only their own reports. Safety
--    officers / org admins (public.ent_can_manage) get full read,
--    write, and update across the org to investigate and close
--    reports. No DELETE policy: incident reports are an audit trail
--    and are never removed, only closed.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS incidents_select ON sms.incidents;
CREATE POLICY incidents_select
  ON sms.incidents FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.ent_can_manage(organization_id)
  );

DROP POLICY IF EXISTS incidents_insert ON sms.incidents;
CREATE POLICY incidents_insert
  ON sms.incidents FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.ent_is_org_member(organization_id))
    OR public.ent_can_manage(organization_id)
  );

-- Update (status, corrective_action, review) is admin/safety-officer
-- only — a pilot's report is immutable once filed.
DROP POLICY IF EXISTS incidents_update ON sms.incidents;
CREATE POLICY incidents_update
  ON sms.incidents FOR UPDATE
  TO authenticated
  USING (public.ent_can_manage(organization_id))
  WITH CHECK (public.ent_can_manage(organization_id));

-- ---------------------------------------------------------------------------
-- 3. Storage — private 'sms-incidents' bucket for photos/logs.
--    Path contract <organization_id>/<user_id>/<file>, matching the
--    certs vault's storage_access pattern. 25 MB cap covers photos
--    and flight-log exports.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sms.storage_access(_path text)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'sms'
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
VALUES ('sms-incidents', 'sms-incidents', false, 26214400) -- 25 MB
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS sms_incidents_storage_insert ON storage.objects;
CREATE POLICY sms_incidents_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sms-incidents' AND sms.storage_access(name));

DROP POLICY IF EXISTS sms_incidents_storage_select ON storage.objects;
CREATE POLICY sms_incidents_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sms-incidents' AND sms.storage_access(name));

DROP POLICY IF EXISTS sms_incidents_storage_delete ON storage.objects;
CREATE POLICY sms_incidents_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sms-incidents' AND sms.storage_access(name));

-- ---------------------------------------------------------------------------
-- 4. Grants — RLS is the boundary, grants keep the surface narrow.
--    No DELETE grant: incidents are append/update-only.
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA sms FROM anon, PUBLIC;
GRANT USAGE ON SCHEMA sms TO authenticated;

REVOKE ALL ON sms.incidents FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE ON sms.incidents TO authenticated;

REVOKE ALL ON FUNCTION sms.storage_access(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sms.touch_updated_at() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
