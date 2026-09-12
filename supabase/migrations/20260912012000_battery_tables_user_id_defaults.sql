-- The app's inserts don't send user_id (matches the parts-table convention
-- of defaulting to auth.uid()), so the new tables need the same default.
ALTER TABLE personal_gear.battery_packs
  ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE personal_gear.battery_health_readings
  ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE personal_gear.battery_ir_readings
  ALTER COLUMN user_id SET DEFAULT auth.uid();
