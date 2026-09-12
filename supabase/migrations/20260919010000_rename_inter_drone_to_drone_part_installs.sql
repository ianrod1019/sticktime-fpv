-- ====================================================
-- Migration: inter_drone → drone_part_installs (+ purchase ledger columns)
--
-- Audit findings addressed:
--   1. inter_drone.drone_id had NO foreign key → deleting a drone orphaned
--      assignment rows. The new table FKs to personal_gear.drones with
--      ON DELETE CASCADE.
--   2. inter_drone had no user_id → every RLS policy needed an EXISTS
--      subquery into drone_parts. The new table carries user_id directly,
--      so RLS is a simple equality and db_request's ownership injection
--      works for inserts/selects.
--   3. Uninstalls were hard DELETEs → no history. Installs are now ended
--      with uninstalled_at + removal_reason ('broken' = the part died),
--      keeping the timeline for the future cost ledger.
--   4. drone_parts had no purchase data → purchase_cost, purchase_date and
--      vendor columns added for the ledger.
--
-- Safe to re-run. Both source tables were empty at time of writing.
-- ====================================================

-- 1. Drop the old junction (its pro-gate triggers drop with it)
DROP TABLE IF EXISTS personal_gear.inter_drone CASCADE;

-- 2. Purchase ledger columns on drone_parts
ALTER TABLE personal_gear.drone_parts
  ADD COLUMN IF NOT EXISTS purchase_cost numeric,
  ADD COLUMN IF NOT EXISTS purchase_date timestamptz,
  ADD COLUMN IF NOT EXISTS vendor text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3. New junction table with proper integrity
CREATE TABLE IF NOT EXISTS personal_gear.drone_part_installs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    drone_id UUID NOT NULL REFERENCES personal_gear.drones(id) ON DELETE CASCADE,
    part_id UUID NOT NULL REFERENCES personal_gear.drone_parts(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uninstalled_at TIMESTAMPTZ,
    removal_reason TEXT CHECK (removal_reason IN
      ('broken', 'upgrade', 'maintenance', 'transfer', 'other')),
    notes TEXT
);

-- 4. RLS: simple owner equality (no EXISTS dance)
ALTER TABLE personal_gear.drone_part_installs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drone_part_installs_select_policy" ON personal_gear.drone_part_installs;
CREATE POLICY "drone_part_installs_select_policy" ON personal_gear.drone_part_installs
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "drone_part_installs_insert_policy" ON personal_gear.drone_part_installs;
CREATE POLICY "drone_part_installs_insert_policy" ON personal_gear.drone_part_installs
FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "drone_part_installs_update_policy" ON personal_gear.drone_part_installs;
CREATE POLICY "drone_part_installs_update_policy" ON personal_gear.drone_part_installs
FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "drone_part_installs_delete_policy" ON personal_gear.drone_part_installs;
CREATE POLICY "drone_part_installs_delete_policy" ON personal_gear.drone_part_installs
FOR DELETE USING (user_id = auth.uid());

-- 5. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON personal_gear.drone_part_installs TO authenticated;

-- 6. Pro-gate (ported from pro_gate_inter_drone, retargeted)
CREATE OR REPLACE FUNCTION personal_gear.assert_pro_for_part_installs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, personal_gear, auth
AS $$
DECLARE
  v_is_pro boolean;
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS NOT NULL AND LOWER(v_role) IN ('admin', 'dev') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_is_pro := public.check_pro_access();
  IF v_is_pro IS NOT TRUE THEN
    RAISE EXCEPTION
      'Airframe installs are a Pro-tier feature (operation % blocked)',
      TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS part_installs_pro_gate_insert
  ON personal_gear.drone_part_installs;
CREATE TRIGGER part_installs_pro_gate_insert
BEFORE INSERT ON personal_gear.drone_part_installs
FOR EACH ROW EXECUTE FUNCTION personal_gear.assert_pro_for_part_installs();

