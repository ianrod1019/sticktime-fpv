-- ============================================================
-- Migration: Squadron Hangers — shared gear + checkout log
--
-- Gives every squadron (team) its own shared gear hanger, inside the
-- `org_gear` schema — the single home for ALL organization-backend gear
-- data (per-type fleet tables from 20260921*, checkout hanger here).
-- Squadron gear deliberately shares the org-gear trust domain: it is team
-- data, not app-public data and not the creating pilot's personal data.
--
--   1. org_gear.squadron_gear — team-owned equipment any member can browse,
--      add to, and check out.
--   2. org_gear.squadron_gear_checkouts — the "logged out to use" log: one
--      row per borrow, closed by setting returned_at. History is append-only.
--   3. RLS: SELECT/INSERT for team members; UPDATE for members (status
--      transitions flow through RPCs); DELETE reserved for owner/manager.
--      is_team_member()/is_team_owner() are SECURITY DEFINER so policies
--      can't leak other squads' rows.
--   4. RPCs: checkout_squadron_gear / return_squadron_gear are atomic —
--      log row + status flip commit together so the badge and the log can
--      never disagree. create_/delete_squadron_gear gate contributions and
--      removals. Read helpers join pilot_settings for callsigns.
--
-- 2026-09-24: originally these tables were created in public and then moved
-- through an `organization_gear` schema; that schema has been retired and
-- this migration now targets org_gear directly. 20260924000010 keeps the
-- repair path for databases that ran the old sequence.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS org_gear;
GRANT USAGE ON SCHEMA org_gear TO authenticated;
REVOKE ALL ON SCHEMA org_gear FROM anon, public;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_gear.squadron_gear (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  gear_type text NOT NULL
    CHECK (gear_type IN ('quad', 'battery', 'transmitter', 'goggles', 'other')),
  name text NOT NULL,
  brand text,
  notes text,
  purchase_cost numeric(10, 2) NOT NULL DEFAULT 0
    CHECK (purchase_cost >= 0),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'checked_out', 'maintenance')),
  checked_out_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_out_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_gear.squadron_gear_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_id uuid NOT NULL REFERENCES org_gear.squadron_gear(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  checked_out_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checked_out_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  condition_notes text
);

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

-- Keep updated_at truthful for the delta-sync watermark (same trigger as
-- the rest of org_gear).
DROP TRIGGER IF EXISTS touch_updated_at ON org_gear.squadron_gear;
CREATE TRIGGER touch_updated_at
BEFORE UPDATE ON org_gear.squadron_gear
FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

DROP TRIGGER IF EXISTS touch_updated_at ON org_gear.squadron_gear_checkouts;
CREATE TRIGGER touch_updated_at
BEFORE UPDATE ON org_gear.squadron_gear_checkouts
FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE org_gear.squadron_gear ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_gear.squadron_gear_checkouts ENABLE ROW LEVEL SECURITY;

-- Members can see the squad hanger's gear.
CREATE POLICY "Squadron gear viewable by team members"
  ON org_gear.squadron_gear FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id, auth.uid()));

-- Any member can contribute shared gear to the squad hanger.
CREATE POLICY "Squadron gear insertable by team members"
  ON org_gear.squadron_gear FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_team_member(team_id, auth.uid())
    AND (created_by = auth.uid() OR created_by IS NULL)
  );

-- Members may update rows (check-out/return RPCs run as invoker); the check
-- below keeps borrowers from editing other fields of a checked-out item and
-- stops anyone from putting gear into a checked_out state directly.
CREATE POLICY "Squadron gear updatable by team members"
  ON org_gear.squadron_gear FOR UPDATE
  TO authenticated
  USING (public.is_team_member(team_id, auth.uid()))
  WITH CHECK (
    public.is_team_member(team_id, auth.uid())
    AND (status <> 'checked_out' OR checked_out_by = auth.uid())
  );

-- Only owner or manager may remove shared gear. (Owner via is_team_owner;
-- manager via the team_members role read, which members can do.)
CREATE POLICY "Squadron gear deletable by owner or manager"
  ON org_gear.squadron_gear FOR DELETE
  TO authenticated
  USING (
    public.is_team_owner(team_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = squadron_gear.team_id
        AND tm.user_id = auth.uid()
        AND tm.team_role = 'manager'
    )
  );

CREATE POLICY "Squadron checkouts viewable by team members"
  ON org_gear.squadron_gear_checkouts FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id, auth.uid()));

CREATE POLICY "Squadron checkouts insertable by team members"
  ON org_gear.squadron_gear_checkouts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_team_member(team_id, auth.uid())
    AND checked_out_by = auth.uid()
  );

-- A borrower can close (return) their own open checkout; owner/manager can
-- force-close any (e.g. gear came back while borrower is away).
CREATE POLICY "Squadron checkouts returnable by borrower or owner"
  ON org_gear.squadron_gear_checkouts FOR UPDATE
  TO authenticated
  USING (
    checked_out_by = auth.uid()
    OR public.is_team_owner(team_id, auth.uid())
  )
  WITH CHECK (
    checked_out_by = auth.uid()
    OR public.is_team_owner(team_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. RPCs — reads (callsign-enriched), atomic status transitions, and the
--    write helpers. All SECURITY DEFINER, membership-checked, search_path
--    pinned to public + org_gear.
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
-- 4. Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON org_gear.squadron_gear FROM anon;
REVOKE ALL ON org_gear.squadron_gear_checkouts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON org_gear.squadron_gear TO authenticated;
GRANT SELECT, INSERT, UPDATE ON org_gear.squadron_gear_checkouts TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_squadron_gear(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_squadron_gear(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_squadron_gear_checkouts(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_squadron_gear_checkouts(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.checkout_squadron_gear(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.checkout_squadron_gear(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.return_squadron_gear(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.return_squadron_gear(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_squadron_gear(uuid, text, text, text, text, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_squadron_gear(uuid, text, text, text, text, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_squadron_gear(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_squadron_gear(uuid) FROM anon, public;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
