-- ============================================================
-- Migration: Repair path — fold organization_gear into org_gear
--
-- org_gear is the SINGLE schema for all organization-backend gear data.
-- Fresh databases never see `organization_gear`: 20260920000000 now creates
-- the squadron checkout tables directly in org_gear, and the former
-- 20260920010000 move-to-organization_gear migration has been deleted.
--
-- This migration exists ONLY to repair databases that already ran the old
-- sequence (tables in public or organization_gear). Every step is a no-op
-- on databases where the tables already live in org_gear:
--   1. squadron_gear / squadron_gear_checkouts move to org_gear if found
--      in public or organization_gear (policies, grants, FKs travel).
--   2. The six squadron RPCs are (re)created against org_gear.
--   3. get_org_gear_watermark covers the two checkout tables.
--   4. Both tables join the supabase_realtime publication.
--   5. organization_gear is dropped if it still exists.
--
-- Data model note: squadron_gear keeps its checkout state columns
-- (status / checked_out_by / checked_out_at). Folding its rows into the
-- richer per-type org_gear tables (drones, other_gear, ...) would drop that
-- state, so rows stay put; a later migration can migrate per-type once the
-- unified org gear screens exist.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS org_gear;
GRANT USAGE ON SCHEMA org_gear TO authenticated;
REVOKE ALL ON SCHEMA org_gear FROM anon, public;

-- ---------------------------------------------------------------------------
-- 1. Move the checkout tables into org_gear (policies/grants/FKs travel).
--    Handles every historical location: public (pre-20260920010000),
--    organization_gear (20260920010000), or already org_gear (re-run).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  src text;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['squadron_gear', 'squadron_gear_checkouts'] LOOP
    SELECT schemaname INTO src
    FROM pg_tables
    WHERE tablename = t
      AND schemaname IN ('public', 'organization_gear')
    LIMIT 1;

    IF src IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I SET SCHEMA org_gear', src, t);
    END IF;
    -- src IS NULL => already in org_gear (or brand-new database where the
    -- table never existed; nothing to move).
  END LOOP;
END;
$$;

