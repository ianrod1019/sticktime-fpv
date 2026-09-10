-- ====================================================
-- Migration: Split gear tables into personal_gear schema
-- ====================================================

-- 1. Create personal_gear schema
CREATE SCHEMA IF NOT EXISTS personal_gear;

-- 2. Create all 5 gear type tables with identical structure to public tables
-- These will mirror the existing public.batteries, public.drones, etc.

CREATE TABLE IF NOT EXISTS personal_gear.batteries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  service_interval_minutes integer NOT NULL DEFAULT 0,
  minutes_since_service integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  pack_count integer NOT NULL DEFAULT 0,
  crash_count integer NOT NULL DEFAULT 0,
  cells integer NOT NULL DEFAULT 6,
  connector_type text NOT NULL DEFAULT 'XT60',
  purchase_cost numeric NOT NULL DEFAULT 0,
  purchase_date timestamp with time zone,
  current_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_gear.drones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  purchase_date timestamp with time zone,
  current_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_gear.transmitters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  purchase_date timestamp with time zone,
  current_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_gear.goggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  purchase_date timestamp with time zone,
  current_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_gear.other_gear (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  service_interval_minutes integer NOT NULL DEFAULT 600,
 600,
 600,
 600,
 6000,
 600,
 6000,
 6000,
 6000,
 600,
 600,
  purchase_cost numeric NOT NULL DEFAULT 0,
  purchase_date timestamp with time zone,
  current_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. Create split parts tables
CREATE TABLE IF NOT EXISTS personal_gear.battery_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'motor',
  lifespan_minutes integer NOT NULL DEFAULT 600,
  minutes_used integer NOT NULL DEFAULT 0,
  spare_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT battery_parts_gear_id_fkey FOREIGN KEY (gear_id) REFERENCES personal_gear.batteries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_gear.drone_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'motor',
 600,
  minutes_used integer NOT NULL DEFAULT 0,
  spare_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT drone_parts_gear_id_fkey FOREIGN KEY (gear_id) REFERENCES personal_gear.drones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_gear.transmitter_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  lifespan_minutes integer NOT NULL DEFAULT 0,
  minutes_used integer NOT NULL DEFAULT 0,
  spare_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT transmitter_parts_gear_id_fkey FOREIGN KEY (gear_id) REFERENCES personal_gear.transmitters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_gear.goggles_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  lifespan_minutes integer NOT NULL DEFAULT 0,
  minutes_used integer NOT NULL DEFAULT 0,
  spare_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT goggles_parts_gear_id_fkey FOREIGN KEY (gear_id) REFERENCES personal_gear.goggles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_gear.other_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  lifespan_minutes integer NOT NULL DEFAULT 600,
  minutes_used integer NOT NULL DEFAULT 0,
  spare_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT other_parts_gear_id_fkey FOREIGN KEY (gear_id) REFERENCES personal_gear.other_gear(id) ON DELETE CASCADE
);

-- 4. Create personal_gear.maintenance_logs
CREATE TABLE IF NOT EXISTS personal_gear.maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL,
  description text NOT NULL,
  cost numeric NOT NULL DEFAULT 0,
  reset_service_clock boolean NOT NULL DEFAULT true,
  performed_on timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 5. Migrate data from public to personal_gear tables
-- Migrate batteries
INSERT INTO personal_gear.batteries (
  id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
)
SELECT id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
FROM public.batteries
ON CONFLICT (id) DO NOTHING;

-- Migrate drones
INSERT INTO personal_gear.drones (
  id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
)
SELECT id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
FROM public.drones
ON CONFLICT (id) DO NOTHING;

-- Migrate transmitters
INSERT INTO personal_gear.transmitters (
  id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
)
SELECT id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
FROM public.transmitters
ON CONFLICT (id) DO NOTHING;

-- Migrate goggles
INSERT INTO personal_gear.goggles (
  id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
)
SELECT id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
FROM public.goggles
ON CONFLICT (id) DO NOTHING;

-- Migrate other_gear (existing rows)
INSERT INTO personal_gear.other_gear (
  id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
)
SELECT id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count,
  cells, connector_type, purchase_cost, purchase_date, current_value, created_at
FROM public.other_gear
ON CONFLICT (id) DO NOTHING;

-- Migrate gear_parts to appropriate parts tables based on gear_type
-- After copying gear data, only check personal_gear tables to avoid duplicate matches
-- Battery parts (gear_type = 'battery')
INSERT INTO personal_gear.battery_parts (
  id, user_id, gear_id, name, category, lifespan_minutes,
  minutes_used, spare_count, created_at
)
SELECT gp.id, gp.user_id, gp.gear_id, gp.name, gp.category, gp.lifespan_minutes,
  gp.minutes_used, gp.spare_count, gp.created_at
FROM public.gear_parts gp
JOIN personal_gear.batteries b ON gp.gear_id = b.id
ON CONFLICT (id) DO NOTHING;

