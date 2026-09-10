-- Fix missing columns in personal_gear.other_gear after earlier broken migration
-- Add commonly used columns that other gear should have, matching other gear tables
ALTER TABLE personal_gear.other_gear
  ADD COLUMN IF NOT EXISTS service_interval_minutes integer NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS minutes_since_service integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pack_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crash_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cells integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connector_type text NOT NULL DEFAULT '';

-- Ensure RLS policies exist for new columns (no change needed as policies cover whole table)

-- Optionally backfill existing rows with default values (already defaulted)
