-- ============================================================
-- Migration: org_gear — squadron-owned gear schema + RLS + money locks
--
-- Mirrors personal_gear (the live table set) with two differences:
--   1. Every table carries team_id (FK public.teams ON DELETE CASCADE) —
--      the org owner. user_id stays as the actor/creator column.
--   2. Money fields (purchase_cost / purchase_date / vendor / current_value /
--      maintenance log cost) are LOCKED: only team owner/manager (or site
--      admin/dev) may set, change, or delete them. A plain member writing a
--      money value gets insufficient_privilege.
--
-- RLS model (per user decision):
--   - SELECT: every team member (read the whole org fleet).
--   - INSERT/UPDATE/DELETE: team members on non-money data; money-bearing
--     writes/deletes are gated by the enforce_money_locks trigger.
--   - anon/public: nothing.
--
-- Delta-sync readiness: every table has updated_at (moddatetime triggers),
-- so db_request sync:'delta' works against this schema unchanged.
--
-- 2026-09-24 consolidation: this schema is now the ONLY org-gear schema. The
-- old organization_gear schema (squadron_gear + checkouts) was merged in; see
-- 20260924000010_consolidate_org_gear_schema.sql.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS org_gear;

-- ---------------------------------------------------------------------------
-- Shared helpers (SECURITY DEFINER, pinned search_path)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org_gear.is_site_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(role) IN ('admin', 'dev')
  );
$$;