-- Drone parts (gear_type = 'quad')
INSERT INTO personal_gear.drone_parts (
  id, user_id, gear_id, name, category, lifespan_minutes,
  minutes_used, spare_count, created_at
)
SELECT gp.id, gp.user_id, gp.gear_id, gp.name, gp.category, gp.lifespan_minutes,
  gp.minutes_used, gp.spare_count, gp.created_at
FROM public.gear_parts gp
JOIN personal_gear.drones d ON gp.gear_id = d.id
ON CONFLICT (id) DO NOTHING;

-- Transmitter parts (gear_type = 'transmitter')
INSERT INTO personal_gear.transmitter_parts (
  id, user_id, gear_id, name, category, lifespan_minutes,
  minutes_used, spare_count, created_at
)
SELECT gp.id, gp.user_id, gp.gear_id, gp.name, gp.category, gp.lifespan_minutes,
  gp.minutes_used, gp.spare_count, gp.created_at
FROM public.gear_parts gp
JOIN personal_gear.transmitters t ON gp.gear_id = t.id
ON CONFLICT (id) DO NOTHING;

-- Goggles parts (gear_type = 'goggles')
INSERT INTO personal_gear.goggles_parts (
  id, user_id, gear_id, name, category, lifespan_minutes,
  minutes_used, spare_count, created_at
)
SELECT gp.id, gp.user_id, gp.gear_id, gp.name, gp.category, gp.lifespan_minutes,
  gp.minutes_used, gp.spare_count, gp.created_at
FROM public.gear_parts gp
JOIN personal_gear.goggles g ON gp.gear_id = g.id
ON CONFLICT (id) DO NOTHING;

-- Other parts (gear_type = 'other')
INSERT INTO personal_gear.other_parts (
  id, user_id, gear_id, name, category, lifespan_minutes,
  minutes_used, spare_count, created_at
)
SELECT gp.id, gp.user_id, gp.gear_id, gp.name, gp.category, gp.lifespan_minutes,
  gp.minutes_used, gp.spare_count, gp.created_at
FROM public.gear_parts gp
JOIN personal_gear.other_gear o ON gp.gear_id = o.id
ON CONFLICT (id) DO NOTHING;

-- Migrate maintenance_logs
-- Note: public.maintenance_logs has no created_at column, use now()
INSERT INTO personal_gear.maintenance_logs (
  id, user_id, gear_id, description, cost, reset_service_clock, performed_on, created_at
)
SELECT id, user_id, gear_id, description, cost, reset_service_clock, performed_on, now()
FROM public.maintenance_logs
ON CONFLICT (id) DO NOTHING;

-- 6. Update dependent tables to reference personal_gear instead of public
-- Update sessions.goggles_id to reference personal_gear.goggles.id
ALTER TABLE public.sessions
DROP CONSTRAINT IF EXISTS sessions_goggles_id_fkey;

ALTER TABLE public.sessions
ADD CONSTRAINT sessions_goggles_id_fkey
FOREIGN KEY (goggles_id) REFERENCES personal_gear.goggles(id) ON DELETE SET NULL;

-- 7. Set up RLS policies for personal_gear tables
-- Enable Row Level Security on all personal_gear tables
ALTER TABLE personal_gear.batteries ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.drones ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.transmitters ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.goggles ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.other_gear ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.battery_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.drone_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.transmitter_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.goggles_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.other_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.maintenance_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for each table
-- Batteries policy
CREATE POLICY "batteries_insert_policy" ON personal_gear.batteries
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "batteries_select_policy" ON personal_gear.batteries
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "batteries_update_policy" ON personal_gear.batteries
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "batteries_delete_policy" ON personal_gear.batteries
FOR DELETE USING (user_id = auth.uid());

-- Drones policy
CREATE POLICY "drones_insert_policy" ON personal_gear.drones
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "drones_select_policy" ON personal_gear.drones
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "drones_update_policy" ON personal_gear.drones
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "drones_delete_policy" ON personal_gear.drones
FOR DELETE USING (user_id = auth.uid());

-- Transmitters policy
CREATE POLICY "transmitters_insert_policy" ON personal_gear.transmitters
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "transmitters_select_policy" ON personal_gear.transmitters
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "transmitters_update_policy" ON personal_gear.transmitters
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "transmitters_delete_policy" ON personal_gear.transmitters
FOR DELETE USING (user_id = auth.uid());

-- Goggles policy
CREATE POLICY "goggles_insert_policy" ON personal_gear.goggles
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "goggles_select_policy" ON personal_gear.goggles
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "goggles_update_policy" ON personal_gear.goggles
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "goggles_delete_policy" ON personal_gear.goggles
FOR DELETE USING (user_id = auth.uid());

-- Other gear policy
CREATE POLICY "other_gear_insert_policy" ON personal_gear.other_gear
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "other_gear_select_policy" ON personal_gear.other_gear
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "other_gear_update_policy" ON personal_gear.other_gear
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "other_gear_delete_policy" ON personal_gear.other_gear
FOR DELETE USING (user_id = auth.uid());

