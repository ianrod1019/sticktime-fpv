-- Fix-forward: the numeric fallback branch of resolve_severity leaked the
-- max_alt critical rule onto every unmatched numeric field (e.g. max_angle).
-- The numeric rule now requires BOTH an exact field_path match AND that the
-- diff kind actually be numeric; the caller derives kind from either side of
-- the diff (old or new numeric).

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


NOTIFY pgrst, 'reload schema';
