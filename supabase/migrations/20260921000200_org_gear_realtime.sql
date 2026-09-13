-- ====================================================
-- Migration: Realtime publication for org_gear tables
--
-- Mirrors 20260920000001_realtime_publication.sql: org gear events reach
-- subscribers so mounted org-hanger / org-ledger screens refetch live.
-- RLS still governs delivery (members only see their team's rows).
-- ====================================================

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('org_gear', 'drones'),
      ('org_gear', 'batteries'),
      ('org_gear', 'transmitters'),
      ('org_gear', 'goggles'),
      ('org_gear', 'other_gear'),
      ('org_gear', 'drone_parts'),
      ('org_gear', 'drone_part_installs'),
      ('org_gear', 'transmitter_parts'),
      ('org_gear', 'goggles_parts'),
      ('org_gear', 'other_parts'),
      ('org_gear', 'maintenance_logs')
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
