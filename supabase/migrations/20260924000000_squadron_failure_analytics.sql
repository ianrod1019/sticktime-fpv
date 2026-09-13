-- ====================================================
-- Migration: org_gear failure analytics (2026-09-24)
--
-- Squadron failure analytics over the ORG fleet. org_gear is the shared,
-- team-owned gear schema (20260921000000_org_gear_schema_and_rls.sql), so
-- every row already belongs to the team — aggregation needs no SECURITY
-- DEFINER privilege escalation and no cross-pilot privacy compromises:
--
--   * SECURITY INVOKER: RLS (org_member_select: org_gear.is_team_member)
--    fully scopes every read. A non-member simply sees zero rows.
--   * Data source: org_gear.maintenance_logs descriptions matching the
--     structured failure format ("Failure: <reason> · Part: <part> ·
--     Category: <bucket>") + org_gear.drone_parts rows with
--     status='broken'. Identical event model to the personal dashboard:
--     events per (bucket, component) = max(#reports, #broken_parts),
--     exact duplicate reports collapsed, costs from reports only.
--   * The RPC also accepts a NULL team id and returns the caller's rows for
--     every org they belong to, enabling "all my squads" roll-ups.
--
-- Also adds `check_enterprise_access()`: the gate ABOVE Pro. True only for
-- tier='enterprise' or admin/dev roles. Enterprise features (squadron
-- failure analytics) call it in their RPC guards so a Pro user cannot read
-- org-fleet roll-ups.
--
-- Helpers are IMMUTABLE/STABLE for plan inlining; grants revoked from
-- anon/public.
-- ====================================================

-- ---------------------------------------------------------------------------
-- 0. Enterprise gate: same shape as check_pro_access() but tier='enterprise'
--    (or admin/dev). SECURITY DEFINER so RLS on profiles can't block the
--    tier lookup; granted to authenticated only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_enterprise_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id   uuid;
  v_user_tier text;
  v_user_role text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT tier, role INTO v_user_tier, v_user_role
  FROM public.profiles
  WHERE profiles.id = v_user_id;

  IF v_user_role IS NOT NULL AND LOWER(v_user_role) IN ('admin', 'dev') THEN
    RETURN true;
  END IF;

  IF v_user_tier IS NOT NULL AND LOWER(v_user_tier) = 'enterprise' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_enterprise_access() TO authenticated;

COMMENT ON FUNCTION public.check_enterprise_access() IS
  'Returns true only for tier=enterprise or admin/dev. Gate ABOVE Pro — enterprise-only features call this in their guards.';

-- ---------------------------------------------------------------------------
-- 1. Parser: mirrors the client's FAILURE_LINE_PATTERN exactly.
--    "Failure: <reason> · Part: <part> · Category: <category>" on the FIRST
--    line of a maintenance_logs.description. Returns no rows for anything
--    else (so CROSS JOIN LATERAL acts as an inline filter). IMMUTABLE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parse_failure_head(p_description text)
RETURNS TABLE (
  f_reason   text,
  f_part     text,
  f_category text
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $function$
DECLARE
  v_head  text;
  v_parts text[];
BEGIN
  IF p_description IS NULL THEN
    RETURN;
  END IF;

  v_head := split_part(p_description, E'\n', 1);

  -- The separator is the literal middle dot " · " used by
  -- buildFailureReportDescription on the client.
  v_parts := string_to_array(v_head, ' · ');
  IF cardinality(v_parts) <> 3 THEN
    RETURN;
  END IF;

  IF btrim(v_parts[1]) NOT LIKE 'Failure:%' THEN
    RETURN;
  END IF;
  IF btrim(v_parts[2]) NOT LIKE 'Part:%' THEN
    RETURN;
  END IF;
  IF btrim(v_parts[3]) NOT LIKE 'Category:%' THEN
    RETURN;
  END IF;

  f_reason   := btrim(substr(btrim(v_parts[1]), length('Failure:') + 1));
  f_part     := btrim(substr(btrim(v_parts[2]), length('Part:') + 1));
  f_category := btrim(substr(btrim(v_parts[3]), length('Category:') + 1));

  IF f_reason IS NULL OR f_reason = '' THEN
    RETURN; -- no row
  END IF;

  -- RETURNS TABLE is SETOF: plain RETURN emits nothing — RETURN NEXT is
  -- what emits the current OUT values as the parsed row.
  RETURN NEXT;
  RETURN;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Part-category -> presentation bucket mapping (mirrors the client's
--    PART_CATEGORY_BUCKET). IMMUTABLE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_part_bucket(p_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE lower(btrim(COALESCE(p_category, '')))
    WHEN 'frame'  THEN 'Frames'
    WHEN 'motor'  THEN 'Motors'
    WHEN 'esc'    THEN 'ESCs'
    WHEN 'fc'     THEN 'Flight Controllers'
    WHEN 'aio'    THEN 'Flight Controllers'
    WHEN 'vtx'    THEN 'VTX/Camera'
    WHEN 'camera' THEN 'VTX/Camera'
    ELSE 'Other'
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Crash-reason predicate (mirrors the client's CRASH_REASONS set).
--    IMMUTABLE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_is_crash_reason(p_reason text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT lower(btrim(COALESCE(p_reason, ''))) IN (
    'mid-air collision',
    'tree strike',
    'hard landing',
    'lost signal / flyaway',
    'ground crash on launch'
  );
$function$;

-- ---------------------------------------------------------------------------
-- 4. The aggregation RPC.
--
--    _team_id NULL -> every org the caller belongs to (pilot roll-up across
--    squads). Otherwise exactly that team. SECURITY INVOKER: org RLS scopes
--    the underlying reads; membership is re-verified explicitly so a caller
--    who passes an arbitrary team id gets a clean error rather than silence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_org_failure_analytics(_team_id uuid DEFAULT NULL)
RETURNS TABLE (
  team_id        uuid,
  team_name      text,
  bucket         text,
  label          text,
  reports        integer,
  broken_parts   integer,
  events         integer,
  repair_cost    numeric,
  is_crash       boolean,
  fleet_minutes  bigint,
  drone_crashes  bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, org_gear
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Enterprise gate: squadron failure analytics is an ENTERPRISE feature —
  -- Pro is not enough. Same tier check as the client's useEnterpriseAccess,
  -- evaluated server-side so it cannot be bypassed by tampered clients.
  IF NOT COALESCE(public.check_enterprise_access(), false) THEN
    RAISE EXCEPTION 'Access denied: squadron failure analytics requires the Enterprise plan';
  END IF;

  IF _team_id IS NOT NULL THEN
    -- NB: qualify every column — RETURNS TABLE output names (team_id,
    -- reports, label, ...) become PL/pgSQL variables and any unqualified
    -- reference to them is an ambiguity error at runtime.
    IF NOT EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Access denied: not a member of this squadron';
    END IF;
  END IF;

  RETURN QUERY
  WITH scope_teams AS (
    SELECT t.id AS team_id, t.name AS team_name
    FROM public.teams t
    WHERE _team_id IS NULL
       OR t.id = _team_id
  ),

  -- ---- 1. Structured failure reports from org maintenance_logs ----------
  all_reports AS (
    SELECT
      st.team_id,
      st.team_name,
      l.id                                AS log_id,
      l.gear_id                           AS log_gear,
      COALESCE(NULLIF(btrim(p.f_part), ''), 'Unspecified')
                                          AS part_label,
      CASE WHEN btrim(p.f_category) IN (
               'Frames', 'Motors', 'ESCs',
               'Flight Controllers', 'VTX/Camera'
             )
           THEN btrim(p.f_category) ELSE 'Other' END
                                          AS bucket,
      lower(btrim(p.f_reason))            AS reason_lc,
      COALESCE(l.cost, 0)                 AS cost
    FROM scope_teams st
    JOIN org_gear.maintenance_logs l
      ON l.team_id = st.team_id
      -- INVOKER rights: RLS (org_member_select) already guarantees the
      -- caller only ever sees rows of teams they belong to.
    CROSS JOIN LATERAL public.parse_failure_head(l.description) p
    WHERE p.f_reason IS NOT NULL
  ),

  -- Double-submit guard: collapse exact duplicates (same team, gear, reason,
  -- part, category and cost) — mirrors the client's dedup key.
  deduped_reports AS (
    SELECT DISTINCT ON (dr.team_id, dr.log_gear, dr.reason_lc, dr.part_label, dr.bucket, dr.cost)
      dr.*
    FROM all_reports dr
    ORDER BY dr.team_id, dr.log_gear, dr.reason_lc, dr.part_label, dr.bucket, dr.cost, dr.log_id
  ),

  -- ---- 2. Broken parts (status='broken') ---------------------------------
  broken AS (
    SELECT
      st.team_id,
      st.team_name,
      public.org_part_bucket(dp.category) AS bucket,
      NULLIF(btrim(dp.name), '')          AS part_label,
      lower(btrim(concat_ws(' ', dp.brand, dp.name))) AS full_label
    FROM scope_teams st
    JOIN org_gear.drone_parts dp
      ON dp.team_id = st.team_id
    WHERE lower(COALESCE(dp.status, '')) = 'broken'
      AND COALESCE(dp.name, '') <> ''
  ),

  -- ---- 3. Event groups per (team, bucket, component) ---------------------
  report_groups AS (
    SELECT
      dr.team_id,
      dr.team_name,
      dr.bucket,
      dr.part_label        AS label,
      count(*)             AS reports,
      COALESCE(sum(dr.cost), 0) AS cost,
      bool_or(public.org_is_crash_reason(dr.reason_lc)) AS has_crash_reason
    FROM deduped_reports dr
    GROUP BY dr.team_id, dr.team_name, dr.bucket, dr.part_label
  ),

  broken_groups AS (
    SELECT
      b.team_id,
      b.team_name,
      b.bucket,
      COALESCE(
        (SELECT rg.label
           FROM report_groups rg
          WHERE rg.team_id = b.team_id
            AND rg.bucket = b.bucket
            AND (lower(rg.label) = b.part_label
                 OR lower(rg.label) = b.full_label)
          ORDER BY rg.reports DESC
          LIMIT 1),
        b.part_label
      ) AS label,
      count(*) AS broken
    FROM broken b
    GROUP BY b.team_id, b.team_name, b.bucket, 4
  ),

  event_groups AS (
    SELECT
      COALESCE(rg.team_id, bg.team_id)     AS team_id,
      COALESCE(rg.team_name, bg.team_name) AS team_name,
      COALESCE(rg.bucket, bg.bucket)       AS bucket,
      COALESCE(rg.label, bg.label)         AS label,
      COALESCE(rg.reports, 0)              AS reports,
      COALESCE(bg.broken, 0)               AS broken_parts,
      COALESCE(rg.cost, 0)                 AS cost,
      COALESCE(rg.has_crash_reason, false) AS has_crash_reason
    FROM report_groups rg
    FULL JOIN broken_groups bg
      ON  bg.team_id  = rg.team_id
      AND bg.bucket   = rg.bucket
      AND bg.label    = rg.label
  )

  -- ---- 4. Final rows: one per (team, bucket, component) group ------------
  SELECT
    eg.team_id,
    eg.team_name,
    eg.bucket,
    eg.label,
    eg.reports::integer,
    eg.broken_parts::integer,
    GREATEST(eg.reports, eg.broken_parts)::integer AS events,
    eg.cost::numeric,
    eg.has_crash_reason AS is_crash,
    -- Fleet context per team (never attached to individual component rows):
    -- total airtime and logged crash count for MTBF math on the client.
    COALESCE(d.total_minutes, 0)::bigint AS fleet_minutes,
    COALESCE(d.crash_total, 0)::bigint   AS drone_crashes
  FROM event_groups eg
  LEFT JOIN LATERAL (
    SELECT
      SUM(d.total_minutes) AS total_minutes,
      SUM(d.crash_count)   AS crash_total
    FROM org_gear.drones d
    WHERE d.team_id = eg.team_id
  ) d ON true
  ORDER BY eg.team_name, eg.bucket, events DESC, eg.label;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Grants: authenticated only (RLS does the rest). Helpers are callable
--    by authenticated (the invoker-RPC runs them as the caller) but not by
--    anon.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.parse_failure_head(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.parse_failure_head(text) TO authenticated;

REVOKE ALL ON FUNCTION public.org_part_bucket(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.org_part_bucket(text) TO authenticated;

REVOKE ALL ON FUNCTION public.org_is_crash_reason(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.org_is_crash_reason(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_org_failure_analytics(uuid)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_org_failure_analytics(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.check_enterprise_access() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.check_enterprise_access() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
