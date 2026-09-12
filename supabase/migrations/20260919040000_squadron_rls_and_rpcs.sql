-- ============================================================
-- Migration: Squadrons — RLS completion + RPC layer
--
-- Completes the squadron (team) backend:
--   1. RLS: the three team tables had SELECT/INSERT only. Adds UPDATE and
--      DELETE policies so owners can rename/dissolve, manage roles, and
--      revoke invite codes without service-role access.
--   2. create_squadron(_name, _description): the missing atomic create RPC
--      (team + owner membership in one statement) — replaces the broken
--      client-side upsert dance.
--   3. join_team_with_code: hardened (pinned search_path) and now returns
--      the TEAM ID (uuid) instead of a status string, so the client can
--      navigate to the joined squadron directly.
--   4. leave_squadron: hardened (pinned search_path).
--   5. get_squadron_overview(_team_id): roster with real display names +
--      per-pilot aggregate stats (sessions, hours, packs) via SECURITY
--      DEFINER — members can see each other's roll-ups, not raw rows.
--   6. get_squadron_ledger(_team_id): the enterprise cost ledger — runs the
--      personal cost-per-flight-hour ledger for every member and unions the
--      results with owner attribution. This is the team roll-up layer.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. RLS completion
-- ---------------------------------------------------------------------------
CREATE POLICY "Teams updatable by owner"
  ON public.teams FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Teams deletable by owner"
  ON public.teams FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "Team member roles updatable by team owner"
  ON public.team_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
       WHERE teams.id = team_members.team_id
         AND teams.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams
       WHERE teams.id = team_members.team_id
         AND teams.owner_id = auth.uid()
    )
  );

CREATE POLICY "Team members removable by self or team owner"
  ON public.team_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.teams
       WHERE teams.id = team_members.team_id
         AND teams.owner_id = auth.uid()
    )
  );

CREATE POLICY "Team invite codes revocable by team owner"
  ON public.team_invite_codes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
       WHERE teams.id = team_invite_codes.team_id
         AND teams.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. create_squadron — atomic team + owner membership
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_squadron(
  _name text,
  _description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_team_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _name := btrim(_name);
  IF _name IS NULL OR char_length(_name) < 2 OR char_length(_name) > 60 THEN
    RAISE EXCEPTION 'Squadron name must be between 2 and 60 characters';
  END IF;
  IF _description IS NOT NULL AND char_length(_description) > 200 THEN
    RAISE EXCEPTION 'Description must be 200 characters or fewer';
  END IF;

  INSERT INTO public.teams (name, description, owner_id)
  VALUES (_name, NULLIF(btrim(_description), ''), v_user_id)
  RETURNING id INTO v_team_id;

  -- The AFTER INSERT trigger on teams auto-generates the first invite code.

  INSERT INTO public.team_members (team_id, user_id, team_role)
  VALUES (v_team_id, v_user_id, 'owner');

  RETURN v_team_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. join_team_with_code — harden + return the team id
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.join_team_with_code(text);

CREATE FUNCTION public.join_team_with_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT team_id INTO v_team_id
  FROM public.team_invite_codes
  WHERE code = upper(btrim(_code)) AND expires_at > now();

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  -- Owners cannot re-join their own squadron via code (they are already in).
  IF EXISTS (
    SELECT 1 FROM public.teams
     WHERE id = v_team_id AND owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You already own this squadron';
  END IF;

  INSERT INTO public.team_members (team_id, user_id, team_role)
  VALUES (v_team_id, v_user_id, 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RETURN v_team_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. leave_squadron — harden
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_squadron(_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.teams
  WHERE id = _team_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Squadron not found.';
  END IF;

  IF v_owner_id = auth.uid() THEN
    RAISE EXCEPTION 'Squadron owners cannot leave their own squadron. Dissolve it instead.';
  END IF;

  DELETE FROM public.team_members
  WHERE team_id = _team_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a member of this squadron.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. get_squadron_overview — named roster + per-pilot roll-ups
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_squadron_overview(_team_id uuid)
RETURNS TABLE(
  member_id uuid,
  display_name text,
  callsign text,
  team_role text,
  joined_at timestamptz,
  session_count bigint,
  flight_minutes bigint,
  packs_flown bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH member_check AS (
    SELECT 1
    FROM public.team_members
    WHERE team_id = _team_id AND user_id = auth.uid()
  ),
  member_stats AS (
    SELECT
      s.user_id AS ms_user_id,
      COUNT(*) AS ms_sessions,
      SUM(s.duration_minutes) AS ms_minutes,
      SUM(CASE WHEN s.session_type = 'real' THEN s.packs_flown ELSE 0 END) AS ms_packs
    FROM public.sessions s
    WHERE s.user_id IN (
      SELECT user_id FROM public.team_members WHERE team_id = _team_id
    )
    GROUP BY s.user_id
  )
  SELECT
    tm.user_id,
    COALESCE(ps.callsign, 'Pilot ' || left(tm.user_id::text, 8)),
    ps.callsign,
    tm.team_role,
    tm.joined_at,
    COALESCE(st.ms_sessions, 0),
    COALESCE(st.ms_minutes, 0),
    COALESCE(st.ms_packs, 0)
  FROM public.team_members tm
  LEFT JOIN public.pilot_settings ps ON ps.user_id = tm.user_id
  LEFT JOIN member_stats st ON st.ms_user_id = tm.user_id
  WHERE tm.team_id = _team_id
    AND EXISTS (SELECT 1 FROM member_check)
  ORDER BY
    CASE tm.team_role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
    tm.joined_at;
$$;

-- ---------------------------------------------------------------------------
-- 6. get_squadron_ledger — the team roll-up cost ledger
--    Runs the personal ledger for each member and unions the results with
--    member attribution. SECURITY DEFINER so members see roll-ups, and
--    table-owner context bypasses member RLS inside the inner call.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_squadron_ledger(_team_id uuid)
RETURNS TABLE(
  member_id uuid,
  member_name text,
  gear_id uuid,
  gear_name text,
  gear_type text,
  part_category text,
  purchase_cost numeric,
  repair_cost numeric,
  total_cost numeric,
  flight_minutes bigint,
  flight_count bigint,
  packs_flown integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_member uuid;
  v_member_name text;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only squadron members may read the squadron ledger.
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this squadron';
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT tm.user_id AS m_id,
           COALESCE(ps.callsign, 'Pilot ' || left(tm.user_id::text, 8)) AS m_name
    FROM public.team_members tm
    LEFT JOIN public.pilot_settings ps ON ps.user_id = tm.user_id
    WHERE tm.team_id = _team_id
  )
  SELECT
    m.m_id,
    m.m_name,
    l.gear_id,
    l.gear_name,
    l.gear_type,
    l.part_category,
    l.purchase_cost,
    l.repair_cost,
    l.total_cost,
    l.flight_minutes,
    l.flight_count,
    l.packs_flown
  FROM members m
  CROSS JOIN LATERAL public.get_cost_per_flight_hour_ledger(m.m_id, NULL, NULL) l;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: RPCs for authenticated only
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_squadron(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_squadron(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.join_team_with_code(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.join_team_with_code(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_squadron_overview(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_squadron_overview(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_squadron_ledger(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_squadron_ledger(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.leave_squadron(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.leave_squadron(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.dissolve_squadron(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.dissolve_squadron(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_team_invite_code(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_team_invite_code(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
