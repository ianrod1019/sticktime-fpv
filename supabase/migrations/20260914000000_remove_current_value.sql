-- Remove current_value and purchase_date columns from all personal_gear tables

ALTER TABLE personal_gear.batteries DROP COLUMN IF EXISTS current_value, DROP COLUMN IF EXISTS purchase_date;
ALTER TABLE personal_gear.drones DROP COLUMN IF EXISTS current_value, DROP COLUMN IF EXISTS purchase_date;
ALTER TABLE personal_gear.transmitters DROP COLUMN IF EXISTS current_value, DROP COLUMN IF EXISTS purchase_date;
ALTER TABLE personal_gear.goggles DROP COLUMN IF EXISTS current_value, DROP COLUMN IF EXISTS purchase_date;
ALTER TABLE personal_gear.other_gear DROP COLUMN IF EXISTS current_value, DROP COLUMN IF EXISTS purchase_date;

-- Remove purchase_date from battery pack health tracking
ALTER TABLE public.battery_packs DROP COLUMN IF EXISTS purchase_date;