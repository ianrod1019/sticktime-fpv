-- Pack identity provisioning: every battery set gets physical pack rows
-- (personal_gear.battery_packs) automatically, so per-pack IR tracking has
-- real rows to key on instead of client-side stubs.
--
-- Rules:
--   INSERT (or pack_count increased)  -> create missing packs 1..pack_count
--   pack_count decreased              -> prune surplus packs ONLY if they
--     carry no IR readings (recorded history is never destroyed silently)

CREATE OR REPLACE FUNCTION personal_gear.sync_battery_packs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO personal_gear.battery_packs (user_id, gear_id, pack_number)
  SELECT NEW.user_id, NEW.id, n
  FROM generate_series(1, NEW.pack_count) AS g(n)
  ON CONFLICT (gear_id, pack_number) DO NOTHING;

  DELETE FROM personal_gear.battery_packs p
  WHERE p.gear_id = NEW.id
    AND p.pack_number > NEW.pack_count
    AND NOT EXISTS (
      SELECT 1 FROM personal_gear.battery_ir_readings r
      WHERE r.battery_id = p.gear_id AND r.pack_number = p.pack_number
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_battery_packs ON personal_gear.batteries;
CREATE TRIGGER trg_sync_battery_packs
AFTER INSERT OR UPDATE OF pack_count ON personal_gear.batteries
FOR EACH ROW EXECUTE FUNCTION personal_gear.sync_battery_packs();

-- One-time backfill: existing batteries get their packs materialized
INSERT INTO personal_gear.battery_packs (user_id, gear_id, pack_number)
SELECT b.user_id, b.id, n
FROM personal_gear.batteries b
CROSS JOIN generate_series(1, b.pack_count) AS n
ON CONFLICT (gear_id, pack_number) DO NOTHING;
