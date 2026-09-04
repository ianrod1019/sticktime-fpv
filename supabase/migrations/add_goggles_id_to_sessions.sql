/*
    # Add goggles_id column to sessions table

    1. Changes
      - Add `goggles_id` column (uuid, optional reference to gear) to the `sessions` table so goggles airtime can be correctly credited and deducted.
    2. Security
      - Maintains existing RLS policies on sessions table.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'goggles_id'
  ) THEN
    ALTER TABLE sessions ADD COLUMN goggles_id uuid REFERENCES gear(id) ON DELETE SET NULL;
  END IF;
END $$;
