-- Fix missing columns in personal_gear.other_gear and add last_service_notes to gear tables

-- 1. Ensure other_gear has all expected columns
ALTER TABLE personal_gear.other_gear
  ADD COLUMN IF NOT EXISTS minutes_since_service integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pack_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crash_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cells integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS connector_type text NOT NULL DEFAULT '';

-- 2. Add last_service_notes column to all gear tables for service logging
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='personal_gear' AND table_name='batteries' AND column_name='last_service_notes') THEN
    ALTER TABLE personal_gear.batteries ADD COLUMN last_service_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='personal_gear' AND table_name='drones' AND column_name='last_service_notes') THEN
    ALTER TABLE personal_gear.drones ADD COLUMN last_service_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='personal_gear' AND table_name='transmitters' AND column_name='last_service_notes') THEN
    ALTER TABLE personal_gear.transmitters ADD COLUMN last_service_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='personal_gear' AND table_name='goggles' AND column_name='last_service_notes') THEN
    ALTER TABLE personal_gear.goggles ADD COLUMN last_service_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='personal_gear' AND table_name='other_gear' AND column_name='last_service_notes') THEN
    ALTER TABLE personal_gear.other_gear ADD COLUMN last_service_notes text;
  END IF;
END $$;