CREATE OR REPLACE FUNCTION org_gear.team_role(_team_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.team_role
  FROM public.team_members tm
  WHERE tm.team_id = _team_id AND tm.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION org_gear.is_team_member(_team_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT org_gear.team_role(_team_id) IS NOT NULL OR org_gear.is_site_admin();
$$;

CREATE OR REPLACE FUNCTION org_gear.team_has_money_access(_team_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, org_gear
AS $$
  SELECT COALESCE(org_gear.team_role(_team_id) IN ('owner', 'manager'), false)
    OR org_gear.is_site_admin();
$$;

-- Money-bearing columns per table (drives the lock trigger).
CREATE OR REPLACE FUNCTION org_gear.money_columns(p_table text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = org_gear
AS $$
  SELECT CASE p_table
    WHEN 'drones'           THEN ARRAY['purchase_cost']
    WHEN 'batteries'        THEN ARRAY['purchase_cost']
    WHEN 'transmitters'     THEN ARRAY['purchase_cost', 'purchase_date', 'current_value']
    WHEN 'goggles'          THEN ARRAY['purchase_cost']
    WHEN 'other_gear'       THEN ARRAY['purchase_cost', 'purchase_date', 'current_value']
    WHEN 'drone_parts'      THEN ARRAY['purchase_cost', 'purchase_date', 'vendor']
    WHEN 'maintenance_logs' THEN ARRAY['cost']
    ELSE ARRAY[]::text[]
  END;
$$;

-- ---------------------------------------------------------------------------
-- Money-lock trigger: members may write non-money data; money fields are
-- owner/manager only. Zero-valued money columns on INSERT are tolerated
-- (they carry no financial information).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION org_gear.enforce_money_locks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = org_gear, public
AS $$
DECLARE
  v_team uuid;
  v_cols text[];
  v_col text;
  v_old text;
  v_new text;
  v_i int;
BEGIN
  v_team := CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'team_id')::uuid
                 ELSE (to_jsonb(NEW) ->> 'team_id')::uuid END;

  IF org_gear.team_has_money_access(v_team) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF array_length(org_gear.money_columns(TG_TABLE_NAME), 1) > 0 THEN
      RAISE EXCEPTION
        'Money-locked: removing financial records requires the squadron owner or a manager'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  v_cols := org_gear.money_columns(TG_TABLE_NAME);
  FOR v_i IN 1..COALESCE(array_length(v_cols, 1), 0) LOOP
    v_col := v_cols[v_i];
    v_new := to_jsonb(NEW) ->> v_col;
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ->> v_col END;
    CONTINUE WHEN v_new IS NOT DISTINCT FROM v_old;
    -- INSERT of a zero/empty money value carries no money information.
    IF TG_OP = 'INSERT' AND (v_new IS NULL OR v_new ~ '^0+(\.0*)?$') THEN
      CONTINUE;
    END IF;
    RAISE EXCEPTION
      'Money-locked: % on % requires the squadron owner or a manager',
      v_col, TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables (column parity with the live personal_gear tables + team_id)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS org_gear.drones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  service_interval_minutes integer NOT NULL DEFAULT 600,
  minutes_since_service integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  pack_count integer NOT NULL DEFAULT 0,
  crash_count integer NOT NULL DEFAULT 0,
  cells integer NOT NULL DEFAULT 6,
  connector_type text NOT NULL DEFAULT 'XT60',
  purchase_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_service_notes text,
  retired boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS org_gear.batteries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  pack_count integer NOT NULL DEFAULT 0,
  crash_count integer NOT NULL DEFAULT 0,
  cells integer NOT NULL DEFAULT 6,
  connector_type text NOT NULL DEFAULT 'XT60',
  purchase_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  service_interval_minutes integer NOT NULL DEFAULT 0,
  minutes_since_service integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  last_service_notes text,
  storage_voltage_per_cell numeric,
  full_voltage_per_cell numeric,
  empty_voltage_per_cell numeric,
  packs_flown_total integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS org_gear.transmitters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  service_interval_minutes integer NOT NULL DEFAULT 600,
  minutes_since_service integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  purchase_cost numeric NOT NULL DEFAULT 0,
  purchase_date timestamptz,
  current_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_service_notes text
);

CREATE TABLE IF NOT EXISTS org_gear.goggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  service_interval_minutes integer NOT NULL DEFAULT 600,
  minutes_since_service integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  purchase_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cells integer NOT NULL DEFAULT 0,
  last_service_notes text
);

CREATE TABLE IF NOT EXISTS org_gear.other_gear (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  service_interval_minutes integer NOT NULL DEFAULT 600,
  minutes_since_service integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  pack_count integer NOT NULL DEFAULT 0,
  crash_count integer NOT NULL DEFAULT 0,
  cells integer NOT NULL DEFAULT 0,
  connector_type text NOT NULL DEFAULT '',
  purchase_cost numeric NOT NULL DEFAULT 0,
  purchase_date timestamptz,
  current_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_service_notes text
);

CREATE TABLE IF NOT EXISTS org_gear.drone_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  brand text,
  status text DEFAULT 'shelf',
  specs jsonb DEFAULT '{}'::jsonb,
  purchase_cost numeric,
  purchase_date timestamptz,
  vendor text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_gear.drone_part_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  drone_id uuid NOT NULL REFERENCES org_gear.drones(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES org_gear.drone_parts(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  installed_at timestamptz NOT NULL DEFAULT now(),
  uninstalled_at timestamptz,
  removal_reason text CHECK (removal_reason IN
    ('broken', 'upgrade', 'maintenance', 'transfer', 'other')),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_gear.transmitter_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL REFERENCES org_gear.transmitters(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  brand text,
  model text,
  lifespan_minutes integer NOT NULL DEFAULT 0,
  minutes_used integer NOT NULL DEFAULT 0,
  spare_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_gear.goggles_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL REFERENCES org_gear.goggles(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  brand text,
  model text,
  lifespan_minutes integer NOT NULL DEFAULT 0,
  minutes_used integer NOT NULL DEFAULT 0,
  spare_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_gear.other_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL REFERENCES org_gear.other_gear(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  brand text,
  model text,
  lifespan_minutes integer NOT NULL DEFAULT 600,
  minutes_used integer NOT NULL DEFAULT 0,
  spare_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_gear.maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL,
  description text NOT NULL,
  cost numeric NOT NULL DEFAULT 0,
  reset_service_clock boolean NOT NULL DEFAULT true,
  performed_on timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS: members read + write non-money data; money is trigger-gated
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'drones', 'batteries', 'transmitters', 'goggles', 'other_gear',
    'drone_parts', 'drone_part_installs', 'transmitter_parts',
    'goggles_parts', 'other_parts', 'maintenance_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE org_gear.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS org_member_select ON org_gear.%I', t);
    EXECUTE format($f$
      CREATE POLICY org_member_select ON org_gear.%I
      FOR SELECT USING (org_gear.is_team_member(team_id))
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS org_member_insert ON org_gear.%I', t);
    EXECUTE format($f$
      CREATE POLICY org_member_insert ON org_gear.%I
      FOR INSERT WITH CHECK (org_gear.is_team_member(team_id))
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS org_member_update ON org_gear.%I', t);
    EXECUTE format($f$
      CREATE POLICY org_member_update ON org_gear.%I
      FOR UPDATE USING (org_gear.is_team_member(team_id))
      WITH CHECK (org_gear.is_team_member(team_id))
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS org_member_delete ON org_gear.%I', t);
    EXECUTE format($f$
      CREATE POLICY org_member_delete ON org_gear.%I
      FOR DELETE USING (org_gear.is_team_member(team_id))
    $f$, t);

    -- Money lock fires on money-bearing tables (INSERT/UPDATE/DELETE).
    IF array_length(org_gear.money_columns(t), 1) > 0 THEN
      EXECUTE format('DROP TRIGGER IF EXISTS money_lock ON org_gear.%I', t);
      EXECUTE format($f$
        CREATE TRIGGER money_lock
        BEFORE INSERT OR UPDATE OR DELETE ON org_gear.%I
        FOR EACH ROW EXECUTE FUNCTION org_gear.enforce_money_locks()
      $f$, t);
    END IF;

    -- Keep updated_at truthful for the delta-sync watermark.
    EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON org_gear.%I', t);
    EXECUTE format($f$
      CREATE TRIGGER touch_updated_at
      BEFORE UPDATE ON org_gear.%I
      FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at)
    $f$, t);

    -- Grants: authenticated only.
    EXECUTE format('REVOKE ALL ON org_gear.%I FROM anon, public', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON org_gear.%I TO authenticated', t);

    -- Indexes: team listing + delta-sync watermark scans.
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON org_gear.%I (team_id)',
                   'idx_org_' || t || '_team', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON org_gear.%I (team_id, updated_at)',
                   'idx_org_' || t || '_team_updated', t);
  END LOOP;

  -- Child-table lookup indexes (mirror personal_gear).
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_installs_drone ON org_gear.drone_part_installs (drone_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_installs_part ON org_gear.drone_part_installs (part_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_tx_parts_gear ON org_gear.transmitter_parts (gear_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_goggle_parts_gear ON org_gear.goggles_parts (gear_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_other_parts_gear ON org_gear.other_parts (gear_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_logs_gear ON org_gear.maintenance_logs (gear_id)';
END;
$$;

GRANT USAGE ON SCHEMA org_gear TO authenticated;
REVOKE ALL ON SCHEMA org_gear FROM anon, public;

-- Helpers are policy/RPC internals — never callable directly.
REVOKE ALL ON FUNCTION org_gear.is_site_admin() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION org_gear.team_role(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION org_gear.is_team_member(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION org_gear.team_has_money_access(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION org_gear.money_columns(text) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION org_gear.enforce_money_locks() FROM anon, authenticated, public;

-- ============================================================
-- End of migration
-- ============================================================
