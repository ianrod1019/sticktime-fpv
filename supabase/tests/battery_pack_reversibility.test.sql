-- Test: battery pack add/remove/restore is fully reversible.
--
-- Covers the personal_gear.sync_battery_packs trigger contract:
--   1. Raising pack_count materializes one battery_packs row per pack.
--   2. Lowering pack_count prunes only packs WITHOUT recorded IR readings.
--   3. A pack with an IR reading survives the prune and keeps its history.
--   4. Restoring the count re-creates pruned pack rows (removal is undoable).
--   5. The full pack set can be torn down and rebuilt ("do it for all the
--      packs") without data loss while readings exist.
--
-- Everything created here is deleted at the end; the test leaves the DB
-- exactly as it found it. Any failed assertion raises and aborts the block,
-- which also rolls back all test data.

DO $$
DECLARE
  v_user_id uuid;
  v_battery_id uuid;
  v_pack_count int;
  v_reading_id uuid;
  v_pack4_exists boolean;
  v_reading_exists boolean;
BEGIN
  -- Use an existing pilot so the rows mirror real ownership; fall back to a
  -- throwaway uuid if the table is empty.
  SELECT id INTO v_user_id FROM public.profiles LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := '00000000-0000-0000-0000-00000000dead'::uuid;
  END IF;

  -- 1. Create a battery set with 4 packs.
  INSERT INTO personal_gear.batteries (user_id, name, pack_count, cells)
  VALUES (v_user_id, 'TEST pack reversibility', 4, 6)
  RETURNING id INTO v_battery_id;

  SELECT count(*) INTO v_pack_count
  FROM personal_gear.battery_packs WHERE gear_id = v_battery_id;
  IF v_pack_count <> 4 THEN
    RAISE EXCEPTION 'FAIL step 1: expected 4 packs after insert, got %', v_pack_count;
  END IF;

  -- Record an IR reading on pack 4 (this is the "recorded history").
  INSERT INTO personal_gear.battery_ir_readings
    (user_id, battery_id, pack_number, cells, ir_values, measured_at)
  VALUES
    (v_user_id, v_battery_id, 4, 6, ARRAY[2.1, 2.2, 2.0, 2.3, 2.1, 2.2],
     now())
  RETURNING id INTO v_reading_id;

  -- 2. Shrink the set to 2 packs: packs 3-4 lose no readings protection here —
  --    pack 3 (no readings) should be pruned, pack 4 (has readings) kept.
  UPDATE personal_gear.batteries SET pack_count = 2 WHERE id = v_battery_id;

  SELECT count(*) INTO v_pack_count
  FROM personal_gear.battery_packs WHERE gear_id = v_battery_id;
  IF v_pack_count <> 3 THEN
    RAISE EXCEPTION 'FAIL step 2: expected 3 packs after prune (2 kept + 1 protected), got %', v_pack_count;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM personal_gear.battery_packs
    WHERE gear_id = v_battery_id AND pack_number = 4
  ) INTO v_pack4_exists;
  IF NOT v_pack4_exists THEN
    RAISE EXCEPTION 'FAIL step 2: pack 4 was pruned despite having IR readings';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM personal_gear.battery_ir_readings WHERE id = v_reading_id
  ) INTO v_reading_exists;
  IF NOT v_reading_exists THEN
    RAISE EXCEPTION 'FAIL step 2: IR reading was destroyed by the prune';
  END IF;

  -- 3. Undo: restore the count to 4 — pack 3 comes back, pack 4 untouched.
  UPDATE personal_gear.batteries SET pack_count = 4 WHERE id = v_battery_id;

  SELECT count(*) INTO v_pack_count
  FROM personal_gear.battery_packs WHERE gear_id = v_battery_id;
  IF v_pack_count <> 4 THEN
    RAISE EXCEPTION 'FAIL step 3: expected 4 packs after restore, got %', v_pack_count;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM personal_gear.battery_ir_readings WHERE id = v_reading_id
  ) INTO v_reading_exists;
  IF NOT v_reading_exists THEN
    RAISE EXCEPTION 'FAIL step 3: IR reading missing after restore';
  END IF;

  -- 4. Tear the whole set down to 1 pack and rebuild to 4 ("do it for all
  --    the packs"): pack 4 still cannot be destroyed while its reading lives.
  UPDATE personal_gear.batteries SET pack_count = 1 WHERE id = v_battery_id;
  UPDATE personal_gear.batteries SET pack_count = 4 WHERE id = v_battery_id;

  SELECT count(*) INTO v_pack_count
  FROM personal_gear.battery_packs WHERE gear_id = v_battery_id;
  IF v_pack_count <> 4 THEN
    RAISE EXCEPTION 'FAIL step 4: expected 4 packs after full teardown/rebuild, got %', v_pack_count;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM personal_gear.battery_ir_readings WHERE id = v_reading_id
  ) INTO v_reading_exists;
  IF NOT v_reading_exists THEN
    RAISE EXCEPTION 'FAIL step 4: IR reading missing after full teardown/rebuild';
  END IF;

  -- Cleanup: deleting the battery cascades to packs and IR readings.
  DELETE FROM personal_gear.batteries WHERE id = v_battery_id;

  IF EXISTS (SELECT 1 FROM personal_gear.battery_packs WHERE gear_id = v_battery_id) THEN
    RAISE EXCEPTION 'FAIL cleanup: packs survived battery delete';
  END IF;
  IF EXISTS (SELECT 1 FROM personal_gear.battery_ir_readings WHERE id = v_reading_id) THEN
    RAISE EXCEPTION 'FAIL cleanup: IR reading survived battery delete';
  END IF;

  RAISE NOTICE 'PASS: pack add/remove/restore is reversible; recorded readings preserved; test data cleaned up';
END;
$$;
