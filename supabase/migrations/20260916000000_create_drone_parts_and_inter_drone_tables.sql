-- ====================================================
-- Migration: Create drone_parts and inter_drone tables in personal_gear schema
-- ==================================================--

-- 1. Ensure personal_gear schema exists
CREATE SCHEMA IF NOT EXISTS personal_gear;

-- 2. Drop conflicting/old versions of tables if they exist
-- Drop inter_drone first (depends on drone_parts), then drone_parts
DROP TABLE IF EXISTS personal_gear.inter_drone CASCADE;
DROP TABLE IF EXISTS personal_gear.drone_parts CASCADE;

-- 3. Create drone_parts (Master Inventory Table)
-- Holds every individual physical hardware component owned
CREATE TABLE personal_gear.drone_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    status TEXT DEFAULT 'shelf',
    specs JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create inter_drone (Junction Table)
-- Maps parts to specific drone airframes
CREATE TABLE personal_gear.inter_drone (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drone_id UUID NOT NULL,
    part_id UUID NOT NULL REFERENCES personal_gear.drone_parts(id) ON DELETE CASCADE,
    quantity INT DEFAULT 1,
    installed_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Enable Row Level Security on both tables
ALTER TABLE personal_gear.drone_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.inter_drone ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for drone_parts
CREATE POLICY "drone_parts_select_policy" ON personal_gear.drone_parts
FOR SELECT USING (true);

CREATE POLICY "drone_parts_insert_policy" ON personal_gear.drone_parts
FOR INSERT WITH CHECK (true);

CREATE POLICY "drone_parts_update_policy" ON personal_gear.drone_parts
FOR UPDATE USING (true);

CREATE POLICY "drone_parts_delete_policy" ON personal_gear.drone_parts
FOR DELETE USING (true);

-- 7. Create RLS policies for inter_drone
CREATE POLICY "inter_drone_select_policy" ON personal_gear.inter_drone
FOR SELECT USING (true);

CREATE POLICY "inter_drone_insert_policy" ON personal_gear.inter_drone
FOR INSERT WITH CHECK (true);

CREATE POLICY "inter_drone_update_policy" ON personal_gear.inter_drone
FOR UPDATE USING (true);

CREATE POLICY "inter_drone_delete_policy" ON personal_gear.inter_drone
FOR DELETE USING (true);

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_personal_gear_drone_parts_user_id ON personal_gear.drone_parts(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_drone_parts_category ON personal_gear.drone_parts(category);
CREATE INDEX IF NOT EXISTS idx_personal_gear_drone_parts_status ON personal_gear.drone_parts(status);
CREATE INDEX IF NOT EXISTS idx_personal_gear_inter_drone_part_id ON personal_gear.inter_drone(part_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_inter_drone_drone_id ON personal_gear.inter_drone(drone_id);

-- ====================================================
-- End of migration
-- ====================================================