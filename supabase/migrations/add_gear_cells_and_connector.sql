/*
  # Add cells and connector_type to gear table

  1. Changes
    - Add `cells` (integer, default 0) to `gear` table for batteries and drones
    - Add `connector_type` (text, default '') to `gear` table for batteries and drones
  2. Security
    - No changes to RLS policies needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gear' AND column_name = 'cells'
  ) THEN
    ALTER TABLE gear ADD COLUMN cells integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gear' AND column_name = 'connector_type'
  ) THEN
    ALTER TABLE gear ADD COLUMN connector_type text DEFAULT '';
  END IF;
END $$;
