-- Move battery_packs and battery_health_readings from public to personal_gear
-- The public.battery_packs.gear_id referenced public.gear(id) which was dropped
-- in the split migration. This moves both tables to personal_gear with valid FKs.

-- 1. Create personal_gear.battery_packs (mirrors public.battery_packs, FK to personal_gear.batteries)
CREATE TABLE IF NOT EXISTS personal_gear.battery_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL REFERENCES personal_gear.batteries(id) ON DELETE CASCADE,
  pack_number integer NOT NULL,
  serial_number text,
  purchase_date timestamptz,
  total_cycles integer DEFAULT 0,
  max_capacity_mah integer DEFAULT 0,
  current_capacity_mah integer DEFAULT 0,
  health_percentage numeric(5,2) DEFAULT 100.00,
  internal_resistance_milliohm numeric(6,3) DEFAULT 0.000,
  voltage_sag_percent numeric(5,2) DEFAULT 0.00,
  last_analyzed timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_pack_number_positive CHECK (pack_number > 0),
  CONSTRAINT uq_gear_pack_number UNIQUE (gear_id, pack_number)
);

-- 2. Create personal_gear.battery_health_readings (FK to personal_gear.battery_packs)
CREATE TABLE IF NOT EXISTS personal_gear.battery_health_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  battery_pack_id uuid NOT NULL REFERENCES personal_gear.battery_packs(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  voltage_at_rest_volts numeric(4,2) NOT NULL,
  voltage_under_load_volts numeric(4,2) NOT NULL,
  current_draw_amps numeric(5,2) NOT NULL,
  calculated_internal_resistance_milliohm numeric(6,3),
  voltage_sag_percent numeric(5,2),
  ambient_temperature_celsius numeric(4,1),
  flight_duration_seconds integer,
  throttle_percent_avg numeric(5,2),
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT chk_voltage_rest_positive CHECK (voltage_at_rest_volts > 0),
  CONSTRAINT chk_voltage_load_positive CHECK (voltage_under_load_volts > 0),
  CONSTRAINT chk_current_positive CHECK (current_draw_amps >= 0)
);

-- 3. Migrate data from public to personal_gear
INSERT INTO personal_gear.battery_packs (id, user_id, gear_id, pack_number, serial_number, purchase_date, total_cycles, max_capacity_mah, current_capacity_mah, health_percentage, internal_resistance_milliohm, voltage_sag_percent, last_analyzed, created_at, updated_at)
SELECT id, user_id, gear_id, pack_number, serial_number, purchase_date, total_cycles, max_capacity_mah, current_capacity_mah, health_percentage, internal_resistance_milliohm, voltage_sag_percent, last_analyzed, created_at, updated_at
FROM public.battery_packs
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal_gear.battery_health_readings (id, user_id, battery_pack_id, session_id, voltage_at_rest_volts, voltage_under_load_volts, current_draw_amps, calculated_internal_resistance_milliohm, voltage_sag_percent, ambient_temperature_celsius, flight_duration_seconds, throttle_percent_avg, recorded_at, created_at)
SELECT id, user_id, battery_pack_id, session_id, voltage_at_rest_volts, voltage_under_load_volts, current_draw_amps, calculated_internal_resistance_milliohm, voltage_sag_percent, ambient_temperature_celsius, flight_duration_seconds, throttle_percent_avg, recorded_at, created_at
FROM public.battery_health_readings
ON CONFLICT (id) DO NOTHING;

-- 4. Enable RLS on personal_gear tables
ALTER TABLE personal_gear.battery_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_gear.battery_health_readings ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for personal_gear.battery_packs
CREATE POLICY "battery_packs_insert_policy" ON personal_gear.battery_packs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "battery_packs_select_policy" ON personal_gear.battery_packs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "battery_packs_update_policy" ON personal_gear.battery_packs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "battery_packs_delete_policy" ON personal_gear.battery_packs FOR DELETE USING (auth.uid() = user_id);

-- 6. RLS policies for personal_gear.battery_health_readings
CREATE POLICY "battery_health_readings_insert_policy" ON personal_gear.battery_health_readings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "battery_health_readings_select_policy" ON personal_gear.battery_health_readings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "battery_health_readings_update_policy" ON personal_gear.battery_health_readings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "battery_health_readings_delete_policy" ON personal_gear.battery_health_readings FOR DELETE USING (auth.uid() = user_id);

-- 7. Drop the public versions (now empty or migrated)
DROP TABLE IF EXISTS public.battery_health_readings;
DROP TABLE IF EXISTS public.battery_packs;
