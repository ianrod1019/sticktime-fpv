-- Per-pack LiPo internal-resistance readings.
-- One row = one IR check of one pack inside a battery set:
--   ir_values holds one milliohm value per cell (index 0 = cell 1).
-- Keyed by (battery_id, pack_number) so each physical pack in the set
-- keeps its own degradation history.

-- IMMUTABLE helper (CHECK constraints cannot contain subqueries)
CREATE OR REPLACE FUNCTION personal_gear.array_all_positive(vals numeric[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((SELECT bool_and(v > 0) FROM unnest(vals) AS v), false);
$$;

CREATE TABLE IF NOT EXISTS personal_gear.battery_ir_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  battery_id uuid NOT NULL REFERENCES personal_gear.batteries(id) ON DELETE CASCADE,
  pack_number integer NOT NULL DEFAULT 1,
  cells integer NOT NULL CHECK (cells > 0),
  ir_values numeric[] NOT NULL,
  pack_cycle_count integer,
  measured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT chk_ir_values_len CHECK (COALESCE(array_length(ir_values, 1), 0) > 0),
  CONSTRAINT chk_ir_values_positive CHECK (personal_gear.array_all_positive(ir_values))
);

CREATE INDEX IF NOT EXISTS idx_battery_ir_readings_battery
  ON personal_gear.battery_ir_readings (battery_id, pack_number, measured_at DESC);

ALTER TABLE personal_gear.battery_ir_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battery_ir_readings_insert_policy" ON personal_gear.battery_ir_readings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "battery_ir_readings_select_policy" ON personal_gear.battery_ir_readings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "battery_ir_readings_update_policy" ON personal_gear.battery_ir_readings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "battery_ir_readings_delete_policy" ON personal_gear.battery_ir_readings FOR DELETE USING (auth.uid() = user_id);
