-- ============================================================
-- Migration: firmware — fleet & configuration state (module 2 of 3)
--
-- Tenant plane of the Firmware, Configuration & Electronic
-- Component Version Control module:
--
--   airframes          — airworthiness master (lifecycle state machine)
--   airframe_components — modular parts inventory + installed firmware
--   config_snapshots   — version-controlled configuration state
--   config_revisions   — monotonic normalized-state history
--   severity_rules     — per-team drift severity matrix
--   drift_events       — one row per deviation from the golden baseline
--   compliance_events  — INSERT-only, sha-chained tamper-evident audit log
--
-- Storage: raw configuration dumps live in the private
-- 'firmware-configs' bucket; tables store only the object key and
-- its sha256 (same opaque-key pattern as the certs vault).
--
-- RLS: every policy renders from the enterprise role plane
-- (public.ent_*), the single source of role truth.
--   pilot — read own-org fleet, ingest snapshots of their org's
--           airframes, acknowledge drift they detected
--   squadron/district admin (= safety-officer tier, ent_can_manage)
--         — full fleet + workflow control
--   site admin/dev — staff override
--
-- NOTE on org/team pairing: Postgres CHECK constraints cannot contain
-- subqueries, so every org_id/team_id pairing is enforced by the
-- firmware.enforce_org_team_pairing trigger instead.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS firmware;

-- ---------------------------------------------------------------------------
-- 0. Shared helpers
-- ---------------------------------------------------------------------------

-- pairing guard: team_id must equal organizations.team_id for org_id
CREATE OR REPLACE FUNCTION firmware.enforce_org_team_pairing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_team uuid;
BEGIN
  SELECT o.team_id INTO v_team FROM public.organizations o WHERE o.id = NEW.org_id;
  IF v_team IS NULL OR NEW.team_id <> v_team THEN
    RAISE EXCEPTION 'team_id must match organizations.team_id for org %', NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- immutability guard for append-only tables
CREATE OR REPLACE FUNCTION firmware.prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable (append-only)', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION firmware.is_site_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(role) IN ('admin', 'dev')
  );
$$;

