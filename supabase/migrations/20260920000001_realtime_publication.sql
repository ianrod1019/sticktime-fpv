-- ====================================================
-- Migration: Realtime publication for live cache catch-up (2026-09-20)
--
-- Adds the user-facing tables to the supabase_realtime publication so
-- postgres_changes events reach the client. Row visibility is still governed
-- by RLS: supabase-js subscribers only receive events for rows their JWT can
-- SELECT, so users never see another pilot's gear/parts/logs.
--
-- Idempotent: skips tables already in the publication.
-- ====================================================

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('personal_gear', 'batteries'),
      ('personal_gear', 'drones'),
      ('personal_gear', 'transmitters'),
      ('personal_gear', 'goggles'),
      ('personal_gear', 'other_gear'),
      ('personal_gear', 'drone_parts'),
      ('personal_gear', 'drone_part_installs'),
      ('personal_gear', 'transmitter_parts'),
      ('personal_gear', 'goggles_parts'),
      ('personal_gear', 'other_parts'),
      ('personal_gear', 'maintenance_logs'),
      ('personal_gear', 'battery_packs'),
      ('personal_gear', 'battery_ir_readings'),
      ('personal_gear', 'component_failures'),
      ('public',        'sessions')
    ) AS v(schemaname, tablename)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname  = 'supabase_realtime'
        AND schemaname = t.schemaname
        AND tablename  = t.tablename
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
        t.schemaname, t.tablename
      );
    END IF;
  END LOOP;
END
$$;

-- ====================================================
-- End of migration
-- ====================================================
