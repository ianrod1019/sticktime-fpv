-- ============================================================
-- Migration: firmware — workflows, interlocks, RPCs (module 3 of 3)
--
-- Completes the Firmware, Configuration & Electronic Component
-- Version Control module:
--
--   work_orders + work_order_steps — the sign-off chain of custody
--   airworthiness_directives(+matches) — AD / bulletin lockouts
--   flash_records            — flash / rollback evidence ledger
--   firmware.gate_schedules_for_grounding — the scheduling interlock
--   public.firmware_* RPCs   — the entire client surface
--
-- Storage flow (certs-vault pattern): the CLIENT uploads the raw dump
-- to the private 'firmware-configs' bucket FIRST (storage RLS checks
-- the <team_id>/<airframe_id>/ path), then calls
-- public.firmware_ingest_config_snapshot with the object path. The RPC
-- re-checks the path contract, hashes the submitted text, parses and
-- normalizes it, allocates the revision, diffs against golden.
--
-- Every mutating RPC writes its compliance_events row in the same
-- transaction (INSERT-only, sha-chained — see module 2).
-- Re-audit: public.firmware_verify_audit_chain.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. work_orders + steps — the chain of custody
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.work_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id             uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  airframe_id         uuid NOT NULL REFERENCES firmware.airframes(id) ON DELETE CASCADE,
  component_id        uuid REFERENCES firmware.airframe_components(id) ON DELETE SET NULL,
  work_order_kind     text NOT NULL CHECK (work_order_kind IN (
                        'firmware_flash','component_replacement','config_change','rollback')),
  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','in_progress','awaiting_safety_review','approved','rejected','cancelled')),
  initiated_by        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_technician uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  justification       text NOT NULL CHECK (char_length(btrim(justification)) BETWEEN 3 AND 2000),
  closed_at           timestamptz,
  closed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS work_orders_org_team_pairing ON firmware.work_orders;
CREATE TRIGGER work_orders_org_team_pairing
  BEFORE INSERT OR UPDATE OF org_id, team_id ON firmware.work_orders
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_org_team_pairing();

CREATE INDEX IF NOT EXISTS idx_work_orders_org_status
  ON firmware.work_orders(org_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_airframe_open
  ON firmware.work_orders(airframe_id) WHERE status IN ('open','in_progress','awaiting_safety_review');

ALTER TABLE firmware.work_orders ENABLE ROW LEVEL SECURITY;

-- SELECT-only for clients: every mutation flows through the public.firmware_*
-- RPCs (which run as the definer). A no-INSERT/UPDATE policy means PostgREST
-- direct writes are denied — work orders and their status flips always land
-- with an audit row.
DROP POLICY IF EXISTS work_orders_select ON firmware.work_orders;
CREATE POLICY work_orders_select ON firmware.work_orders FOR SELECT
  TO authenticated USING (firmware.is_org_member(org_id) OR firmware.is_site_admin());

-- Guard-in-depth: even the (revoked) writes cannot dodge the RPC layer.
CREATE OR REPLACE FUNCTION firmware.enforce_work_orders_rpc_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'work orders are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF current_setting('firmware.system_write', true) <> 'on' THEN
    RAISE EXCEPTION 'work orders change only through the firmware RPCs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_rpc_only ON firmware.work_orders;
CREATE TRIGGER work_orders_rpc_only
  BEFORE UPDATE OR DELETE ON firmware.work_orders
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_work_orders_rpc_only();

-- audit linkage column on the event log (module 2 owns the table)
ALTER TABLE firmware.compliance_events
  ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES firmware.work_orders(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION firmware.enforce_work_order_step_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_unsatisfied int;
  v_wo firmware.work_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_wo FROM firmware.work_orders WHERE id = NEW.work_order_id;

  -- steps freeze once the work order closes
  IF v_wo.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'work order is closed; its approval chain can no longer change'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'satisfied' THEN
    SELECT count(*) INTO v_unsatisfied
    FROM firmware.work_order_steps
    WHERE work_order_id = NEW.work_order_id
      AND step_no < NEW.step_no
      AND status <> 'satisfied';
    IF v_unsatisfied > 0 THEN
      RAISE EXCEPTION 'step % cannot be satisfied before earlier steps', NEW.step_no
        USING ERRCODE = 'check_violation';
    END IF;

    -- last step satisfied flips the work order to approved
    SELECT count(*) INTO v_unsatisfied
    FROM firmware.work_order_steps
    WHERE work_order_id = NEW.work_order_id
      AND step_no > NEW.step_no
      AND status = 'pending';
    IF v_unsatisfied = 0 THEN
      UPDATE firmware.work_orders
      SET status = 'approved', closed_at = now(), closed_by = NEW.acted_by, updated_at = now()
      WHERE id = NEW.work_order_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS firmware.work_order_steps (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id        uuid NOT NULL REFERENCES firmware.work_orders(id) ON DELETE CASCADE,
  step_no              smallint NOT NULL CHECK (step_no BETWEEN 1 AND 8),
  step_kind            text NOT NULL CHECK (step_kind IN (
                         'technician_attest','evidence_upload','safety_audit','final_release')),
  required_role        text NOT NULL CHECK (required_role IN ('technician','safety_manager')),
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','satisfied','rejected')),
  acted_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at             timestamptz,
  notes                text,
  evidence_snapshot_id uuid REFERENCES firmware.config_snapshots(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS work_order_steps_sequence ON firmware.work_order_steps;
CREATE TRIGGER work_order_steps_sequence
  BEFORE UPDATE OF status ON firmware.work_order_steps
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_work_order_step_sequence();

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_order_steps
  ON firmware.work_order_steps(work_order_id, step_no);

ALTER TABLE firmware.work_order_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_order_steps_select ON firmware.work_order_steps;
CREATE POLICY work_order_steps_select ON firmware.work_order_steps FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM firmware.work_orders w
      WHERE w.id = work_order_steps.work_order_id
        AND (firmware.is_org_member(w.org_id) OR firmware.is_site_admin())
    )
  );

DROP POLICY IF EXISTS work_order_steps_update ON firmware.work_order_steps;
CREATE POLICY work_order_steps_update ON firmware.work_order_steps FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM firmware.work_orders w
      WHERE w.id = work_order_steps.work_order_id
        AND (firmware.is_org_member(w.org_id) OR firmware.is_site_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM firmware.work_orders w
      WHERE w.id = work_order_steps.work_order_id
        AND (firmware.is_org_member(w.org_id) OR firmware.is_site_admin())
    )
  );

-- Steps are written exclusively by the advance RPC (system context).
CREATE OR REPLACE FUNCTION firmware.enforce_steps_rpc_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'work order steps are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF current_setting('firmware.system_write', true) <> 'on' THEN
    RAISE EXCEPTION 'work order steps change only through the firmware RPCs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_order_steps_rpc_only ON firmware.work_order_steps;
CREATE TRIGGER work_order_steps_rpc_only
  BEFORE UPDATE OR DELETE ON firmware.work_order_steps
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_steps_rpc_only();

REVOKE DELETE ON firmware.work_order_steps FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. airworthiness directives — AD / manufacturer bulletin lockouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.airworthiness_directives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL = platform-wide
  directive_ref text NOT NULL,
  title         text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  body          text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 20000),
  source_url    text,
  published_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  effective_at  timestamptz NOT NULL DEFAULT now(),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_active
  ON firmware.airworthiness_directives(is_active) WHERE is_active;