CREATE OR REPLACE FUNCTION firmware.can_manage_org(_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.ent_can_manage(_org)
$$;

CREATE OR REPLACE FUNCTION firmware.is_org_member(_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.ent_is_org_member(_org)
$$;

CREATE OR REPLACE FUNCTION firmware.user_is_member_of_team(_team uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team AND tm.user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- 1. airframes — the airworthiness master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.airframes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id              uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name                 text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  chassis_type         text,                          -- 5" true-X freestyle, 7" LR, cinewhoop...
  manufacturer_serial  text,
  registration_id      text,                          -- FAA registration / N-number
  registration_expires date,
  lifecycle_status     text NOT NULL DEFAULT 'active'
                       CHECK (lifecycle_status IN ('active','maintenance','grounded','decommissioned')),
  grounded_reason      text,
  created_by           uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT airframes_grounded_needs_reason
    CHECK (lifecycle_status <> 'grounded' OR grounded_reason IS NOT NULL)
);

DROP TRIGGER IF EXISTS airframes_org_team_pairing ON firmware.airframes;
CREATE TRIGGER airframes_org_team_pairing
  BEFORE INSERT OR UPDATE OF org_id, team_id ON firmware.airframes
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_org_team_pairing();

CREATE INDEX IF NOT EXISTS idx_airframes_org
  ON firmware.airframes(org_id, lifecycle_status);

ALTER TABLE firmware.airframes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS airframes_select ON firmware.airframes;
CREATE POLICY airframes_select ON firmware.airframes FOR SELECT
  TO authenticated USING (firmware.is_org_member(org_id) OR firmware.is_site_admin());

DROP POLICY IF EXISTS airframes_insert ON firmware.airframes;
CREATE POLICY airframes_insert ON firmware.airframes FOR INSERT
  TO authenticated
  WITH CHECK (
    firmware.is_org_member(org_id)
    AND firmware.user_is_member_of_team(team_id)
    AND (firmware.can_manage_org(org_id) OR firmware.is_site_admin())
  );

DROP POLICY IF EXISTS airframes_update ON firmware.airframes;
CREATE POLICY airframes_update ON firmware.airframes FOR UPDATE
  TO authenticated
  USING (firmware.is_org_member(org_id) OR firmware.is_site_admin())
  WITH CHECK (firmware.is_org_member(org_id) OR firmware.is_site_admin());
-- Note: RLS policies cannot reference NEW/OLD, so transition legality is
-- entirely the trigger's job (below): who may move what is enforced there.

DROP POLICY IF EXISTS airframes_delete ON firmware.airframes;
CREATE POLICY airframes_delete ON firmware.airframes FOR DELETE
  TO authenticated
  USING (firmware.can_manage_org(org_id) OR firmware.is_site_admin());

-- Lifecycle state machine. RLS partitions WHO may move; this trigger
-- enforces the transition legality. firmware.grounding_blockers is
-- CREATE OR REPLACE-d by module 3 (work orders + ADs) — the drift/
-- blacklist/lifecycle checks here are already complete.
CREATE OR REPLACE FUNCTION firmware.enforce_airframe_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    IF OLD.lifecycle_status = 'decommissioned' THEN
      RAISE EXCEPTION 'airframe is decommissioned; its state is terminal'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.lifecycle_status = 'grounded' THEN
      IF NEW.grounded_reason IS NULL THEN
        RAISE EXCEPTION 'grounding an airframe requires a reason'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT (
        firmware.can_manage_org(NEW.org_id)
        OR firmware.is_site_admin()
        -- module-3 RPCs set this GUC for AUTOMATIC grounding (critical
        -- drift, bricked component); a human actor must be a safety officer
        OR current_setting('firmware.system_grounding', true) = 'on'
      ) THEN
        RAISE EXCEPTION 'only safety officers may ground an airframe directly'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    -- ANY move out of grounded requires either the safety-officer tier or
    -- a genuinely-clear blocker set (which also covers the system re-air);
    -- this kills the grounded -> maintenance bypass a member could try.
    IF OLD.lifecycle_status = 'grounded' AND NEW.lifecycle_status <> 'grounded' THEN
      IF NOT (
        firmware.can_manage_org(NEW.org_id)
        OR firmware.is_site_admin()
        OR (NEW.lifecycle_status = 'active'
            AND firmware.grounding_blockers(NEW.id, true) IS NULL)
      ) THEN
        RAISE EXCEPTION 'releasing a grounded airframe requires a safety officer (or a clear blocker set)'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;
  -- grounded_reason only meaningful while grounded
  IF TG_OP = 'UPDATE' AND NEW.lifecycle_status <> 'grounded' THEN
    NEW.grounded_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS airframes_lifecycle ON firmware.airframes;
CREATE TRIGGER airframes_lifecycle
  BEFORE UPDATE ON firmware.airframes
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_airframe_lifecycle();

DROP TRIGGER IF EXISTS touch_updated_at ON firmware.airframes;
CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON firmware.airframes
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 2. airframe_components — modular parts inventory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.airframe_components (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airframe_id          uuid NOT NULL REFERENCES firmware.airframes(id) ON DELETE CASCADE,
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id              uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  component_class      text NOT NULL CHECK (component_class IN (
                         'flight_controller','esc','vtx_digital_video','radio_receiver',
                         'motor','gps_module','other')),
  slot_label           text,               -- "Motor 1 (front-right)" etc.
  manufacturer         text,
  model                text,
  hardware_serial      text,
  installed_release_id uuid REFERENCES firmware.firmware_releases(id) ON DELETE SET NULL,
  capability_map       jsonb NOT NULL DEFAULT '[]'::jsonb,
  lifecycle_status     text NOT NULL DEFAULT 'active'
                       CHECK (lifecycle_status IN ('active','spare','removed','failed')),
  created_by           uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- one FC / VTX / RX / GPS per airframe (motors & ESCs use slot_label)
  CONSTRAINT components_singletons
    UNIQUE (airframe_id, component_class, slot_label)
);

-- NULL slot_label does not participate in the table UNIQUE (NULLs are
-- distinct), so singleton classes get their own partial index:
-- exactly one unlabeled FC/VTX/RX/GPS per airframe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_components_unlabeled_singleton
  ON firmware.airframe_components(airframe_id, component_class)
  WHERE slot_label IS NULL;

DROP TRIGGER IF EXISTS components_org_team_pairing ON firmware.airframe_components;
CREATE TRIGGER components_org_team_pairing
  BEFORE INSERT OR UPDATE OF org_id, team_id ON firmware.airframe_components
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_org_team_pairing();

CREATE INDEX IF NOT EXISTS idx_components_airframe
  ON firmware.airframe_components(airframe_id);
CREATE INDEX IF NOT EXISTS idx_components_release
  ON firmware.airframe_components(installed_release_id) WHERE installed_release_id IS NOT NULL;

ALTER TABLE firmware.airframe_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS components_select ON firmware.airframe_components;
CREATE POLICY components_select ON firmware.airframe_components FOR SELECT
  TO authenticated USING (firmware.is_org_member(org_id) OR firmware.is_site_admin());

DROP POLICY IF EXISTS components_insert ON firmware.airframe_components;
CREATE POLICY components_insert ON firmware.airframe_components FOR INSERT
  TO authenticated
  WITH CHECK (
    firmware.is_org_member(org_id)
    AND firmware.user_is_member_of_team(team_id)
  );

DROP POLICY IF EXISTS components_update ON firmware.airframe_components;
CREATE POLICY components_update ON firmware.airframe_components FOR UPDATE
  TO authenticated
  USING (firmware.is_org_member(org_id) OR firmware.is_site_admin())
  WITH CHECK (firmware.is_org_member(org_id) OR firmware.is_site_admin());

DROP POLICY IF EXISTS components_delete ON firmware.airframe_components;
CREATE POLICY components_delete ON firmware.airframe_components FOR DELETE
  TO authenticated
  USING (firmware.can_manage_org(org_id) OR firmware.is_site_admin());

DROP TRIGGER IF EXISTS touch_updated_at ON firmware.airframe_components;
CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON firmware.airframe_components
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 3. config_snapshots — version-controlled configuration state
--    (raw dump in storage; normalized state here)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.config_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id             uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  airframe_id         uuid NOT NULL REFERENCES firmware.airframes(id) ON DELETE CASCADE,
  component_id        uuid REFERENCES firmware.airframe_components(id) ON DELETE SET NULL,
  source              text NOT NULL CHECK (source IN ('cli_export','gcs_params','api_sync','bench_flash','manual_edit')),
  format              text NOT NULL CHECK (format IN ('betaflight_cli','ardupilot_params','json')),
  snapshot_kind       text NOT NULL CHECK (snapshot_kind IN ('golden','baseline_candidate','observed','rollback_reference')),
  raw_object_path     text NOT NULL,
  raw_sha256          char(64) NOT NULL,
  normalized          jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_count         integer NOT NULL DEFAULT 0,
  ingested_by         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  captured_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS snapshots_org_team_pairing ON firmware.config_snapshots;
CREATE TRIGGER snapshots_org_team_pairing
  BEFORE INSERT OR UPDATE OF org_id, team_id ON firmware.config_snapshots
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_org_team_pairing();

CREATE INDEX IF NOT EXISTS idx_snapshots_airframe
  ON firmware.config_snapshots(airframe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_golden
  ON firmware.config_snapshots(airframe_id, component_id) WHERE snapshot_kind = 'golden';

ALTER TABLE firmware.config_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS snapshots_select ON firmware.config_snapshots;
CREATE POLICY snapshots_select ON firmware.config_snapshots FOR SELECT
  TO authenticated USING (firmware.is_org_member(org_id) OR firmware.is_site_admin());

DROP POLICY IF EXISTS snapshots_insert ON firmware.config_snapshots;
CREATE POLICY snapshots_insert ON firmware.config_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    firmware.is_org_member(org_id)
    AND ingested_by = auth.uid()
  );

-- Snapshots are immutable once written: no UPDATE/DELETE grant, and the
-- trigger rejects service-role mistakes too.
REVOKE UPDATE, DELETE ON firmware.config_snapshots FROM authenticated;
DROP TRIGGER IF EXISTS snapshots_no_mutation ON firmware.config_snapshots;
CREATE TRIGGER snapshots_no_mutation
  BEFORE UPDATE OR DELETE ON firmware.config_snapshots
  FOR EACH ROW EXECUTE FUNCTION firmware.prevent_mutation();

-- ---------------------------------------------------------------------------
-- 4. config_revisions — monotonic normalized-state history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.config_revisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id             uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  airframe_id         uuid NOT NULL REFERENCES firmware.airframes(id) ON DELETE CASCADE,
  component_id        uuid REFERENCES firmware.airframe_components(id) ON DELETE SET NULL,
  revision_no         integer NOT NULL,
  config_snapshot_id  uuid NOT NULL REFERENCES firmware.config_snapshots(id) ON DELETE CASCADE,
  normalized          jsonb NOT NULL,
  raw_sha256          char(64) NOT NULL,
  author              uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS revisions_org_team_pairing ON firmware.config_revisions;
CREATE TRIGGER revisions_org_team_pairing
  BEFORE INSERT OR UPDATE OF org_id, team_id ON firmware.config_revisions
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_org_team_pairing();

-- one history sequence per airframe(+component) scope; NULL component
-- normalizes to the all-zero uuid for uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_revisions_scope_seq
  ON firmware.config_revisions(
    airframe_id,
    COALESCE(component_id, '00000000-0000-0000-0000-000000000000'::uuid),
    revision_no
  );

ALTER TABLE firmware.config_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revisions_select ON firmware.config_revisions;
CREATE POLICY revisions_select ON firmware.config_revisions FOR SELECT
  TO authenticated USING (firmware.is_org_member(org_id) OR firmware.is_site_admin());

DROP POLICY IF EXISTS revisions_insert ON firmware.config_revisions;
CREATE POLICY revisions_insert ON firmware.config_revisions FOR INSERT
  TO authenticated
  WITH CHECK (firmware.is_org_member(org_id) AND author = auth.uid());

REVOKE UPDATE, DELETE ON firmware.config_revisions FROM authenticated;
DROP TRIGGER IF EXISTS revisions_no_mutation ON firmware.config_revisions;
CREATE TRIGGER revisions_no_mutation
  BEFORE UPDATE OR DELETE ON firmware.config_revisions
  FOR EACH ROW EXECUTE FUNCTION firmware.prevent_mutation();

-- ---------------------------------------------------------------------------
-- 5. severity_rules — per-team drift severity matrix
--    Default rows are seeded by public.firmware_ensure_default_matrix.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.severity_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  match_source  text NOT NULL CHECK (match_source IN ('betaflight_cli','ardupilot_params','json')),
  field_path    text NOT NULL,
  match_kind    text NOT NULL DEFAULT 'exact' CHECK (match_kind IN ('exact','wildcard','numeric')),
  severity      text NOT NULL CHECK (severity IN ('critical_safety','operational','informational')),
  note          text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS severity_org_team_pairing ON firmware.severity_rules;
CREATE TRIGGER severity_org_team_pairing
  BEFORE INSERT OR UPDATE OF org_id, team_id ON firmware.severity_rules
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_org_team_pairing();

CREATE UNIQUE INDEX IF NOT EXISTS uq_severity_rules
  ON firmware.severity_rules(org_id, match_source, field_path, match_kind);

ALTER TABLE firmware.severity_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS severity_select ON firmware.severity_rules;
CREATE POLICY severity_select ON firmware.severity_rules FOR SELECT
  TO authenticated USING (firmware.is_org_member(org_id) OR firmware.is_site_admin());

DROP POLICY IF EXISTS severity_write ON firmware.severity_rules;
CREATE POLICY severity_write ON firmware.severity_rules FOR ALL
  TO authenticated
  USING (firmware.can_manage_org(org_id) OR firmware.is_site_admin())
  WITH CHECK ((firmware.can_manage_org(org_id) OR firmware.is_site_admin())
              AND firmware.user_is_member_of_team(team_id));

-- ---------------------------------------------------------------------------
-- 6. drift_events — one row per detected deviation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.drift_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id              uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  airframe_id          uuid NOT NULL REFERENCES firmware.airframes(id) ON DELETE CASCADE,
  component_id         uuid REFERENCES firmware.airframe_components(id) ON DELETE SET NULL,
  config_snapshot_id   uuid REFERENCES firmware.config_snapshots(id) ON DELETE SET NULL,
  config_revision_id   uuid REFERENCES firmware.config_revisions(id) ON DELETE SET NULL,
  baseline_snapshot_id uuid REFERENCES firmware.config_snapshots(id) ON DELETE SET NULL,
  field_path           text NOT NULL,
  old_value            jsonb,
  new_value            jsonb,
  severity             text NOT NULL CHECK (severity IN ('critical_safety','operational','informational')),
  drift_status         text NOT NULL DEFAULT 'open'
                       CHECK (drift_status IN ('open','acknowledged','cleared','suppressed')),
  detected_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detected_at          timestamptz NOT NULL DEFAULT now(),
  resolved_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at          timestamptz,
  resolution_note      text
);

DROP TRIGGER IF EXISTS drift_org_team_pairing ON firmware.drift_events;
CREATE TRIGGER drift_org_team_pairing
  BEFORE INSERT OR UPDATE OF org_id, team_id ON firmware.drift_events
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_org_team_pairing();

CREATE INDEX IF NOT EXISTS idx_drift_airframe_status
  ON firmware.drift_events(airframe_id, drift_status) WHERE drift_status IN ('open','acknowledged');
CREATE INDEX IF NOT EXISTS idx_drift_org
  ON firmware.drift_events(org_id, drift_status);

-- one OPEN drift row per (airframe, component, field): re-observation of the
-- same deviation refreshes the row instead of piling up duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_drift_open_scope
  ON firmware.drift_events(
    airframe_id,
    COALESCE(component_id, '00000000-0000-0000-0000-000000000000'::uuid),
    field_path
  )
  WHERE drift_status = 'open';

ALTER TABLE firmware.drift_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drift_select ON firmware.drift_events;
CREATE POLICY drift_select ON firmware.drift_events FOR SELECT
  TO authenticated USING (firmware.is_org_member(org_id) OR firmware.is_site_admin());

DROP POLICY IF EXISTS drift_insert ON firmware.drift_events;
CREATE POLICY drift_insert ON firmware.drift_events FOR INSERT
  TO authenticated
  WITH CHECK (firmware.is_org_member(org_id));

DROP POLICY IF EXISTS drift_update ON firmware.drift_events;
CREATE POLICY drift_update ON firmware.drift_events FOR UPDATE
  TO authenticated
  USING (
    firmware.is_org_member(org_id)
    AND (firmware.can_manage_org(org_id) OR detected_by = auth.uid())
  )
  WITH CHECK (
    firmware.is_org_member(org_id)
    AND (firmware.can_manage_org(org_id) OR detected_by = auth.uid())
  );

REVOKE DELETE ON firmware.drift_events FROM authenticated;
DROP TRIGGER IF EXISTS drift_no_delete ON firmware.drift_events;
CREATE TRIGGER drift_no_delete
  BEFORE DELETE ON firmware.drift_events
  FOR EACH ROW EXECUTE FUNCTION firmware.prevent_mutation();

-- ---------------------------------------------------------------------------
-- 7. compliance_events — INSERT-only, sha-chained, tamper-evident audit log
--    Every state change, snapshot ingestion, drift lifecycle event,
--    grounding, release, override and flash lands here. Row digests chain
--    per org; public.firmware_verify_audit_chain re-walks the chain.
--    (The work_order_id column is added by module 3, which owns the
--    work-order table.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.compliance_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq               bigint NOT NULL,
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id           uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  actor             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label       text,                    -- callsign/display name at event time
  actor_role        text,                    -- pilot | squadron_admin | district_admin | site_admin
  event_type        text NOT NULL CHECK (event_type IN (
                      'state_change','snapshot_ingest','baseline_set','drift_detected','drift_resolved',
                      'drift_suppressed','interlock_ground','interlock_release',
                      'ad_published','ad_deactivated','work_order_created','work_order_advanced',
                      'work_order_rejected','flash_recorded','rollback','override_requested',
                      'override_granted','override_denied')),
  airframe_id       uuid REFERENCES firmware.airframes(id) ON DELETE SET NULL,
  component_id      uuid REFERENCES firmware.airframe_components(id) ON DELETE SET NULL,
  snapshot_id       uuid REFERENCES firmware.config_snapshots(id) ON DELETE SET NULL,
  drift_event_id    uuid REFERENCES firmware.drift_events(id) ON DELETE SET NULL,
  before_state      jsonb,
  after_state       jsonb,
  before_sha256     char(64),
  after_sha256      char(64),
  justification     text,
  row_sha256        char(64) NOT NULL,
  prev_row_sha256   char(64),
  occurred_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS compliance_org_team_pairing ON firmware.compliance_events;
CREATE TRIGGER compliance_org_team_pairing
  BEFORE INSERT OR UPDATE OF org_id, team_id ON firmware.compliance_events
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_org_team_pairing();

CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_seq
  ON firmware.compliance_events(org_id, seq);

CREATE INDEX IF NOT EXISTS idx_compliance_airframe
  ON firmware.compliance_events(airframe_id, occurred_at DESC);

ALTER TABLE firmware.compliance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_select ON firmware.compliance_events;
CREATE POLICY compliance_select ON firmware.compliance_events FOR SELECT
  TO authenticated USING (
    firmware.is_org_member(org_id)
    OR firmware.is_site_admin()
  );

-- No INSERT policy for authenticated: rows are written exclusively by
-- SECURITY DEFINER RPCs. No UPDATE/DELETE, ever — grant list is SELECT only.
REVOKE UPDATE, DELETE ON firmware.compliance_events FROM authenticated;
DROP TRIGGER IF EXISTS compliance_no_mutation ON firmware.compliance_events;
CREATE TRIGGER compliance_no_mutation
  BEFORE UPDATE OR DELETE ON firmware.compliance_events
  FOR EACH ROW EXECUTE FUNCTION firmware.prevent_mutation();

-- ---------------------------------------------------------------------------
-- 8. grounding_blockers — THE effective-airworthiness predicate.
--    Returns the reason string when the airframe must not fly, NULL when
--    clear. Module 2 version: critical drift, blacklisted firmware,
--    lifecycle grounding. Module 3 CREATE OR REPLACEs it to add
--    airworthiness directives and open safety reviews.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION firmware.grounding_blockers(_airframe uuid, _exclude_lifecycle boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_reasons text[] := ARRAY[]::text[];
  v_af firmware.airframes%ROWTYPE;
  v_blacklisted text;
BEGIN
  SELECT * INTO v_af FROM firmware.airframes WHERE id = _airframe;
  IF NOT FOUND THEN
    RETURN 'unknown airframe';
  END IF;

  -- _exclude_lifecycle: the lifecycle trigger itself calls this while
  -- deciding whether grounded->active may proceed — the grounded status
  -- is the thing being changed, so it must not count as its own blocker.
  IF v_af.lifecycle_status = 'grounded' AND NOT _exclude_lifecycle THEN
    v_reasons := v_reasons || ('airframe grounded: ' || COALESCE(v_af.grounded_reason, 'unspecified'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM firmware.drift_events d
    WHERE d.airframe_id = _airframe
      AND d.severity = 'critical_safety'
      AND d.drift_status IN ('open','acknowledged')
  ) THEN
    v_reasons := v_reasons || 'critical configuration drift awaiting safety review';
  END IF;

  SELECT string_agg(DISTINCT f.name || ' ' || r.version || ' is BLACKLISTED', '; ')
    INTO v_blacklisted
  FROM firmware.airframe_components c
  JOIN firmware.firmware_releases r ON r.id = c.installed_release_id
  JOIN firmware.hardware_targets t ON t.id = r.target_id
  JOIN firmware.families f ON f.id = t.family_id
  WHERE c.airframe_id = _airframe
    AND c.lifecycle_status = 'active'
    AND r.release_status = 'blacklisted';
  IF v_blacklisted IS NOT NULL THEN
    v_reasons := v_reasons || ('blacklisted firmware installed: ' || v_blacklisted);
  END IF;

  IF array_length(v_reasons, 1) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN array_to_string(v_reasons, ' | ');
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Storage — private 'firmware-configs' bucket (certs-vault pattern).
--    Path contract: <team_id>/<airframe_id>/<uuid>-<safe-file-name>,
--    checked directly against the object name.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION firmware.storage_access(_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_team     uuid;
  v_airframe uuid;
BEGIN
  BEGIN
    v_team     := split_part(_path, '/', 1)::uuid;
    v_airframe := split_part(_path, '/', 2)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF v_team IS NULL OR v_airframe IS NULL THEN
    RETURN false;
  END IF;

  -- member of the owning org, or safety-officer/site tier
  RETURN EXISTS (
           SELECT 1 FROM firmware.airframes a
           WHERE a.id = v_airframe AND a.team_id = v_team AND firmware.is_org_member(a.org_id)
         )
      OR EXISTS (
           SELECT 1 FROM firmware.airframes a
           WHERE a.id = v_airframe AND a.team_id = v_team
             AND (firmware.can_manage_org(a.org_id) OR firmware.is_site_admin())
         );
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('firmware-configs', 'firmware-configs', false, 26214400) -- 25 MB
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS firmware_configs_insert ON storage.objects;
CREATE POLICY firmware_configs_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'firmware-configs' AND firmware.storage_access(name));

DROP POLICY IF EXISTS firmware_configs_select ON storage.objects;
CREATE POLICY firmware_configs_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'firmware-configs' AND firmware.storage_access(name));

DROP POLICY IF EXISTS firmware_configs_delete ON storage.objects;
CREATE POLICY firmware_configs_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'firmware-configs' AND firmware.storage_access(name));

-- ---------------------------------------------------------------------------
-- 10. Grants — authenticated reads tenant tables via RLS; workflow
--     mutations flow through the module-3 RPCs (public.firmware_*).
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA firmware FROM anon, PUBLIC;
GRANT USAGE ON SCHEMA firmware TO authenticated;

REVOKE ALL ON firmware.airframes FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.airframe_components FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.config_snapshots FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.config_revisions FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.severity_rules FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.drift_events FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.compliance_events FROM anon, PUBLIC, authenticated;

GRANT SELECT ON firmware.airframes, firmware.airframe_components,
  firmware.config_snapshots, firmware.config_revisions,
  firmware.severity_rules, firmware.drift_events,
  firmware.compliance_events TO authenticated;
GRANT INSERT, UPDATE ON firmware.airframes TO authenticated;
GRANT INSERT, UPDATE ON firmware.airframe_components TO authenticated;
GRANT INSERT ON firmware.config_snapshots, firmware.config_revisions TO authenticated;
GRANT INSERT, UPDATE ON firmware.severity_rules TO authenticated;
GRANT INSERT, UPDATE ON firmware.drift_events TO authenticated;

REVOKE ALL ON FUNCTION firmware.enforce_org_team_pairing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.prevent_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.is_site_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.can_manage_org(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.is_org_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.user_is_member_of_team(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.grounding_blockers(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.storage_access(text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