DROP TRIGGER IF EXISTS part_installs_pro_gate_update
  ON personal_gear.drone_part_installs;
CREATE TRIGGER part_installs_pro_gate_update
BEFORE UPDATE ON personal_gear.drone_part_installs
FOR EACH ROW EXECUTE FUNCTION personal_gear.assert_pro_for_part_installs();

DROP TRIGGER IF EXISTS part_installs_pro_gate_delete
  ON personal_gear.drone_part_installs;
CREATE TRIGGER part_installs_pro_gate_delete
BEFORE DELETE ON personal_gear.drone_part_installs
FOR EACH ROW EXECUTE FUNCTION personal_gear.assert_pro_for_part_installs();

-- 7. Keep drone_parts.status truthful automatically
CREATE OR REPLACE FUNCTION personal_gear.sync_part_status_on_install()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, personal_gear
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE personal_gear.drone_parts
    SET status = 'installed'
    WHERE id = NEW.part_id AND status = 'shelf';
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.uninstalled_at IS NOT NULL AND OLD.uninstalled_at IS NULL THEN
      UPDATE personal_gear.drone_parts
      SET status = CASE NEW.removal_reason
                     WHEN 'broken' THEN 'broken'
                     ELSE 'shelf'
                   END
      WHERE id = NEW.part_id AND status = 'installed'
        AND NOT EXISTS (
          SELECT 1 FROM personal_gear.drone_part_installs
          WHERE part_id = NEW.part_id AND uninstalled_at IS NULL
        );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE personal_gear.drone_parts
    SET status = 'shelf'
    WHERE id = OLD.part_id AND status = 'installed'
      AND NOT EXISTS (
        SELECT 1 FROM personal_gear.drone_part_installs
        WHERE part_id = OLD.part_id AND uninstalled_at IS NULL
      );
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger functions are never called via RPC — no public execute.
REVOKE EXECUTE ON FUNCTION personal_gear.assert_pro_for_part_installs()
  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION personal_gear.sync_part_status_on_install()
  FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS part_installs_status_insert
  ON personal_gear.drone_part_installs;
CREATE TRIGGER part_installs_status_insert
AFTER INSERT ON personal_gear.drone_part_installs
FOR EACH ROW EXECUTE FUNCTION personal_gear.sync_part_status_on_install();

DROP TRIGGER IF EXISTS part_installs_status_update
  ON personal_gear.drone_part_installs;
CREATE TRIGGER part_installs_status_update
AFTER UPDATE OF uninstalled_at ON personal_gear.drone_part_installs
FOR EACH ROW EXECUTE FUNCTION personal_gear.sync_part_status_on_install();

DROP TRIGGER IF EXISTS part_installs_status_delete
  ON personal_gear.drone_part_installs;
CREATE TRIGGER part_installs_status_delete
AFTER DELETE ON personal_gear.drone_part_installs
FOR EACH ROW EXECUTE FUNCTION personal_gear.sync_part_status_on_install();

-- 8. Maintain drone_parts.updated_at (extension lives outside public)
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;
DROP TRIGGER IF EXISTS drone_parts_touch_updated_at
  ON personal_gear.drone_parts;
CREATE TRIGGER drone_parts_touch_updated_at
BEFORE UPDATE ON personal_gear.drone_parts
FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_part_installs_drone_id
  ON personal_gear.drone_part_installs(drone_id);
CREATE INDEX IF NOT EXISTS idx_part_installs_part_id
  ON personal_gear.drone_part_installs(part_id);
CREATE INDEX IF NOT EXISTS idx_part_installs_user_id
  ON personal_gear.drone_part_installs(user_id);
CREATE INDEX IF NOT EXISTS idx_part_installs_open_by_part
  ON personal_gear.drone_part_installs(part_id)
  WHERE uninstalled_at IS NULL;

-- ====================================================
-- End of migration
-- ====================================================