-- a directive names its affected hardware/firmware explicitly
CREATE TABLE IF NOT EXISTS firmware.airworthiness_directive_matches (
  directive_id  uuid NOT NULL REFERENCES firmware.airworthiness_directives(id) ON DELETE CASCADE,
  scope_type    text NOT NULL CHECK (scope_type IN (
                  'manufacturer','family','target','component_class','firmware_release','serial_prefix')),
  scope_value   text NOT NULL,
  PRIMARY KEY (directive_id, scope_type, scope_value)
);

ALTER TABLE firmware.airworthiness_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmware.airworthiness_directive_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_select ON firmware.airworthiness_directives;
CREATE POLICY ad_select ON firmware.airworthiness_directives FOR SELECT
  TO authenticated USING (
    org_id IS NULL OR firmware.is_org_member(org_id) OR firmware.is_site_admin()
  );

-- Publish/deactivate flow exclusively through public.firmware_publish_directive
-- and public.firmware_deactivate_directive (audit-chained). Clients get SELECT.

DROP POLICY IF EXISTS ad_matches_select ON firmware.airworthiness_directive_matches;
CREATE POLICY ad_matches_select ON firmware.airworthiness_directive_matches FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM firmware.airworthiness_directives d
      WHERE d.id = directive_id
        AND (d.org_id IS NULL OR firmware.is_org_member(d.org_id) OR firmware.is_site_admin())
    )
  );

-- matches are written only alongside their directive, inside the publish RPC

-- org_id -> team_id helper for the AD policy above
CREATE OR REPLACE FUNCTION firmware.team_id_of_org(_org uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.team_id FROM public.organizations o WHERE o.id = _org
$$;

-- ---------------------------------------------------------------------------
-- 3. flash_records — flash / rollback evidence ledger (RPC-written)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware.flash_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id          uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  airframe_id      uuid NOT NULL REFERENCES firmware.airframes(id) ON DELETE CASCADE,
  component_id     uuid NOT NULL REFERENCES firmware.airframe_components(id) ON DELETE CASCADE,
  from_release_id  uuid REFERENCES firmware.firmware_releases(id) ON DELETE SET NULL,
  to_release_id    uuid REFERENCES firmware.firmware_releases(id) ON DELETE SET NULL,
  flash_status     text NOT NULL DEFAULT 'succeeded'
                   CHECK (flash_status IN ('succeeded','failed','bricked','rolled_back')),
  performed_by     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  performed_at     timestamptz NOT NULL DEFAULT now(),
  pre_snapshot_id  uuid REFERENCES firmware.config_snapshots(id) ON DELETE SET NULL,
  post_snapshot_id uuid REFERENCES firmware.config_snapshots(id) ON DELETE SET NULL,
  notes            text
);

DROP TRIGGER IF EXISTS flash_org_team_pairing ON firmware.flash_records;
CREATE TRIGGER flash_org_team_pairing
  BEFORE INSERT OR UPDATE OF org_id, team_id ON firmware.flash_records
  FOR EACH ROW EXECUTE FUNCTION firmware.enforce_org_team_pairing();

CREATE INDEX IF NOT EXISTS idx_flash_airframe
  ON firmware.flash_records(airframe_id, performed_at DESC);

ALTER TABLE firmware.flash_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flash_select ON firmware.flash_records;
CREATE POLICY flash_select ON firmware.flash_records FOR SELECT
  TO authenticated USING (firmware.is_org_member(org_id) OR firmware.is_site_admin());

-- No insert policy: written exclusively through public.firmware_record_flash.

-- ---------------------------------------------------------------------------
-- 4. The grounding predicate, complete.
--    Adds AD hits and open safety reviews on top of the module-2 checks
--    (critical drift, blacklisted firmware, lifecycle grounding).
--    _exclude_lifecycle: used by the lifecycle trigger while deciding a
--    grounded->active move (the grounded flag itself is being changed).
-- ---------------------------------------------------------------------------

