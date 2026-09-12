-- ====================================================
-- Migration: Pro-tier gating for relational inventory
--
-- Client-side gating is never enough: this adds database-level
-- enforcement so free users cannot write to personal_gear.inter_drone
-- (part-to-airframe assignment) even with a hand-crafted request.
--
-- drone_parts (basic cataloging) stays writable for everyone;
-- inter_drone writes require check_pro_access() OR an admin role.
-- Reads stay open (RLS already scopes rows to the owning user).
-- ====================================================

CREATE OR REPLACE FUNCTION personal_gear.assert_pro_for_inter_drone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, personal_gear, auth
AS $$
DECLARE
  v_is_pro boolean;
  v_role text;
BEGIN
  -- Admins/devs bypass the paywall.
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS NOT NULL AND LOWER(v_role) IN ('admin', 'dev') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_is_pro := public.check_pro_access();
  IF v_is_pro IS NOT TRUE THEN
    RAISE EXCEPTION
      'Part-to-airframe assignment is a Pro-tier feature (operation % blocked)',
      TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS inter_drone_pro_gate_insert
  ON personal_gear.inter_drone;
CREATE TRIGGER inter_drone_pro_gate_insert
BEFORE INSERT ON personal_gear.inter_drone
FOR EACH ROW EXECUTE FUNCTION personal_gear.assert_pro_for_inter_drone();

DROP TRIGGER IF EXISTS inter_drone_pro_gate_update
  ON personal_gear.inter_drone;
CREATE TRIGGER inter_drone_pro_gate_update
BEFORE UPDATE ON personal_gear.inter_drone
FOR EACH ROW EXECUTE FUNCTION personal_gear.assert_pro_for_inter_drone();

DROP TRIGGER IF EXISTS inter_drone_pro_gate_delete
  ON personal_gear.inter_drone;
CREATE TRIGGER inter_drone_pro_gate_delete
BEFORE DELETE ON personal_gear.inter_drone
FOR EACH ROW EXECUTE FUNCTION personal_gear.assert_pro_for_inter_drone();

-- ====================================================
-- End of migration
-- ====================================================