-- Databases that ran the ORIGINAL 20260920000000 lack created_at / updated_at
-- on the checkout tables (and possibly squadron_gear); the rewritten migration
-- defines both. Converge before the moddatetime trigger and the watermark
-- expect those columns.
ALTER TABLE org_gear.squadron_gear
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE org_gear.squadron_gear
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE org_gear.squadron_gear_checkouts
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE org_gear.squadron_gear_checkouts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Re-state table grants (idempotent; matches 20260920000000's intent).
REVOKE ALL ON org_gear.squadron_gear FROM anon;
REVOKE ALL ON org_gear.squadron_gear_checkouts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON org_gear.squadron_gear TO authenticated;
GRANT SELECT, INSERT, UPDATE ON org_gear.squadron_gear_checkouts TO authenticated;

-- Indexes (IF NOT EXISTS: keep names aligned with the org_gear convention).
CREATE INDEX IF NOT EXISTS idx_org_squadron_gear_team
  ON org_gear.squadron_gear(team_id);
CREATE INDEX IF NOT EXISTS idx_org_squadron_gear_team_status
  ON org_gear.squadron_gear(team_id, status);
CREATE INDEX IF NOT EXISTS idx_org_squadron_gear_team_updated
  ON org_gear.squadron_gear(team_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_org_squadron_checkouts_gear_id
  ON org_gear.squadron_gear_checkouts(gear_id);
CREATE INDEX IF NOT EXISTS idx_org_squadron_checkouts_team_time
  ON org_gear.squadron_gear_checkouts(team_id, checked_out_at DESC);

-- The moved table's legacy updated_at trigger (personal_gear function) is
-- superseded by the moddatetime trigger used across org_gear.
DROP TRIGGER IF EXISTS update_squadron_gear_updated_at ON org_gear.squadron_gear;
DROP TRIGGER IF EXISTS touch_updated_at ON org_gear.squadron_gear;
CREATE TRIGGER touch_updated_at
BEFORE UPDATE ON org_gear.squadron_gear
FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);
DROP TRIGGER IF EXISTS touch_updated_at ON org_gear.squadron_gear_checkouts;
CREATE TRIGGER touch_updated_at
BEFORE UPDATE ON org_gear.squadron_gear_checkouts
FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 2. RPCs — recreated against org_gear (same signatures and grants, so the
--    client keeps calling the exact same public.* functions).
-- ---------------------------------------------------------------------------

-- Gear list for a squadron hanger, with borrower callsign attached.
CREATE OR REPLACE FUNCTION public.get_squadron_gear(_team_id uuid)
RETURNS TABLE(
  id uuid,
  team_id uuid,
  gear_type text,
  name text,
  brand text,
  notes text,
  purchase_cost numeric,
  status text,
  checked_out_by uuid,
  checked_out_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  borrower_callsign text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT
    g.id,
    g.team_id,
    g.gear_type,
    g.name,
    g.brand,
    g.notes,
    g.purchase_cost,
    g.status,
    g.checked_out_by,
    g.checked_out_at,
    g.created_by,
    g.created_at,
    g.updated_at,
    ps.callsign
  FROM org_gear.squadron_gear g
  LEFT JOIN public.pilot_settings ps ON ps.user_id = g.checked_out_by
  WHERE g.team_id = _team_id
    AND public.is_team_member(_team_id, auth.uid())
  ORDER BY g.created_at;
$$;

-- Checkout history for the log panel, newest first.
CREATE OR REPLACE FUNCTION public.get_squadron_gear_checkouts(_team_id uuid)
RETURNS TABLE(
  id uuid,
  gear_id uuid,
  gear_name text,
  checked_out_by uuid,
  borrower_callsign text,
  checked_out_at timestamptz,
  returned_at timestamptz,
  condition_notes text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT
    c.id,
    c.gear_id,
    g.name AS gear_name,
    c.checked_out_by,
    ps.callsign,
    c.checked_out_at,
    c.returned_at,
    c.condition_notes
  FROM org_gear.squadron_gear_checkouts c
  JOIN org_gear.squadron_gear g ON g.id = c.gear_id
  LEFT JOIN public.pilot_settings ps ON ps.user_id = c.checked_out_by
  WHERE c.team_id = _team_id
    AND public.is_team_member(_team_id, auth.uid())
  ORDER BY c.checked_out_at DESC;
$$;

-- Atomic check-out: log row + status flip in one statement.
CREATE OR REPLACE FUNCTION public.checkout_squadron_gear(_gear_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
DECLARE
  v_team_id uuid;
  v_user uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT team_id INTO v_team_id
  FROM org_gear.squadron_gear
  WHERE id = _gear_id
  FOR UPDATE;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Gear not found';
  END IF;

  IF NOT public.is_team_member(v_team_id, v_user) THEN
    RAISE EXCEPTION 'Access denied: not a member of this squadron';
  END IF;

  UPDATE org_gear.squadron_gear
     SET status = 'checked_out',
         checked_out_by = v_user,
         checked_out_at = now()
   WHERE id = _gear_id
     AND status = 'available';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gear is not available (already checked out or in maintenance)';
  END IF;

  INSERT INTO org_gear.squadron_gear_checkouts (gear_id, team_id, checked_out_by)
  VALUES (_gear_id, v_team_id, v_user);
END;
$$;

-- Atomic return: close the open log row + clear the status in one statement.
CREATE OR REPLACE FUNCTION public.return_squadron_gear(
  _gear_id uuid,
  _condition_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
DECLARE
  v_team_id uuid;
  v_user uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT team_id INTO v_team_id
  FROM org_gear.squadron_gear
  WHERE id = _gear_id
  FOR UPDATE;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Gear not found';
  END IF;

  IF NOT public.is_team_member(v_team_id, v_user) THEN
    RAISE EXCEPTION 'Access denied: not a member of this squadron';
  END IF;

  UPDATE org_gear.squadron_gear_checkouts
     SET returned_at = now(),
         condition_notes = _condition_notes
   WHERE gear_id = _gear_id
     AND returned_at IS NULL
     AND (checked_out_by = v_user
          OR public.is_team_owner(v_team_id, v_user));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open checkout found for this gear';
  END IF;

  UPDATE org_gear.squadron_gear
     SET status = 'available',
         checked_out_by = NULL,
         checked_out_at = NULL
   WHERE id = _gear_id
     AND status = 'checked_out';
END;
$$;

-- Add shared gear. Returns the new row's id. Any member may contribute.
CREATE OR REPLACE FUNCTION public.create_squadron_gear(
  _team_id uuid,
  _gear_type text,
  _name text,
  _brand text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _purchase_cost numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
DECLARE
  v_user uuid;
  v_gear_id uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_team_member(_team_id, v_user) THEN
    RAISE EXCEPTION 'Access denied: not a member of this squadron';
  END IF;

  _name := btrim(_name);
  IF _name IS NULL OR char_length(_name) = 0 OR char_length(_name) > 120 THEN
    RAISE EXCEPTION 'Gear name must be between 1 and 120 characters';
  END IF;
  IF _gear_type NOT IN ('quad', 'battery', 'transmitter', 'goggles', 'other') THEN
    RAISE EXCEPTION 'Invalid gear type';
  END IF;
  IF _purchase_cost < 0 THEN
    RAISE EXCEPTION 'Purchase cost cannot be negative';
  END IF;

  INSERT INTO org_gear.squadron_gear (
    team_id, gear_type, name, brand, notes, purchase_cost,
    status, created_by
  ) VALUES (
    _team_id, _gear_type, _name, NULLIF(btrim(COALESCE(_brand, '')), ''),
    NULLIF(btrim(COALESCE(_notes, '')), ''), _purchase_cost,
    'available', v_user
  )
  RETURNING id INTO v_gear_id;

  RETURN v_gear_id;
END;
$$;

-- Remove shared gear (owner/manager only — mirrors the DELETE policy).
-- The checkout log rows cascade via FK.
CREATE OR REPLACE FUNCTION public.delete_squadron_gear(_gear_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
DECLARE
  v_team_id uuid;
  v_user uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT team_id INTO v_team_id
  FROM org_gear.squadron_gear
  WHERE id = _gear_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Gear not found';
  END IF;

  IF NOT (
    public.is_team_owner(v_team_id, v_user)
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = v_team_id
        AND tm.user_id = v_user
        AND tm.team_role = 'manager'
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: only squadron owners and managers can remove shared gear';
  END IF;

  DELETE FROM org_gear.squadron_gear WHERE id = _gear_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Watermark: cover the two checkout tables as well.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_org_gear_watermark(_team_id uuid)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = org_gear, public
AS $$
  SELECT NULLIF(
    GREATEST(
      (SELECT MAX(updated_at) FROM org_gear.drones WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.batteries WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.transmitters WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.goggles WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.other_gear WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.drone_parts WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.drone_part_installs WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.transmitter_parts WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.goggles_parts WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.other_parts WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.maintenance_logs WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.squadron_gear WHERE team_id = _team_id),
      (SELECT MAX(updated_at) FROM org_gear.squadron_gear_checkouts WHERE team_id = _team_id)
    ),
    '-infinity'::timestamptz
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants (unchanged signatures; re-stated after the re-creations)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_squadron_gear(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_squadron_gear(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_squadron_gear_checkouts(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_squadron_gear_checkouts(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.checkout_squadron_gear(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.checkout_squadron_gear(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.return_squadron_gear(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.return_squadron_gear(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_squadron_gear(uuid, text, text, text, text, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_squadron_gear(uuid, text, text, text, text, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_squadron_gear(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_squadron_gear(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_org_gear_watermark(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_org_gear_watermark(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime: the moved tables must reach subscribers.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('org_gear', 'squadron_gear'),
      ('org_gear', 'squadron_gear_checkouts')
    ) AS v(schemaname, tablename)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname  = 'supabase_realtime'
        AND schemaname = t.schemaname
        AND tablename  = t.tablename
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
        t.schemaname, t.tablename
      );
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Retire the old schema. DROP SCHEMA ... RESTRICT fails loudly if any
--    object (e.g. an unexpected leftover table) still lives there — a safer
--    default than CASCADE for a migration.
-- ---------------------------------------------------------------------------
DROP SCHEMA IF EXISTS organization_gear RESTRICT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
