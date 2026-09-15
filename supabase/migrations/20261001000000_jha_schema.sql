-- ============================================================
-- Migration: jha — Job Hazard Analysis pre-flight checklist
--
-- Dedicated schema (not public), exposed via PostgREST (see
-- supabase/config.toml `api.schemas`). Two tables:
--   jha.templates    — org-customizable checklist definitions
--   jha.submissions  — pilot-completed pre-flight checklists
--
-- Access model reuses the existing enterprise role plane
-- (20260927100100/100120):
--   * Pilots create submissions and read their own history.
--   * Safety officers / org admins (public.ent_can_manage)
--     have full read access to audit all org submissions.
--   * Template management is admin-only (insert/update/delete).
--
-- Enums use text + CHECK, matching every other table in this
-- codebase rather than native Postgres ENUM types, which are
-- painful to ALTER later.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS jha;

-- Grant usage so PostgREST can reach the schema
GRANT USAGE ON SCHEMA jha TO authenticated;
GRANT USAGE ON SCHEMA jha TO anon;

-- -------------------------------------------------------------------
-- 1. templates — org-customizable JHA checklist definitions
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jha.templates (
  template_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title            text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),

  -- JSONB array of checklist sections. Each section contains:
  --   { "section": "Environmental", "items": [
  --       { "id": "env-1", "label": "Wind speed < 25 mph", "critical": true },
  --       { "id": "env-2", "label": "No active precipitation", "critical": false }
  --   ]}
  items            jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jha_templates_org
  ON jha.templates(organization_id);

ALTER TABLE jha.templates ENABLE ROW LEVEL SECURITY;

-- touch_updated_at trigger
CREATE OR REPLACE FUNCTION jha.touch_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'jha'
  AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS templates_touch ON jha.templates;
CREATE TRIGGER templates_touch
  BEFORE UPDATE ON jha.templates
  FOR EACH ROW EXECUTE FUNCTION jha.touch_updated_at();

-- -------------------------------------------------------------------
-- 2. submissions — pilot-completed pre-flight checklists
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jha.submissions (
  submission_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id      uuid REFERENCES jha.templates(template_id) ON DELETE SET NULL,
  airframe_id      uuid REFERENCES org_gear.drones(id) ON DELETE SET NULL,
  dispatch_id      uuid, -- optional reference to a scheduled slot (ent_scheduling)

  -- JSONB capturing answers keyed by checklist item id.
  -- { "env-1": { "passed": true }, "env-2": { "passed": false, "note": "Rain expected" } }
  responses        jsonb NOT NULL DEFAULT '{}'::jsonb,

  status           text NOT NULL CHECK (status IN ('passed', 'failed')),

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jha_submissions_org_user
  ON jha.submissions(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_jha_submissions_org_status
  ON jha.submissions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_jha_submissions_created
  ON jha.submissions(created_at DESC);

-- created_at is immutable — prevent UPDATE from backdating or re-timestamping
CREATE OR REPLACE FUNCTION jha.prevent_created_at_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'jha'
  AS $function$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS submissions_immutable_created ON jha.submissions;
CREATE TRIGGER submissions_immutable_created
  BEFORE UPDATE ON jha.submissions
  FOR EACH ROW EXECUTE FUNCTION jha.prevent_created_at_update();

ALTER TABLE jha.submissions ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------
-- 3. RLS policies
-- -------------------------------------------------------------------

-- templates: org members can read; only admins can write.
DROP POLICY IF EXISTS jha_templates_select ON jha.templates;
CREATE POLICY jha_templates_select
  ON jha.templates FOR SELECT
  TO authenticated
  USING (
    public.ent_is_org_member(organization_id)
  );

DROP POLICY IF EXISTS jha_templates_insert ON jha.templates;
CREATE POLICY jha_templates_insert
  ON jha.templates FOR INSERT
  TO authenticated
  WITH CHECK (
    public.ent_can_manage(organization_id)
  );

DROP POLICY IF EXISTS jha_templates_update ON jha.templates;
CREATE POLICY jha_templates_update
  ON jha.templates FOR UPDATE
  TO authenticated
  USING (public.ent_can_manage(organization_id))
  WITH CHECK (public.ent_can_manage(organization_id));

DROP POLICY IF EXISTS jha_templates_delete ON jha.templates;
CREATE POLICY jha_templates_delete
  ON jha.templates FOR DELETE
  TO authenticated
  USING (public.ent_can_manage(organization_id));

-- submissions: pilots see + create their own; admins/safety officers
-- see all org submissions for audit.
DROP POLICY IF EXISTS jha_submissions_select ON jha.submissions;
CREATE POLICY jha_submissions_select
  ON jha.submissions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.ent_can_manage(organization_id)
  );

DROP POLICY IF EXISTS jha_submissions_insert ON jha.submissions;
CREATE POLICY jha_submissions_insert
  ON jha.submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.ent_is_org_member(organization_id))
    OR public.ent_can_manage(organization_id)
  );

-- No UPDATE policy: once filed, a submission is an immutable audit record.
-- No DELETE policy: same — JHA records are never removed.

-- -------------------------------------------------------------------
-- 4. Grant table permissions to authenticated role
-- -------------------------------------------------------------------
GRANT SELECT, INSERT ON jha.templates TO authenticated;
GRANT SELECT, INSERT ON jha.submissions TO authenticated;
-- UPDATE/DELETE on templates reserved for admin via RLS only.

-- -------------------------------------------------------------------
-- 5. Gate enforcement RPC: jha.check_flight_gate
--
-- Returns { valid: boolean, submission_id: uuid | null, reason: text }
-- Called before logging a flight session or executing a dispatch.
-- A valid JHA must have status = 'passed' and be created within the
-- last 60 minutes.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jha.check_flight_gate(
  _org        uuid,
  _user       uuid,
  _airframe   uuid DEFAULT NULL,
  _window_min integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jha', 'public'
AS $function$
DECLARE
  v_sub jha.submissions%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_sub
    FROM jha.submissions s
   WHERE s.organization_id = _org
     AND s.user_id = _user
     AND s.status = 'passed'
     AND (_airframe IS NULL OR s.airframe_id = _airframe)
     AND s.created_at >= now() - make_interval(mins => _window_min)
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_sub.submission_id IS NOT NULL THEN
    v_result := jsonb_build_object(
      'valid', true,
      'submission_id', v_sub.submission_id,
      'reason', null
    );
  ELSE
    v_result := jsonb_build_object(
      'valid', false,
      'submission_id', null,
      'reason', 'No valid JHA checklist found (must be passed within the last ' || _window_min || ' minutes).'
    );
  END IF;

  RETURN v_result;
END;
$function$;

-- Allow authenticated callers to invoke the gate check
GRANT EXECUTE ON FUNCTION jha.check_flight_gate(uuid, uuid, uuid, integer) TO authenticated;
