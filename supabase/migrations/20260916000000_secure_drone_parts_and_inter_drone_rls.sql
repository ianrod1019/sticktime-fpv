-- ====================================================
-- Migration: Secure RLS policies for drone_parts and inter_drone tables
-- ====================================================

-- 1. Drop the permissive (open) policies created earlier
DROP POLICY IF EXISTS "drone_parts_select_policy" ON personal_gear.drone_parts;
DROP POLICY IF EXISTS "drone_parts_insert_policy" ON personal_gear.drone_parts;
DROP POLICY IF EXISTS "drone_parts_update_policy" ON personal_gear.drone_parts;
DROP POLICY IF EXISTS "drone_parts_delete_policy" ON personal_gear.drone_parts;

DROP POLICY IF EXISTS "inter_drone_select_policy" ON personal_gear.inter_drone;
DROP POLICY IF EXISTS "inter_drone_insert_policy" ON personal_gear.inter_drone;
DROP POLICY IF EXISTS "inter_drone_update_policy" ON personal_gear.inter_drone;
DROP POLICY IF EXISTS "inter_drone_delete_policy" ON personal_gear.inter_drone;

-- 2. Create secure RLS policies for drone_parts (scoped to user_id = auth.uid())
CREATE POLICY "drone_parts_select_policy" ON personal_gear.drone_parts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "drone_parts_insert_policy" ON personal_gear.drone_parts
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "drone_parts_update_policy" ON personal_gear.drone_parts
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "drone_parts_delete_policy" ON personal_gear.drone_parts
FOR DELETE USING (user_id = auth.uid());

-- 3. Create secure RLS policies for inter_drone
-- inter_drone has no user_id column; scope access via the related drone_parts record
CREATE POLICY "inter_drone_select_policy" ON personal_gear.inter_drone
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM personal_gear.drone_parts
    WHERE drone_parts.id = inter_drone.part_id
    AND drone_parts.user_id = auth.uid()
  )
);

CREATE POLICY "inter_drone_insert_policy" ON personal_gear.inter_drone
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM personal_gear.drone_parts
    WHERE drone_parts.id = inter_drone.part_id
    AND drone_parts.user_id = auth.uid()
  )
);

CREATE POLICY "inter_drone_update_policy" ON personal_gear.inter_drone
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM personal_gear.drone_parts
    WHERE drone_parts.id = inter_drone.part_id
    AND drone_parts.user_id = auth.uid()
  )
);

CREATE POLICY "inter_drone_delete_policy" ON personal_gear.inter_drone
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM personal_gear.drone_parts
    WHERE drone_parts.id = inter_drone.part_id
    AND drone_parts.user_id = auth.uid()
  )
);

-- ====================================================
-- End of migration
-- ====================================================