-- family name of a release's target (helper for the AD matcher)
CREATE OR REPLACE FUNCTION firmware.release_family_name(_release uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
  SELECT f.name
  FROM firmware.firmware_releases r
  JOIN firmware.hardware_targets t ON t.id = r.target_id
  JOIN firmware.families f ON f.id = t.family_id
  WHERE r.id = _release
$$;

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
  v_ads text;
BEGIN
  SELECT * INTO v_af FROM firmware.airframes WHERE id = _airframe;
  IF NOT FOUND THEN
    RETURN 'unknown airframe';
  END IF;

  IF v_af.lifecycle_status = 'grounded' AND NOT _exclude_lifecycle THEN
    v_reasons := v_reasons || ('airframe grounded: ' || COALESCE(v_af.grounded_reason, 'unspecified'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM firmware.drift_events d
    WHERE d.airframe_id = _airframe
      AND d.severity = 'critical_safety'
      AND d.drift_status IN ('open','acknowledged')
  ) THEN
    v_reasons := v_reasons || 'critical configuration drift awaiting safety review'::text;
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

  -- open work order awaiting safety review = out of service until cleared
  IF EXISTS (
    SELECT 1 FROM firmware.work_orders w
    WHERE w.airframe_id = _airframe
      AND w.status IN ('open','in_progress','awaiting_safety_review')
  ) THEN
    v_reasons := v_reasons || 'open work order (maintenance or sign-off in progress)'::text;
  END IF;

  -- active airworthiness directives matching this airframe's components
  SELECT string_agg(DISTINCT d.directive_ref || ': ' || d.title, ' | ')
    INTO v_ads
  FROM firmware.airframe_components c
  JOIN firmware.airworthiness_directives d
    ON d.is_active
   AND d.effective_at <= now()
   AND (d.org_id IS NULL OR d.org_id = v_af.org_id)
  WHERE c.airframe_id = _airframe
    AND c.lifecycle_status = 'active'
    AND EXISTS (
      SELECT 1
      FROM firmware.airworthiness_directive_matches m
      WHERE m.directive_id = d.id
        AND (
          (m.scope_type = 'manufacturer'
           AND c.manufacturer IS NOT NULL
           AND c.manufacturer ILIKE m.scope_value)
          OR (m.scope_type = 'family'
           AND firmware.release_family_name(c.installed_release_id) = m.scope_value)
          OR (m.scope_type = 'target'
           AND EXISTS (
                SELECT 1 FROM firmware.firmware_releases r2
                JOIN firmware.hardware_targets t2 ON t2.id = r2.target_id
                WHERE r2.id = c.installed_release_id AND t2.target_key = m.scope_value))
          OR (m.scope_type = 'component_class'
           AND c.component_class = m.scope_value)
          OR (m.scope_type = 'firmware_release'
           AND EXISTS (
                SELECT 1 FROM firmware.firmware_releases r2
                WHERE r2.id = c.installed_release_id
                  AND (r2.version = m.scope_value
                       OR (firmware.release_family_name(r2.id) || ' ' || r2.version) = m.scope_value)))
          OR (m.scope_type = 'serial_prefix'
           AND c.hardware_serial IS NOT NULL
           AND left(c.hardware_serial, char_length(m.scope_value)) = m.scope_value)
        )
    );
  IF v_ads IS NOT NULL THEN
    v_reasons := v_reasons || ('airworthiness directive: ' || v_ads);
  END IF;

  -- cardinality(), NOT array_length(): array_length of an empty array is
  -- NULL, so the old `= 0` guard never fired and this function returned
  -- '' instead of NULL for airworthy airframes — every `IS NULL` caller
  -- (release paths, the schedules interlock, the lifecycle trigger) then
  -- misread a clean airframe as blocked.
  IF cardinality(v_reasons) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN array_to_string(v_reasons, ' | ');
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Scheduling interlock — BEFORE trigger on edu.schedules.
--    A grounded airframe cannot enter an ACTIVE booking (scheduled /
--    checked_in), and an active booking can never be re-pointed at one.
--    History rows (completed/cancelled/no_show) are untouched. This is
--    the storage-layer, race-proof "Grounding Alert" flip; the client
--    pre-check RPC is a courtesy, never the enforcement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION firmware.schedule_interlock_ok(_airframe uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
  SELECT _airframe IS NULL OR firmware.grounding_blockers(_airframe) IS NULL
$$;

CREATE OR REPLACE FUNCTION firmware.gate_schedules_for_grounding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_airframe uuid;
  v_blockers text;
  v_new_status text;
  v_old_status text;
BEGIN
  v_airframe := CASE WHEN TG_OP = 'DELETE'
                     THEN (to_jsonb(OLD) ->> 'airframe_id')::uuid
                     ELSE (to_jsonb(NEW) ->> 'airframe_id')::uuid
                END;
  IF v_airframe IS NULL THEN
    RETURN COALESCE(NEW, OLD); -- battery-only / gear-less rows pass
  END IF;

  v_blockers := firmware.grounding_blockers(v_airframe);
  IF v_blockers IS NULL THEN
    RETURN COALESCE(NEW, OLD); -- airworthy: everything passes
  END IF;

  -- blocked airframe: only a transition AWAY from an active status is allowed
  v_new_status := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END;
  v_old_status := CASE WHEN TG_OP = 'DELETE' THEN OLD.status ELSE OLD.status END;

  IF COALESCE(v_new_status, 'x') IN ('scheduled','checked_in') THEN
    RAISE EXCEPTION 'airframe is not airworthy (grounding alert): %', v_blockers
      USING ERRCODE = 'insufficient_privilege', HINT = 'airframe_grounded';
  END IF;

  -- cancel/completing a booking on a grounded airframe is fine
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS firmware_grounding_interlock ON edu.schedules;
CREATE TRIGGER firmware_grounding_interlock
  BEFORE INSERT OR UPDATE OR DELETE ON edu.schedules
  FOR EACH ROW
  EXECUTE FUNCTION firmware.gate_schedules_for_grounding();

-- ---------------------------------------------------------------------------
-- 6. PUBLIC RPC surface — the entire client API.
-- ---------------------------------------------------------------------------

-- 6.0 audit writer. Resolves actor identity/role; computes the chained
--     row digest (sha256 over the event payload + previous digest).
CREATE OR REPLACE FUNCTION public.firmware_write_audit(
  p_org uuid,
  p_event_type text,
  p_airframe uuid DEFAULT NULL,
  p_component uuid DEFAULT NULL,
  p_snapshot uuid DEFAULT NULL,
  p_drift uuid DEFAULT NULL,
  p_work_order uuid DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_before_sha text DEFAULT NULL,
  p_after_sha text DEFAULT NULL,
  p_justification text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware', 'extensions'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_label text;
  v_role text;
  v_seq bigint;
  v_prev char(64);
  v_row char(64);
  v_team uuid;
  v_event_id uuid;
BEGIN
  SELECT o.team_id INTO v_team FROM public.organizations o WHERE o.id = p_org;

  SELECT COALESCE(
           NULLIF(btrim(COALESCE(u.raw_user_meta_data ->> 'callsign', '')), ''),
           'user'
         )
    INTO v_label
  FROM auth.users u WHERE u.id = v_actor;

  v_role := CASE
    WHEN firmware.is_site_admin() THEN 'site_admin'
    WHEN public.ent_is_district_admin(p_org) THEN 'district_admin'
    WHEN public.ent_is_squadron_admin(p_org) THEN 'squadron_admin'
    WHEN public.ent_is_org_member(p_org) THEN 'pilot'
    ELSE 'system'
  END;

  SELECT COALESCE(max(seq), 0) + 1 INTO v_seq
  FROM firmware.compliance_events
  WHERE org_id = p_org;

  SELECT row_sha256 INTO v_prev
  FROM firmware.compliance_events
  WHERE org_id = p_org
  ORDER BY seq DESC
  LIMIT 1;

  v_row := encode(digest(
    concat_ws('|',
      COALESCE(v_seq::text, ''),
      COALESCE(p_org::text, ''),
      COALESCE(v_actor::text, ''),
      COALESCE(p_event_type, ''),
      COALESCE(p_airframe::text, ''),
      COALESCE(p_component::text, ''),
      COALESCE(p_before_sha, ''),
      COALESCE(p_after_sha, ''),
      COALESCE(p_justification, ''),
      COALESCE(v_prev, '')
    ), 'sha256'), 'hex');

  INSERT INTO firmware.compliance_events (
    seq, org_id, team_id, actor, actor_label, actor_role, event_type,
    airframe_id, component_id, snapshot_id, drift_event_id, work_order_id,
    before_state, after_state, before_sha256, after_sha256,
    justification, row_sha256, prev_row_sha256
  ) VALUES (
    v_seq, p_org, v_team, v_actor, v_label, v_role, p_event_type,
    p_airframe, p_component, p_snapshot, p_drift, p_work_order,
    p_before, p_after, p_before_sha, p_after_sha,
    p_justification, v_row, v_prev
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- 6.1 severity matrix bootstrap (idempotent; seeds only what's missing)
CREATE OR REPLACE FUNCTION public.firmware_ensure_default_matrix(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_team uuid;
  v_count integer := 0;
BEGIN
  IF NOT (public.ent_can_manage(p_org) OR firmware.is_site_admin()) THEN
    RAISE EXCEPTION 'only safety officers may seed the severity matrix'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.team_id INTO v_team FROM public.organizations o WHERE o.id = p_org;

  INSERT INTO firmware.severity_rules (org_id, team_id, match_source, field_path, match_kind, severity, note)
  SELECT p_org, v_team, v.src, v.path, v.kind, v.sev, v.note
  FROM (VALUES
    -- Betaflight — critical safety
    ('betaflight_cli','failsafe','exact','critical_safety','failsafe protocol/switches'),
    ('betaflight_cli','failsafe_procedure','exact','critical_safety','failsafe procedure'),
    ('betaflight_cli','rth_arm_without_gps_fix','exact','critical_safety','arming without GPS fix'),
    ('betaflight_cli','gps_rescue_','wildcard','critical_safety','GPS Rescue behavior'),
    ('betaflight_cli','battery_capacity','exact','critical_safety','capacity critical for failsafe'),
    ('betaflight_cli','max_alt','numeric','critical_safety','max altitude limit'),
    ('betaflight_cli','geozone_','wildcard','critical_safety','geozones / fences'),
    ('betaflight_cli','arm_disable_','wildcard','critical_safety','arming condition overrides'),
    -- Betaflight — operational
    ('betaflight_cli','p_','wildcard','operational','PID P gains'),
    ('betaflight_cli','i_','wildcard','operational','PID I gains'),
    ('betaflight_cli','d_','wildcard','operational','PID D gains'),
    ('betaflight_cli','ff_','wildcard','operational','feed-forward'),
    ('betaflight_cli','dshot_bidir','exact','operational','bidirectional dshot'),
    ('betaflight_cli','rc_smoothing_','wildcard','operational','rc smoothing'),
    ('betaflight_cli','rates_type','exact','operational','rates'),
    ('betaflight_cli','aux','wildcard','operational','aux switch mapping'),
    -- Betaflight — informational
    ('betaflight_cli','led_','wildcard','informational','LED strips'),
    ('betaflight_cli','osd_layout_','wildcard','informational','OSD layouts'),
    ('betaflight_cli','osd_','wildcard','informational','OSD elements'),
    -- ArduPilot — critical safety
    ('ardupilot_params','FS_','wildcard','critical_safety','failsafe actions'),
    ('ardupilot_params','RTL_','wildcard','critical_safety','return-to-launch'),
    ('ardupilot_params','FENCE_','wildcard','critical_safety','fences'),
    ('ardupilot_params','ARMING_','wildcard','critical_safety','arming checks'),
    ('ardupilot_params','WPRTL_','wildcard','critical_safety','waypoint RTL'),
    -- ArduPilot — operational
    ('ardupilot_params','ATC_','wildcard','operational','attitude controller'),
    ('ardupilot_params','PSC_','wildcard','operational','position controller'),
    ('ardupilot_params','MOT_','wildcard','operational','motor / mixing'),
    ('ardupilot_params','SERVO','wildcard','operational','servo / function mapping'),
    -- ArduPilot — informational
    ('ardupilot_params','LED_','wildcard','informational','LED patterns'),
    -- JSON — defaults
    ('json','failsafe','wildcard','critical_safety','failsafe keys'),
    ('json','rth','wildcard','critical_safety','RTH keys'),
    ('json','altitude_limit','wildcard','critical_safety','altitude limits'),
    ('json','geofence','wildcard','critical_safety','geofences')
  ) AS v(src, path, kind, sev, note)
  ON CONFLICT (org_id, match_source, field_path, match_kind) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6.2 parse + normalize a raw dump (line formats + JSON passthrough).
--     Betaflight "diff all" lines: "set name = value" / comments "#" / "##".
--     ArduPilot param files: "NAME,VALUE" (trailing comment tolerated).
--     Values coerce to JSON numbers when numeric; keys lower-cased.
CREATE OR REPLACE FUNCTION firmware.normalize_dump(p_format text, p_raw text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_obj  jsonb := '{}'::jsonb;
  v_line text;
  v_key  text;
  v_val  text;
  v_num  numeric;
BEGIN
  IF p_format = 'json' THEN
    BEGIN
      v_obj := p_raw::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid JSON configuration dump'
        USING ERRCODE = 'invalid_text_representation';
    END;
    IF jsonb_typeof(v_obj) <> 'object' THEN
      RAISE EXCEPTION 'JSON configuration dump must be an object'
        USING ERRCODE = 'invalid_text_representation';
    END IF;
    RETURN v_obj;
  END IF;

  FOR v_line IN SELECT * FROM unnest(string_to_array(replace(p_raw, chr(13), ''), E'\n')) LOOP
    v_line := btrim(v_line);
    CONTINUE WHEN v_line = '' OR left(v_line, 1) = '#';

    IF p_format = 'betaflight_cli' THEN
      IF left(lower(v_line), 4) = 'set ' THEN
        v_line := btrim(substr(v_line, 5));
      END IF;
      IF position('=' IN v_line) = 0 THEN
        CONTINUE; -- section banners like "master" / "profile 1"
      END IF;
      v_key := btrim(split_part(v_line, '=', 1));
      v_val := btrim(substr(v_line, strpos(v_line, '=') + 1));
    ELSE -- ardupilot_params
      IF position(',' IN v_line) = 0 THEN
        CONTINUE;
      END IF;
      v_key := btrim(split_part(v_line, ',', 1));
      v_val := btrim(split_part(v_line, ',', 2));
    END IF;

    CONTINUE WHEN v_key = '';

    v_num := NULL;
    BEGIN
      v_num := v_val::numeric;
    EXCEPTION WHEN others THEN
      v_num := NULL;
    END;

    v_obj := jsonb_set(
      v_obj,
      ARRAY[lower(v_key)],
      CASE WHEN v_num IS NOT NULL THEN to_jsonb(v_num) ELSE to_jsonb(v_val) END,
      true
    );
  END LOOP;

  RETURN v_obj;
END;
$$;

-- 6.3 severity resolution: exact rule, then wildcard prefix, then
--     numeric-kind fallback; default informational.
CREATE OR REPLACE FUNCTION firmware.resolve_severity(
  p_org uuid, p_source text, p_field text, p_kind text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
  SELECT COALESCE(
    (SELECT severity FROM firmware.severity_rules
      WHERE org_id = p_org AND match_source = p_source AND match_kind = 'exact'
        AND field_path = lower(p_field) LIMIT 1),
    (SELECT severity FROM firmware.severity_rules
      WHERE org_id = p_org AND match_source = p_source AND match_kind = 'wildcard'
        AND lower(p_field) LIKE field_path || '%' LIMIT 1),
    (SELECT severity FROM firmware.severity_rules
      WHERE org_id = p_org AND match_source = p_source AND match_kind = 'numeric'
        AND field_path = lower(p_field) AND p_kind = 'numeric' LIMIT 1),
    'informational'
  )
$$;

-- 6.4 THE ingestion RPC.
CREATE OR REPLACE FUNCTION public.firmware_ingest_config_snapshot(
  p_org uuid,
  p_airframe uuid,
  p_component uuid,          -- NULL = airframe-level dump
  p_source text,             -- cli_export | gcs_params | api_sync | bench_flash | manual_edit
  p_format text,             -- betaflight_cli | ardupilot_params | json
  p_raw text,
  p_object_path text,        -- storage key the raw dump was uploaded to
  p_kind text DEFAULT 'observed',
  p_captured_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware', 'extensions'
AS $$
DECLARE
  v_team uuid;
  v_af firmware.airframes%ROWTYPE;
  v_comp firmware.airframe_components%ROWTYPE;
  v_norm jsonb;
  v_sha char(64);
  v_golden firmware.config_snapshots%ROWTYPE;
  v_critical int := 0;
  v_operational int := 0;
  v_informational int := 0;
  v_added int := 0;
  v_removed int := 0;
  v_drift_id uuid;
  v_snapshot_id uuid;
  v_rev_no int;
  v_revision_id uuid;
  v_object_path text;
  v_sev text;
  v_old jsonb;
  v_new jsonb;
  v_keys jsonb;
  v_key text;
  v_field_count int;
  v_drift_ids uuid[] := ARRAY[]::uuid[];
  v_is_new boolean;
BEGIN
  IF NOT firmware.is_org_member(p_org) THEN
    RAISE EXCEPTION 'not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_source NOT IN ('cli_export','gcs_params','api_sync','bench_flash','manual_edit')
     OR p_format NOT IN ('betaflight_cli','ardupilot_params','json')
     OR p_kind NOT IN ('golden','baseline_candidate','observed','rollback_reference') THEN
    RAISE EXCEPTION 'invalid source/format/kind' USING ERRCODE = 'check_violation';
  END IF;
  IF p_raw IS NULL OR char_length(p_raw) = 0 OR char_length(p_raw) > 400000 THEN
    RAISE EXCEPTION 'configuration dump must be between 1 and 400000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_af FROM firmware.airframes WHERE id = p_airframe AND org_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'airframe not found in this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_team := v_af.team_id;

  -- storage path contract: <team_id>/<airframe_id>/<uuid>-<name>
  v_object_path := v_team::text || '/' || p_airframe::text || '/';
  IF p_object_path IS NULL OR NOT starts_with(p_object_path, v_object_path) THEN
    RAISE EXCEPTION 'object path must live under %', v_object_path
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_component IS NOT NULL THEN
    SELECT * INTO v_comp FROM firmware.airframe_components
    WHERE id = p_component AND airframe_id = p_airframe;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'component does not belong to this airframe'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- only safety officers set the golden baseline
  IF p_kind = 'golden' AND NOT (public.ent_can_manage(p_org) OR firmware.is_site_admin()) THEN
    RAISE EXCEPTION 'only safety officers may set the golden baseline'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_norm := firmware.normalize_dump(p_format, p_raw);
  v_sha := encode(digest(p_raw, 'sha256'), 'hex');
  SELECT count(*) INTO v_field_count FROM jsonb_object_keys(v_norm);

  INSERT INTO firmware.config_snapshots (
    org_id, team_id, airframe_id, component_id, source, format, snapshot_kind,
    raw_object_path, raw_sha256, normalized, field_count, captured_at
  ) VALUES (
    p_org, v_team, p_airframe, p_component, p_source, p_format, p_kind,
    p_object_path, v_sha, v_norm, v_field_count, p_captured_at
  ) RETURNING id INTO v_snapshot_id;

  -- monotonic revision allocation per (airframe, component) scope
  SELECT COALESCE(max(revision_no), 0) + 1 INTO v_rev_no
  FROM firmware.config_revisions
  WHERE airframe_id = p_airframe
    AND component_id IS NOT DISTINCT FROM p_component;

  INSERT INTO firmware.config_revisions (
    org_id, team_id, airframe_id, component_id, revision_no,
    config_snapshot_id, normalized, raw_sha256
  ) VALUES (
    p_org, v_team, p_airframe, p_component, v_rev_no,
    v_snapshot_id, v_norm, v_sha
  ) RETURNING id INTO v_revision_id;

  IF p_kind = 'golden' THEN
    -- Golden is the LATEST golden snapshot per (airframe, component) scope;
    -- superseded goldens stay immutable as historical revisions. The
    -- "active golden" is resolved by created_at DESC in the diff query.

    PERFORM public.firmware_write_audit(
      p_org, 'baseline_set', p_airframe, p_component, v_snapshot_id,
      NULL, NULL, NULL, jsonb_build_object('fields', v_field_count), NULL, v_sha,
      'golden baseline established/updated'
    );
    RETURN jsonb_build_object(
      'snapshot_id', v_snapshot_id, 'revision_no', v_rev_no, 'field_count', v_field_count,
      'diff', jsonb_build_object('added', 0, 'removed', 0, 'changed', 0,
                                 'critical', 0, 'operational', 0, 'informational', 0),
      'grounded', false, 'drift_event_ids', '[]'::jsonb
    );
  END IF;

  -- ---- diff vs the active golden baseline --------------------------------
  SELECT * INTO v_golden
  FROM firmware.config_snapshots
  WHERE airframe_id = p_airframe
    AND component_id IS NOT DISTINCT FROM p_component
    AND snapshot_kind = 'golden'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_golden.id IS NOT NULL THEN
    v_keys := (
      SELECT jsonb_agg(DISTINCT k)
      FROM (
        SELECT k FROM jsonb_object_keys(v_norm) AS k
        UNION
        SELECT k FROM jsonb_object_keys(v_golden.normalized) AS k
      ) u
    );

    FOR v_key IN SELECT jsonb_array_elements_text(v_keys) LOOP
      v_old := v_golden.normalized -> v_key;
      v_new := v_norm -> v_key;
      CONTINUE WHEN v_old IS NOT DISTINCT FROM v_new;

      IF v_new IS NULL THEN
        v_removed := v_removed + 1;
      ELSIF v_old IS NULL THEN
        v_added := v_added + 1;
      END IF;

      v_sev := firmware.resolve_severity(p_org, p_format, v_key,
        CASE WHEN jsonb_typeof(v_new) = 'number' OR jsonb_typeof(v_old) = 'number'
             THEN 'numeric' ELSE 'exact' END);

      IF v_sev = 'critical_safety' THEN
        v_critical := v_critical + 1;
      ELSIF v_sev = 'operational' THEN
        v_operational := v_operational + 1;
      ELSE
        v_informational := v_informational + 1;
      END IF;

      -- upsert the OPEN drift row (unique per airframe/component/field)
      INSERT INTO firmware.drift_events (
        org_id, team_id, airframe_id, component_id,
        config_snapshot_id, config_revision_id, baseline_snapshot_id,
        field_path, old_value, new_value, severity, detected_by
      ) VALUES (
        p_org, v_team, p_airframe, p_component,
        v_snapshot_id, v_revision_id, v_golden.id,
        v_key, v_old, v_new, v_sev, auth.uid()
      )
      ON CONFLICT (airframe_id,
                   COALESCE(component_id, '00000000-0000-0000-0000-000000000000'::uuid),
                   field_path)
      WHERE drift_status = 'open'
      DO UPDATE SET
        config_snapshot_id  = EXCLUDED.config_snapshot_id,
        config_revision_id  = EXCLUDED.config_revision_id,
        baseline_snapshot_id = EXCLUDED.baseline_snapshot_id,
        old_value           = EXCLUDED.old_value,
        new_value           = EXCLUDED.new_value,
        severity            = EXCLUDED.severity,
        detected_at         = now()
      RETURNING id, (xmax = 0) AS inserted INTO v_drift_id, v_is_new;
      IF v_is_new THEN
        v_drift_ids := v_drift_ids || v_drift_id;
      END IF;

      PERFORM public.firmware_write_audit(
        p_org, 'drift_detected', p_airframe, p_component, v_snapshot_id,
        v_drift_id, NULL,
        jsonb_build_object('field', v_key, 'value', v_old),
        jsonb_build_object('field', v_key, 'value', v_new),
        v_golden.raw_sha256, v_sha, NULL
      );
    END LOOP;
  END IF;

  -- re-observation that matches the golden baseline auto-clears stale open
  -- drift (symmetric with automatic grounding: the system re-airs when its
  -- own blocker disappears — the golden still stands, no human waiver needed)
  IF v_golden.id IS NOT NULL THEN
    UPDATE firmware.drift_events d
    SET drift_status = 'cleared',
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolution_note = 're-ingested configuration matches the golden baseline'
    WHERE d.airframe_id = p_airframe
      AND d.component_id IS NOT DISTINCT FROM p_component
      AND d.drift_status = 'open'
      AND NOT (d.id = ANY(v_drift_ids));

    UPDATE firmware.airframes a
    SET lifecycle_status = 'active', grounded_reason = NULL
    WHERE a.id = p_airframe
      AND a.lifecycle_status = 'grounded'
      AND firmware.grounding_blockers(p_airframe, true) IS NULL;
    IF FOUND THEN
      PERFORM public.firmware_write_audit(
        p_org, 'interlock_release', p_airframe, p_component, v_snapshot_id,
        NULL, NULL,
        jsonb_build_object('lifecycle_status', 'grounded'),
        jsonb_build_object('lifecycle_status', 'active'),
        NULL, v_sha,
        'configuration re-ingest matches the golden baseline'
      );
    END IF;
  END IF;

  -- grounding interlock: any critical drift grounds immediately
  IF v_critical > 0 AND v_af.lifecycle_status <> 'grounded' THEN
    PERFORM set_config('firmware.system_grounding', 'on', true);
    UPDATE firmware.airframes
    SET lifecycle_status = 'grounded',
        grounded_reason = 'critical configuration drift detected (' || v_critical || ' field(s))'
    WHERE id = p_airframe;
    PERFORM set_config('firmware.system_grounding', '', true);
    PERFORM public.firmware_write_audit(
      p_org, 'interlock_ground', p_airframe, p_component, v_snapshot_id,
      NULL, NULL,
      jsonb_build_object('lifecycle_status', v_af.lifecycle_status),
      jsonb_build_object('lifecycle_status', 'grounded', 'critical_fields', v_critical),
      NULL, v_sha,
      'automatic grounding: critical configuration drift'
    );
  END IF;

  PERFORM public.firmware_write_audit(
    p_org, 'snapshot_ingest', p_airframe, p_component, v_snapshot_id,
    NULL, NULL, NULL,
    jsonb_build_object('format', p_format, 'source', p_source, 'kind', p_kind,
                       'fields', v_field_count, 'sha256', v_sha),
    NULL, v_sha, NULL
  );

  RETURN jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'revision_no', v_rev_no,
    'field_count', v_field_count,
    'diff', jsonb_build_object(
      'added', v_added,
      'removed', v_removed,
      'changed', v_critical + v_operational + v_informational,
      'critical', v_critical,
      'operational', v_operational,
      'informational', v_informational),
    'grounded', v_critical > 0,
    'drift_event_ids', to_jsonb(v_drift_ids)
  );
END;
$$;

-- 6.5 acknowledge / resolve / suppress drift
CREATE OR REPLACE FUNCTION public.firmware_resolve_drift(
  p_drift uuid,
  p_status text,             -- 'acknowledged' | 'cleared' | 'suppressed'
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_drift firmware.drift_events%ROWTYPE;
  v_is_manager boolean;
BEGIN
  IF p_status NOT IN ('acknowledged','cleared','suppressed') THEN
    RAISE EXCEPTION 'invalid drift status' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_drift FROM firmware.drift_events WHERE id = p_drift;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'drift not found' USING ERRCODE = 'check_violation';
  END IF;

  v_is_manager := public.ent_can_manage(v_drift.org_id) OR firmware.is_site_admin();

  IF p_status = 'suppressed' AND NOT v_is_manager THEN
    RAISE EXCEPTION 'only safety officers may suppress drift'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (v_is_manager OR v_drift.detected_by = auth.uid()) THEN
    RAISE EXCEPTION 'only the detector or a safety officer may act on this drift'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_drift.drift_status IN ('cleared','suppressed') THEN
    RAISE EXCEPTION 'drift already closed' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE firmware.drift_events
  SET drift_status = p_status,
      resolved_by = auth.uid(),
      resolved_at = now(),
      resolution_note = p_note
  WHERE id = p_drift;

  PERFORM public.firmware_write_audit(
    v_drift.org_id,
    CASE p_status WHEN 'suppressed' THEN 'drift_suppressed' ELSE 'drift_resolved' END,
    v_drift.airframe_id, v_drift.component_id, v_drift.config_snapshot_id, v_drift.id,
    NULL,
    jsonb_build_object('drift_status', v_drift.drift_status),
    jsonb_build_object('drift_status', p_status),
    NULL, NULL, p_note
  );

  -- a safety officer resolving the last critical blocker releases the airframe
  IF p_status IN ('cleared','suppressed') AND v_is_manager THEN
    -- _exclude_lifecycle: the grounded status is exactly what this release
    -- clears; only REMAINING blockers (drift, blacklist, AD, work order)
    -- may veto it.
    IF firmware.grounding_blockers(v_drift.airframe_id, true) IS NULL THEN
      UPDATE firmware.airframes
      SET lifecycle_status = 'active', grounded_reason = NULL
      WHERE id = v_drift.airframe_id
        AND lifecycle_status = 'grounded';
      PERFORM public.firmware_write_audit(
        v_drift.org_id, 'interlock_release', v_drift.airframe_id, NULL, NULL, NULL,
        NULL,
        jsonb_build_object('lifecycle_status', 'grounded'),
        jsonb_build_object('lifecycle_status', 'active'),
        NULL, NULL, 'all grounding blockers cleared'
      );
    END IF;
  END IF;
END;
$$;

-- 6.6 record a flash (auto-creates the sign-off work order on success)
CREATE OR REPLACE FUNCTION public.firmware_record_flash(
  p_org uuid,
  p_airframe uuid,
  p_component uuid,
  p_to_release uuid,
  p_flash_status text DEFAULT 'succeeded',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_comp firmware.airframe_components%ROWTYPE;
  v_af firmware.airframes%ROWTYPE;
  v_from uuid;
  v_wo uuid;
  v_release firmware.firmware_releases%ROWTYPE;
BEGIN
  IF NOT firmware.is_org_member(p_org) THEN
    RAISE EXCEPTION 'not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_flash_status NOT IN ('succeeded','failed','bricked','rolled_back') THEN
    RAISE EXCEPTION 'invalid flash status' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_af FROM firmware.airframes WHERE id = p_airframe AND org_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'airframe not found in this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_comp
  FROM firmware.airframe_components
  WHERE id = p_component AND airframe_id = p_airframe AND org_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'component not found on this airframe'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_release FROM firmware.firmware_releases WHERE id = p_to_release;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target release not found' USING ERRCODE = 'check_violation';
  END IF;

  v_from := v_comp.installed_release_id;

  -- system context: the RPC (not the client) writes work orders + steps
  PERFORM set_config('firmware.system_write', 'on', true);

  INSERT INTO firmware.flash_records (
    org_id, team_id, airframe_id, component_id,
    from_release_id, to_release_id, flash_status, performed_by, notes
  ) VALUES (
    p_org, v_comp.team_id, p_airframe, p_component,
    v_from, p_to_release, p_flash_status, auth.uid(), p_notes
  );

  IF p_flash_status = 'succeeded' THEN
    UPDATE firmware.airframe_components
    SET installed_release_id = p_to_release
    WHERE id = p_component;
  ELSIF p_flash_status = 'bricked' THEN
    UPDATE firmware.airframe_components
    SET lifecycle_status = 'failed'
    WHERE id = p_component;
    -- a bricked component grounds the airframe pending replacement
    -- (system context: the hard-stop fires for any actor, technician included)
    PERFORM set_config('firmware.system_grounding', 'on', true);
    UPDATE firmware.airframes
    SET lifecycle_status = 'grounded',
        grounded_reason = COALESCE(grounded_reason, 'component failed during flash')
    WHERE id = p_airframe
      AND lifecycle_status IN ('active','maintenance');
    PERFORM set_config('firmware.system_grounding', '', true);
  END IF;

  PERFORM public.firmware_write_audit(
    p_org, 'flash_recorded', p_airframe, p_component, NULL, NULL, NULL,
    jsonb_build_object('installed_release_id', v_from, 'component_status', v_comp.lifecycle_status),
    jsonb_build_object('installed_release_id', p_to_release,
                       'flash_status', p_flash_status,
                       'component_status', CASE WHEN p_flash_status = 'bricked' THEN 'failed' ELSE v_comp.lifecycle_status END),
    NULL, NULL, p_notes
  );

  -- auto-create the 4-step sign-off chain for a real version change
  IF p_flash_status = 'succeeded' AND v_from IS DISTINCT FROM p_to_release THEN
    INSERT INTO firmware.work_orders (
      org_id, team_id, airframe_id, component_id, work_order_kind,
      initiated_by, assigned_technician, justification
    ) VALUES (
      p_org, v_comp.team_id, p_airframe, p_component, 'firmware_flash',
      auth.uid(), auth.uid(),
      'firmware flash: ' || COALESCE(firmware.release_family_name(v_from), 'none')
        || ' -> ' || COALESCE(firmware.release_family_name(p_to_release), '?') || ' ' || v_release.version
    ) RETURNING id INTO v_wo;

    INSERT INTO firmware.work_order_steps (work_order_id, step_no, step_kind, required_role) VALUES
      (v_wo, 1, 'technician_attest', 'technician'),
      (v_wo, 2, 'evidence_upload',   'technician'),
      (v_wo, 3, 'safety_audit',      'safety_manager'),
      (v_wo, 4, 'final_release',     'safety_manager');
  END IF;

  RETURN jsonb_build_object('work_order_id', v_wo);
END;
$$;

-- 6.7 advance the sign-off chain
CREATE OR REPLACE FUNCTION public.firmware_advance_work_order(
  p_work_order uuid,
  p_step_no smallint,
  p_action text,             -- 'satisfy' | 'reject' | 'cancel'
  p_notes text DEFAULT NULL,
  p_evidence_snapshot uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_wo firmware.work_orders%ROWTYPE;
  v_step firmware.work_order_steps%ROWTYPE;
  v_is_manager boolean;
  v_status_after text;
BEGIN
  -- system context: only the RPC mutates work orders + steps
  PERFORM set_config('firmware.system_write', 'on', true);

  SELECT * INTO v_wo FROM firmware.work_orders WHERE id = p_work_order;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work order not found' USING ERRCODE = 'check_violation';
  END IF;

  v_is_manager := public.ent_can_manage(v_wo.org_id) OR firmware.is_site_admin();
  IF NOT (v_is_manager OR firmware.is_org_member(v_wo.org_id)) THEN
    RAISE EXCEPTION 'not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action = 'cancel' THEN
    IF NOT v_is_manager THEN
      RAISE EXCEPTION 'only safety officers may cancel a work order'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE firmware.work_orders
    SET status = 'cancelled', closed_at = now(), closed_by = auth.uid(), updated_at = now()
    WHERE id = p_work_order;
    PERFORM public.firmware_write_audit(
      v_wo.org_id, 'work_order_rejected', v_wo.airframe_id, v_wo.component_id,
      NULL, NULL, p_work_order,
      jsonb_build_object('status', v_wo.status),
      jsonb_build_object('status', 'cancelled'), NULL, NULL, p_notes);
    RETURN;
  END IF;

  SELECT * INTO v_step
  FROM firmware.work_order_steps
  WHERE work_order_id = p_work_order AND step_no = p_step_no;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'step not found' USING ERRCODE = 'check_violation';
  END IF;

  -- role enforcement: safety_manager steps require the safety-officer tier
  IF v_step.required_role = 'safety_manager' AND NOT v_is_manager THEN
    RAISE EXCEPTION 'this step requires a safety officer'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action = 'reject' THEN
    IF NOT v_is_manager THEN
      RAISE EXCEPTION 'only safety officers may reject a step'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE firmware.work_orders
    SET status = 'rejected', closed_at = now(), closed_by = auth.uid(), updated_at = now()
    WHERE id = p_work_order;
    UPDATE firmware.work_order_steps
    SET status = 'rejected', acted_by = auth.uid(), acted_at = now(), notes = p_notes
    WHERE id = v_step.id;
    PERFORM public.firmware_write_audit(
      v_wo.org_id, 'work_order_rejected', v_wo.airframe_id, v_wo.component_id,
      NULL, NULL, p_work_order,
      jsonb_build_object('status', v_wo.status, 'step', p_step_no),
      jsonb_build_object('status', 'rejected', 'step', p_step_no), NULL, NULL, p_notes);
    RETURN;
  END IF;

  IF p_action <> 'satisfy' THEN
    RAISE EXCEPTION 'invalid action' USING ERRCODE = 'check_violation';
  END IF;

  IF v_wo.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'work order already closed' USING ERRCODE = 'check_violation';
  END IF;
  IF v_step.status = 'satisfied' THEN
    RAISE EXCEPTION 'step already satisfied' USING ERRCODE = 'check_violation';
  END IF;

  IF v_wo.status = 'open' THEN
    UPDATE firmware.work_orders SET status = 'in_progress', updated_at = now()
    WHERE id = p_work_order;
  END IF;

  UPDATE firmware.work_order_steps
  SET status = 'satisfied', acted_by = auth.uid(), acted_at = now(),
      notes = p_notes, evidence_snapshot_id = p_evidence_snapshot
  WHERE id = v_step.id;

  SELECT status INTO v_status_after FROM firmware.work_orders WHERE id = p_work_order;
  PERFORM public.firmware_write_audit(
    v_wo.org_id, 'work_order_advanced', v_wo.airframe_id, v_wo.component_id,
    p_evidence_snapshot, NULL, p_work_order,
    jsonb_build_object('step', p_step_no, 'step_status', v_step.status),
    jsonb_build_object('step', p_step_no, 'step_status', 'satisfied',
                       'work_order_status', v_status_after),
    NULL, NULL, p_notes
  );

  -- final release: the sequence trigger approved the work order; now clear
  -- the lifecycle blocker if nothing else grounds the airframe
  IF v_status_after = 'approved' THEN
    -- _exclude_lifecycle: approval clears the lifecycle grounding itself;
    -- only REMAINING blockers may veto the release.
    IF firmware.grounding_blockers(v_wo.airframe_id, true) IS NULL THEN
      UPDATE firmware.airframes
      SET lifecycle_status = 'active', grounded_reason = NULL
      WHERE id = v_wo.airframe_id AND lifecycle_status = 'grounded';
      PERFORM public.firmware_write_audit(
        v_wo.org_id, 'interlock_release', v_wo.airframe_id, v_wo.component_id,
        NULL, NULL, p_work_order,
        jsonb_build_object('lifecycle_status', 'grounded'),
        jsonb_build_object('lifecycle_status', 'active'),
        NULL, NULL, 'work order approved; airframe released'
      );
    END IF;
  END IF;
END;
$$;

-- 6.8 airworthiness directives
CREATE OR REPLACE FUNCTION public.firmware_publish_directive(
  p_org uuid,                       -- NULL = platform-wide (site staff only)
  p_ref text,
  p_title text,
  p_body text,
  p_matches jsonb,                  -- [{scope_type, scope_value}, ...]
  p_source_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_ad uuid;
  v_m jsonb;
  v_scope_type text;
  v_scope_value text;
BEGIN
  IF p_org IS NULL THEN
    IF NOT firmware.is_site_admin() THEN
      RAISE EXCEPTION 'only platform staff may publish platform-wide directives'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT (public.ent_can_manage(p_org) OR firmware.is_site_admin()) THEN
    RAISE EXCEPTION 'only safety officers may publish directives'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO firmware.airworthiness_directives (
    org_id, directive_ref, title, body, source_url, published_by
  ) VALUES (
    p_org, p_ref, p_title, p_body, p_source_url, auth.uid()
  ) RETURNING id INTO v_ad;

  FOR v_m IN SELECT * FROM jsonb_array_elements(p_matches) LOOP
    v_scope_type  := v_m ->> 'scope_type';
    v_scope_value := btrim(v_m ->> 'scope_value');
    IF v_scope_type NOT IN ('manufacturer','family','target','component_class','firmware_release','serial_prefix')
       OR v_scope_value IS NULL OR v_scope_value = '' THEN
      RAISE EXCEPTION 'invalid directive match scope' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO firmware.airworthiness_directive_matches (directive_id, scope_type, scope_value)
    VALUES (v_ad, v_scope_type, v_scope_value)
    ON CONFLICT DO NOTHING;
  END LOOP;

  PERFORM public.firmware_write_audit(
    p_org, 'ad_published', NULL, NULL, NULL, NULL, NULL,
    NULL, jsonb_build_object('directive_id', v_ad, 'ref', p_ref, 'title', p_title),
    NULL, NULL, 'airworthiness directive published'
  );

  RETURN v_ad;
END;
$$;

-- 6.9 deactivate a directive
CREATE OR REPLACE FUNCTION public.firmware_deactivate_directive(p_directive uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_ad firmware.airworthiness_directives%ROWTYPE;
BEGIN
  SELECT * INTO v_ad FROM firmware.airworthiness_directives WHERE id = p_directive;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'directive not found' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ((v_ad.org_id IS NULL AND firmware.is_site_admin())
          OR (v_ad.org_id IS NOT NULL
              AND (public.ent_can_manage(v_ad.org_id) OR firmware.is_site_admin()))) THEN
    RAISE EXCEPTION 'only the publishing tier may deactivate a directive'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE firmware.airworthiness_directives
  SET is_active = false
  WHERE id = p_directive;

  PERFORM public.firmware_write_audit(
    v_ad.org_id, 'ad_deactivated', NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object('is_active', true),
    jsonb_build_object('is_active', false),
    NULL, NULL, 'directive deactivated'
  );
END;
$$;

-- 6.10 override request (technician) — the decision is a safety-officer
--      work-order/audit action; v1 records the request in the audit chain.
CREATE OR REPLACE FUNCTION public.firmware_request_override(
  p_org uuid,
  p_airframe uuid,
  p_justification text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'firmware'
AS $$
DECLARE
  v_event uuid;
BEGIN
  IF NOT firmware.is_org_member(p_org) THEN
    RAISE EXCEPTION 'not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_justification IS NULL OR char_length(btrim(p_justification)) < 10 THEN
    RAISE EXCEPTION 'override justification must be at least 10 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT public.firmware_write_audit(
    p_org, 'override_requested', p_airframe, NULL, NULL, NULL, NULL,
    NULL, jsonb_build_object('justification', p_justification),
    NULL, NULL, p_justification
  ) INTO v_event;
  RETURN v_event;
END;
$$;

-- 6.11 verify the audit chain (any org member may verify)
CREATE OR REPLACE FUNCTION public.firmware_verify_audit_chain(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'firmware', 'extensions'
AS $$
DECLARE
  r RECORD;
  v_prev char(64) := NULL;
  v_expected char(64);
  v_count int := 0;
BEGIN
  IF NOT firmware.is_org_member(p_org) THEN
    RAISE EXCEPTION 'not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR r IN
    SELECT * FROM firmware.compliance_events
    WHERE org_id = p_org
    ORDER BY seq
  LOOP
    v_expected := encode(digest(
      concat_ws('|',
        r.seq::text, r.org_id::text, COALESCE(r.actor::text,''),
        r.event_type, COALESCE(r.airframe_id::text,''), COALESCE(r.component_id::text,''),
        COALESCE(r.before_sha256,''), COALESCE(r.after_sha256,''),
        COALESCE(r.justification,''), COALESCE(r.prev_row_sha256,'')
      ), 'sha256'), 'hex');

    IF v_expected IS DISTINCT FROM r.row_sha256 THEN
      RETURN jsonb_build_object('ok', false, 'broken_at_seq', r.seq,
        'reason', 'row digest mismatch (row content was altered)');
    END IF;
    IF v_prev IS DISTINCT FROM r.prev_row_sha256 THEN
      RETURN jsonb_build_object('ok', false, 'broken_at_seq', r.seq,
        'reason', 'chain link mismatch (row inserted or removed)');
    END IF;

    v_prev := r.row_sha256;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'events', v_count);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants — RPC surface only. Client-visible tables are SELECT-only via
--    PostgREST (the UI reads them through RLS); every mutation goes through
--    the public.firmware_* RPCs so it lands with an audit row.
-- ---------------------------------------------------------------------------
REVOKE ALL ON firmware.work_orders FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.work_order_steps FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.flash_records FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.airworthiness_directives FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.airworthiness_directive_matches FROM anon, PUBLIC, authenticated;
GRANT SELECT ON firmware.work_orders, firmware.work_order_steps,
  firmware.flash_records, firmware.airworthiness_directives,
  firmware.airworthiness_directive_matches TO authenticated;

REVOKE ALL ON FUNCTION public.firmware_write_audit(uuid, text, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.firmware_ensure_default_matrix(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmware_ensure_default_matrix(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.firmware_ingest_config_snapshot(uuid, uuid, uuid, text, text, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmware_ingest_config_snapshot(uuid, uuid, uuid, text, text, text, text, text, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.firmware_resolve_drift(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmware_resolve_drift(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.firmware_record_flash(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmware_record_flash(uuid, uuid, uuid, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.firmware_advance_work_order(uuid, smallint, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmware_advance_work_order(uuid, smallint, text, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.firmware_publish_directive(uuid, text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmware_publish_directive(uuid, text, text, text, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.firmware_deactivate_directive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmware_deactivate_directive(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.firmware_request_override(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmware_request_override(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.firmware_verify_audit_chain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmware_verify_audit_chain(uuid) TO authenticated;

REVOKE ALL ON FUNCTION firmware.schedule_interlock_ok(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.gate_schedules_for_grounding() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.normalize_dump(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.resolve_severity(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.release_family_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.team_id_of_org(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION firmware.enforce_work_order_step_sequence() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