-- Parts tables policies
CREATE POLICY "battery_parts_insert_policy" ON personal_gear.battery_parts
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "battery_parts_select_policy" ON personal_gear.battery_parts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "battery_parts_update_policy" ON personal_gear.battery_parts
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "battery_parts_delete_policy" ON personal_gear.battery_parts
FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "drone_parts_insert_policy" ON personal_gear.drone_parts
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "drone_parts_select_policy" ON personal_gear.drone_parts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "drone_parts_update_policy" ON personal_gear.drone_parts
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "drone_parts_delete_policy" ON personal_gear.drone_parts
FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "transmitter_parts_insert_policy" ON personal_gear.transmitter_parts
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "transmitter_parts_select_policy" ON personal_gear.transmitter_parts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "transmitter_parts_update_policy" ON personal_gear.transmitter_parts
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "transmitter_parts_delete_policy" ON personal_gear.transmitter_parts
FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "goggles_parts_insert_policy" ON personal_gear.goggles_parts
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "goggles_parts_select_policy" ON personal_gear.goggles_parts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "goggles_parts_update_policy" ON personal_gear.goggles_parts
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "goggles_parts_delete_policy" ON personal_gear.goggles_parts
FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "other_parts_insert_policy" ON personal_gear.other_parts
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "other_parts_select_policy" ON personal_gear.other_parts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "other_parts_update_policy" ON personal_gear.other_parts
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "other_parts_delete_policy" ON personal_gear.other_parts
FOR DELETE USING (user_id = auth.uid());

-- Maintenance logs policy
CREATE POLICY "maintenance_logs_insert_policy" ON personal_gear.maintenance_logs
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "maintenance_logs_select_policy" ON personal_gear.maintenance_logs
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "maintenance_logs_update_policy" ON personal_gear.maintenance_logs
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "maintenance_logs_delete_policy" ON personal_gear.maintenance_logs
FOR DELETE USING (user_id = auth.uid());

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_personal_gear_batteries_user_id ON personal_gear.batteries(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_drones_user_id ON personal_gear.drones(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_transmitters_user_id ON personal_gear.transmitters(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_goggles_user_id ON personal_gear.goggles(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_other_gear_user_id ON personal_gear.other_gear(user_id);

-- Parts table indexes
CREATE INDEX IF NOT EXISTS idx_personal_gear_battery_parts_user_id ON personal_gear.battery_parts(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_battery_parts_gear_id ON personal_gear.battery_parts(gear_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_drone_parts_user_id ON personal_gear.drone_parts(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_drone_parts_gear_id ON personal_gear.drone_parts(gear_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_transmitter_parts_user_id ON personal_gear.transmitter_parts(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_transmitter_parts_gear_id ON personal_gear.transmitter_parts(gear_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_goggles_parts_user_id ON personal_gear.goggles_parts(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_goggles_parts_gear_id ON personal_gear.goggles_parts(gear_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_other_parts_user_id ON personal_gear.other_parts(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_other_parts_gear_id ON personal_gear.other_parts(gear_id);

-- Maintenance logs indexes
CREATE INDEX IF NOT EXISTS idx_personal_gear_maintenance_logs_user_id ON personal_gear.maintenance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_gear_maintenance_logs_gear_id ON personal_gear.maintenance_logs(gear_id);

-- 9. Create updated_at triggers for all tables
-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION personal_gear.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to all tables
CREATE TRIGGER update_batteries_updated_at
BEFORE UPDATE ON personal_gear.batteries
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_drones_updated_at
BEFORE UPDATE ON personal_gear.drones
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_transmitters_updated_at
BEFORE UPDATE ON personal_gear.transmitters
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_goggles_updated_at
BEFORE UPDATE ON personal_gear.goggles
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_other_gear_updated_at
BEFORE UPDATE ON personal_gear.other_gear
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_battery_parts_updated_at
BEFORE UPDATE ON personal_gear.battery_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_drone_parts_updated_at
BEFORE UPDATE ON personal_gear.drone_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_transmitter_parts_updated_at
BEFORE UPDATE ON personal_gear.transmitter_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_goggles_parts_updated_at
BEFORE UPDATE ON personal_gear.goggles_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_other_parts_updated_at
BEFORE UPDATE ON personal_gear.other_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

CREATE TRIGGER update_maintenance_logs_updated_at
BEFORE UPDATE ON personal_gear.maintenance_logs
FOR EACH ROW EXECUTE FUNCTION personal_gear.update_updated_at_column();

-- ====================================================
-- End of migration
-- ====================================================

-- 10. Drop old public tables (after verifying migration)
-- WARNING: This is irreversible.
DROP TABLE IF EXISTS public.batteries;
DROP TABLE IF EXISTS public.drones;
DROP TABLE IF EXISTS public.transmitters;
DROP TABLE IF EXISTS public.goggles;
DROP TABLE IF EXISTS public.other_gear;
DROP TABLE IF EXISTS public.gear_parts;
DROP TABLE IF EXISTS public.maintenance_logs;
DROP TABLE IF EXISTS public.maintenance;
DROP TABLE IF EXISTS public.gear; -- This is the main gear table

-- Note: other foreign keys in public.flights and public.maintenance reference drone_id
-- columns that have no FK constraint, so no additional changes are needed here.


