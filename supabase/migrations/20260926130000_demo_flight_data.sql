-- ============================================================
-- Migration: demo flight data for the seeded RBAC cast
--
-- Gives every seeded account a lived-in logbook so every screen
-- renders real content:
--   • personal gear (drones / batteries / radios / goggles) per pilot
--   • org fleet gear in the RBAC Test Squadron
--   • two months of real + sim sessions (streaks, heatmap, charts)
--   • battery packs with health readings (IR tracker, health bars)
--   • bench parts + installs (personal + squadron parts inventory)
--   • maintenance history incl. parseable failure reports, so personal
--     (Pro) and squadron (Enterprise) failure analytics have data
--
-- Idempotent: fixed uuid literals + WHERE NOT EXISTS on every insert.
-- Dev/test fixture — DO NOT RUN ON PROD.
--
-- Depends on: 20260926010000_seed_org_role_test_accounts.sql
-- ============================================================

-- ---------------------------------------------------------------------------
-- 0. Fixed uuids for cross-references
-- ---------------------------------------------------------------------------
-- Squadron:  bb000000-0000-4000-8000-000000000001
-- Users:     aa000000-0000-4000-8000-0000000000 01..06
--            (01 owner, 02 manager, 03 member, 04 member2, 05 pilot, 06 admin)
-- Org gear:  cc000000-0000-4000-8000-0000000000xx
-- Personal:  dd000000-0000-4000-8000-0000000000xx

-- ---------------------------------------------------------------------------
-- 1. Squadron (org) fleet gear — the shared hanger
-- ---------------------------------------------------------------------------
INSERT INTO org_gear.drones (id, team_id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count, cells, connector_type, purchase_cost)
VALUES
  ('cc000000-0000-4000-8000-000000000001'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Squadron Racer 5"', 'iFlight', 600, 420, 1240, 38, 4, 6, 'XT60', 219.99),
  ('cc000000-0000-4000-8000-000000000002'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Fleet Freestyle 6"', 'Source One', 600, 590, 980, 27, 7, 6, 'XT60', 145.00),
  ('cc000000-0000-4000-8000-000000000003'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Tinywhoop Trainer', 'Mobula6', 300, 120, 410, 19, 1, 1, 'AIO', 89.99)
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_gear.batteries (id, team_id, user_id, name, brand, pack_count, crash_count,
  cells, connector_type, purchase_cost, storage_voltage_per_cell, full_voltage_per_cell, empty_voltage_per_cell, packs_flown_total, total_minutes)
VALUES
  ('cc000000-0000-4000-8000-000000000011'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Fleet CNHL 1300 6S (x4)', 'CNHL', 4, 1, 6, 'XT60', 179.96, 3.80, 4.20, 3.50, 96, 740),
  ('cc000000-0000-4000-8000-000000000012'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Fleet Tattu 1550 6S (x3)', 'Tattu', 3, 0, 6, 'XT60', 164.97, 3.80, 4.20, 3.50, 64, 500)
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_gear.transmitters (id, team_id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, purchase_cost, purchase_date, current_value)
VALUES
  ('cc000000-0000-4000-8000-000000000021'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Squadron RadioMaster Pocket', 'RadioMaster', 1200, 300, 1500, 129.00, now() - interval '10 months', 95.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_gear.goggles (id, team_id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, purchase_cost, cells)
VALUES
  ('cc000000-0000-4000-8000-000000000031'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Squadron HDZero Freestyle V2', 'HDZero', 900, 210, 1120, 349.00, 0)
ON CONFLICT (id) DO NOTHING;

-- Bench parts (squadron spare-parts bench)
INSERT INTO org_gear.drone_parts (id, team_id, user_id, category, name, brand, status, specs, purchase_cost, purchase_date, vendor)
VALUES
  ('cc000000-0000-4000-8000-000000000041'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'motor', 'AX2306.5 1750KV spare', 'iFlight', 'shelf', '{"kv": 1750}'::jsonb, 32.99, now() - interval '3 months', 'iFlight'),
  ('cc000000-0000-4000-8000-000000000042'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'esc', 'Squadron ESC 45A spare', 'SpeedyBee', 'shelf', '{"amps": 45}'::jsonb, 38.50, now() - interval '2 months', 'GetFPV'),
  ('cc000000-0000-4000-8000-000000000043'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'frame', 'Source One V5 arm set', 'TBS', 'shelf', '{"size": "5 inch"}'::jsonb, 24.99, now() - interval '6 weeks', 'TBS'),
  ('cc000000-0000-4000-8000-000000000044'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'camera', 'Runcam Nano 6 spare', 'Runcam', 'shelf', '{"fov": "165"}'::jsonb, 44.95, now() - interval '1 month', 'Runcam'),
  ('cc000000-0000-4000-8000-000000000045'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'prop', 'HQ 5x4.3x3 bulk (20 pairs)', 'HQProp', 'shelf', '{"pitch": "4.3"}'::jsonb, 42.00, now() - interval '5 weeks', 'HQProp')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Personal gear — a small fleet for owner, manager, member2, pilot
--    (member keeps an intentionally empty personal hanger to show the
--    empty-state UX; admin stays lean too.)
-- ---------------------------------------------------------------------------
INSERT INTO personal_gear.drones (id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, pack_count, crash_count, cells, connector_type, purchase_cost)
VALUES
  ('dd000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Shendrones Squirt V2', 'Shendrones', 600, 380, 1820, 52, 6, 4, 'XT60', 289.00),
  ('dd000000-0000-4000-8000-000000000002'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'iFlight Mach R5', 'iFlight', 600, 540, 1210, 31, 9, 6, 'XT60', 249.00),
  ('dd000000-0000-4000-8000-000000000003'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid,
   'Geprc Cinelog35', 'Geprc', 600, 210, 890, 22, 2, 4, 'XT60', 310.00),
  ('dd000000-0000-4000-8000-000000000004'::uuid, 'aa000000-0000-4000-8000-000000000004'::uuid,
   'Flywoo Firefly Baby', 'Flywoo', 600, 90, 320, 12, 1, 4, 'XT30', 165.00),
  ('dd000000-0000-4000-8000-000000000005'::uuid, 'aa000000-0000-4000-8000-000000000005'::uuid,
   'Happymodel Mobula7', 'Happymodel', 300, 60, 180, 9, 0, 2, 'AIO', 95.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal_gear.batteries (id, user_id, name, brand, pack_count, crash_count,
  cells, connector_type, purchase_cost, storage_voltage_per_cell, full_voltage_per_cell, empty_voltage_per_cell, packs_flown_total, total_minutes)
VALUES
  ('dd000000-0000-4000-8000-000000000011'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'CNHL 1500 6S Black Series', 'CNHL', 6, 2, 6, 'XT60', 269.94, 3.80, 4.20, 3.50, 148, 1120),
  ('dd000000-0000-4000-8000-000000000012'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Tattu R-Line 1550 6S', 'Tattu', 4, 0, 6, 'XT60', 219.96, 3.80, 4.20, 3.50, 88, 690),
  ('dd000000-0000-4000-8000-000000000013'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid,
   'CNHL 1300 6S (Cinelog)', 'CNHL', 3, 0, 6, 'XT60', 134.97, 3.80, 4.20, 3.50, 54, 420),
  ('dd000000-0000-4000-8000-000000000014'::uuid, 'aa000000-0000-4000-8000-000000000004'::uuid,
   'Tattu 750 4S (Firefly)', 'Tattu', 4, 0, 4, 'XT30', 99.96, 3.80, 4.20, 3.50, 41, 260),
  ('dd000000-0000-4000-8000-000000000015'::uuid, 'aa000000-0000-4000-8000-000000000005'::uuid,
   'BT 2.0 450 (Mobula7)', 'BetaFPV', 4, 0, 2, 'AIO', 59.96, 3.80, 4.20, 3.50, 22, 130)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal_gear.transmitters (id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, purchase_cost, purchase_date, current_value)
VALUES
  ('dd000000-0000-4000-8000-000000000021'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'RadioMaster Boxer', 'RadioMaster', 1200, 410, 2140, 229.00, now() - interval '16 months', 160.00),
  ('dd000000-0000-4000-8000-000000000022'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid,
   'TX12 Mark II', 'RadioMaster', 1200, 150, 640, 138.00, now() - interval '12 months', 100.00),
  ('dd000000-0000-4000-8000-000000000023'::uuid, 'aa000000-0000-4000-8000-000000000004'::uuid,
   'Pocket Mk2', 'RadioMaster', 1200, 40, 210, 129.00, now() - interval '5 months', 110.00),
  ('dd000000-0000-4000-8000-000000000024'::uuid, 'aa000000-0000-4000-8000-000000000005'::uuid,
   'LiteRadio 3', 'BetaFPV', 1200, 20, 95, 59.00, now() - interval '3 months', 50.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal_gear.goggles (id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, purchase_cost, cells)
VALUES
  ('dd000000-0000-4000-8000-000000000031'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'HDZero Freestyle V2', 'HDZero', 900, 300, 1980, 349.00, 0),
  ('dd000000-0000-4000-8000-000000000032'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid,
   'Skyzone SKY04O Pro', 'Skyzone', 900, 120, 720, 319.00, 0),
  ('dd000000-0000-4000-8000-000000000033'::uuid, 'aa000000-0000-4000-8000-000000000004'::uuid,
   'Eachine Ev800D', 'Eachine', 900, 30, 190, 89.00, 0),
  ('dd000000-0000-4000-8000-000000000034'::uuid, 'aa000000-0000-4000-8000-000000000005'::uuid,
   'Eachine Ev800D (backup)', 'Eachine', 900, 15, 80, 89.00, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal_gear.other_gear (id, user_id, name, brand, service_interval_minutes,
  minutes_since_service, total_minutes, purchase_cost, purchase_date, current_value)
VALUES
  ('dd000000-0000-4000-8000-000000000041'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Tool & repair kit (Zippy case)', 'CasePro', 0, 0, 0, 145.00, now() - interval '1 year', 120.00),
  ('dd000000-0000-4000-8000-000000000042'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'Charger: ToolkitRC M7', 'ToolkitRC', 0, 0, 0, 89.00, now() - interval '10 months', 75.00)
ON CONFLICT (id) DO NOTHING;

-- Personal bench parts (owner + member2)
INSERT INTO personal_gear.drone_parts (id, user_id, category, name, brand, status, specs, purchase_cost, purchase_date, vendor)
VALUES
  ('dd000000-0000-4000-8000-000000000051'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'motor', 'Eco II 2306 1700KV spare', 'EMAX', 'shelf', '{"kv": 1700}'::jsonb, 24.99, now() - interval '4 months', 'EMAX'),
  ('dd000000-0000-4000-8000-000000000052'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'esc', 'BLHeli 45A spare', 'AM32', 'shelf', '{"amps": 45}'::jsonb, 32.00, now() - interval '2 months', 'GetFPV'),
  ('dd000000-0000-4000-8000-000000000053'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid,
   'prop', 'Gemfan 51433 bulk', 'Gemfan', 'shelf', '{"pitch": "4.9"}'::jsonb, 36.00, now() - interval '3 weeks', 'Gemfan'),
  ('dd000000-0000-4000-8000-000000000054'::uuid, 'aa000000-0000-4000-8000-000000000004'::uuid,
   'prop', 'HQ T3x2.5 bulk (Toothpick)', 'HQProp', 'shelf', '{"pitch": "2.5"}'::jsonb, 18.00, now() - interval '2 months', 'HQProp')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Battery packs + health readings (owner's CNHL set) — feeds the
--    battery IR tracker and health bars
-- ---------------------------------------------------------------------------
INSERT INTO personal_gear.battery_packs (id, user_id, gear_id, pack_number, serial_number,
  purchase_date, total_cycles, max_capacity_mah, current_capacity_mah, health_percentage,
  internal_resistance_milliohm, voltage_sag_percent, last_analyzed)
VALUES
  ('dd000000-0000-4000-8000-000000000101'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 1, 'CNHL-A1', now() - interval '8 months', 62, 1500, 1340, 89.30, 8.4, 6.2, now() - interval '2 days'),
  ('dd000000-0000-4000-8000-000000000102'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 2, 'CNHL-A2', now() - interval '8 months', 58, 1500, 1310, 87.30, 9.1, 6.8, now() - interval '2 days'),
  ('dd000000-0000-4000-8000-000000000103'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 3, 'CNHL-A3', now() - interval '8 months', 71, 1500, 1250, 83.30, 12.6, 9.4, now() - interval '9 days'),
  ('dd000000-0000-4000-8000-000000000104'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 4, 'CNHL-A4', now() - interval '8 months', 44, 1500, 1390, 92.70, 6.8, 4.9, now() - interval '5 days'),
  ('dd000000-0000-4000-8000-000000000105'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 5, 'CNHL-A5', now() - interval '8 months', 39, 1500, 1410, 94.00, 5.9, 4.2, now() - interval '5 days'),
  ('dd000000-0000-4000-8000-000000000106'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 6, 'CNHL-A6', now() - interval '8 months', 83, 1500, 1170, 78.00, 15.2, 11.8, now() - interval '12 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal_gear.battery_ir_readings (user_id, battery_id, pack_number, cells, ir_values, pack_cycle_count, measured_at)
VALUES
  -- pack 1 (healthy) & pack 2: ~8-9 mOhm per cell
  ('aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 1, 6, ARRAY[8.4, 8.2, 8.6, 8.1, 8.5, 8.3], 62, now() - interval '2 days'),
  ('aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 2, 6, ARRAY[9.1, 8.9, 9.3, 8.8, 9.2, 9.0], 58, now() - interval '2 days'),
  -- pack 3 (degrading): ~12-13 mOhm per cell
  ('aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 3, 6, ARRAY[12.6, 12.2, 12.9, 12.4, 12.8, 12.5], 71, now() - interval '9 days'),
  -- pack 6 (tired): ~15-16 mOhm per cell
  ('aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000011'::uuid, 6, 6, ARRAY[15.2, 14.9, 15.5, 15.0, 15.4, 15.1], 83, now() - interval '12 days')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Sessions — eight weeks of real + sim flying for owner, manager,
--    member2, pilot. Generates streaks, heatmap dots and monthly volume.
--    Session dates are derived from CURRENT_DATE at run time so the
--    heatmap is always "recent".
-- ---------------------------------------------------------------------------
INSERT INTO public.sessions (user_id, session_type, flown_on, duration_minutes, drone_id,
  controller_id, goggles_id, sim_platform, packs_flown, crashes, battery_notes, weather, notes)
SELECT
  'aa000000-0000-4000-8000-000000000001'::uuid,
  v.stype::session_type,
  (CURRENT_DATE - v.days_ago)::text,
  v.mins,
  CASE WHEN v.stype = 'real' THEN 'dd000000-0000-4000-8000-00000000000' || v.drone_tail::text END::uuid,
  'dd000000-0000-4000-8000-000000000021'::uuid,
  'dd000000-0000-4000-8000-000000000031'::uuid,
  CASE WHEN v.stype = 'sim' THEN v.platform END,
  v.packs,
  v.crashes,
  CASE WHEN v.stype = 'real' THEN 'CNHL 1500 6S — sag ok' END,
  CASE WHEN v.stype = 'real' THEN
    jsonb_build_object('temp_c', 14 + (v.days_ago % 14), 'wind_kmh', (v.days_ago * 3) % 22, 'condition',
      (ARRAY['clear', 'overcast', 'breezy', 'cold'])[1 + (v.days_ago % 4)])
  END,
  v.note
FROM (VALUES
  -- (days_ago, stype, mins, drone_tail, platform, packs, crashes, note)
  (1,  'real', 25, 1, NULL, 3, 0, 'Park laps — dialed'),
  (1,  'sim',  30, NULL, 'VelociDrone', 0, 0, 'League practice'),
  (2,  'real', 20, 2, NULL, 2, 1, 'Clipped a branch on the gap line'),
  (2,  'sim',  45, NULL, 'Liftoff', 0, 0, NULL),
  (3,  'real', 30, 1, NULL, 4, 0, NULL),
  (4,  'real', 15, 2, NULL, 1, 0, 'Short lunch flight'),
  (5,  'sim',  60, NULL, 'VelociDrone', 0, 0, 'Ryangowen track grind'),
  (6,  'real', 35, 1, NULL, 4, 1, 'Tree strike — prop saved the frame'),
  (7,  'real', 25, 2, NULL, 3, 0, NULL),
  (8,  'sim',  40, NULL, 'DRL', 0, 0, NULL),
  (9,  'real', 40, 1, NULL, 5, 0, 'Best packs of the month'),
  (10, 'real', 20, 2, NULL, 2, 2, 'Two crashes on the same gap — walk it back'),
  (11, 'sim',  35, NULL, 'VelociDrone', 0, 0, NULL),
  (12, 'real', 30, 1, NULL, 4, 0, NULL),
  (14, 'real', 45, 1, NULL, 6, 1, 'Long session, one dumb mistake'),
  (15, 'sim',  50, NULL, 'Liftoff', 0, 0, NULL),
  (17, 'real', 25, 2, NULL, 3, 0, NULL),
  (18, 'real', 20, 1, NULL, 2, 0, NULL),
  (20, 'sim',  45, NULL, 'VelociDrone', 0, 0, 'Freestyle map practice'),
  (22, 'real', 35, 1, NULL, 4, 0, NULL),
  (24, 'sim',  30, NULL, 'DRL', 0, 0, NULL),
  (26, 'real', 40, 1, NULL, 5, 1, NULL),
  (29, 'sim',  55, NULL, 'VelociDrone', 0, 0, NULL),
  (31, 'real', 30, 2, NULL, 3, 0, NULL),
  (33, 'real', 25, 1, NULL, 3, 0, NULL),
  (36, 'sim',  40, NULL, 'Liftoff', 0, 0, NULL),
  (39, 'real', 35, 1, NULL, 4, 1, 'Motor bearing starting to whine'),
  (42, 'sim',  45, NULL, 'VelociDrone', 0, 0, NULL),
  (46, 'real', 30, 1, NULL, 3, 0, NULL),
  (52, 'sim',  60, NULL, 'VelociDrone', 0, 0, 'League qualifier'),
  (55, 'real', 25, 2, NULL, 2, 0, NULL)
) AS v(days_ago, stype, mins, drone_tail, platform, packs, crashes, note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sessions s
  WHERE s.user_id = 'aa000000-0000-4000-8000-000000000001'::uuid
    AND s.flown_on = (CURRENT_DATE - v.days_ago)::text
    AND s.session_type = v.stype::session_type
    AND s.duration_minutes = v.mins
);

-- manager (02) — lighter cadence, mostly sim + cinewhoop
INSERT INTO public.sessions (user_id, session_type, flown_on, duration_minutes, drone_id,
  controller_id, goggles_id, sim_platform, packs_flown, crashes, notes)
SELECT
  'aa000000-0000-4000-8000-000000000002'::uuid,
  v.stype::session_type,
  (CURRENT_DATE - v.days_ago)::text,
  v.mins,
  CASE WHEN v.stype = 'real' THEN 'dd000000-0000-4000-8000-000000000003'::uuid END,
  'dd000000-0000-4000-8000-000000000022'::uuid,
  'dd000000-0000-4000-8000-000000000032'::uuid,
  CASE WHEN v.stype = 'sim' THEN v.platform END,
  v.packs, v.crashes, v.note
FROM (VALUES
  (2,  'real', 20, 3, NULL, 2, 0, 'Cine pass around the office park'),
  (3,  'sim',  30, NULL, 'VelociDrone', 0, 0, NULL),
  (6,  'real', 25, 3, NULL, 3, 1, 'Gate clip'),
  (9,  'sim',  40, NULL, 'Liftoff', 0, 0, NULL),
  (13, 'real', 15, 3, NULL, 1, 0, NULL),
  (20, 'sim',  35, NULL, 'VelociDrone', 0, 0, NULL),
  (27, 'real', 30, 3, NULL, 3, 0, NULL),
  (34, 'sim',  25, NULL, 'DRL', 0, 0, NULL),
  (48, 'real', 20, 3, NULL, 2, 0, NULL)
) AS v(days_ago, stype, mins, drone_tail, platform, packs, crashes, note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sessions s
  WHERE s.user_id = 'aa000000-0000-4000-8000-000000000002'::uuid
    AND s.flown_on = (CURRENT_DATE - v.days_ago)::text
    AND s.session_type = v.stype::session_type
    AND s.duration_minutes = v.mins
);

-- member2 (04) and pilot (05) — small personal logbooks
INSERT INTO public.sessions (user_id, session_type, flown_on, duration_minutes, drone_id,
  controller_id, goggles_id, sim_platform, packs_flown, crashes, notes)
SELECT
  v.uid::uuid,
  v.stype::session_type,
  (CURRENT_DATE - v.days_ago)::text,
  v.mins,
  CASE WHEN v.stype = 'real' AND v.uid = 'aa000000-0000-4000-8000-000000000004' THEN 'dd000000-0000-4000-8000-000000000004'::uuid
       WHEN v.stype = 'real' AND v.uid = 'aa000000-0000-4000-8000-000000000005' THEN 'dd000000-0000-4000-8000-000000000005'::uuid END,
  CASE WHEN v.uid = 'aa000000-0000-4000-8000-000000000004' THEN 'dd000000-0000-4000-8000-000000000023'::uuid
       ELSE 'dd000000-0000-4000-8000-000000000024'::uuid END,
  CASE WHEN v.uid = 'aa000000-0000-4000-8000-000000000004' THEN 'dd000000-0000-4000-8000-000000000033'::uuid
       ELSE 'dd000000-0000-4000-8000-000000000034'::uuid END,
  CASE WHEN v.stype = 'sim' THEN v.platform END,
  v.packs, v.crashes, v.note
FROM (VALUES
  ('aa000000-0000-4000-8000-000000000004', 3,  'real', 15, NULL, NULL, 1, 0, 'Baby quad park rip'),
  ('aa000000-0000-4000-8000-000000000004', 8,  'real', 20, NULL, NULL, 2, 0, NULL),
  ('aa000000-0000-4000-8000-000000000004', 16, 'sim',  25, NULL, 'VelociDrone', 0, 0, NULL),
  ('aa000000-0000-4000-8000-000000000004', 30, 'real', 15, NULL, NULL, 1, 0, NULL),
  ('aa000000-0000-4000-8000-000000000005', 4,  'real', 10, NULL, NULL, 1, 0, 'Indoor whoop session'),
  ('aa000000-0000-4000-8000-000000000005', 12, 'sim',  20, NULL, 'Liftoff', 0, 0, NULL),
  ('aa000000-0000-4000-8000-000000000005', 26, 'real', 15, NULL, NULL, 2, 1, 'Wall tap')
) AS v(uid, days_ago, stype, mins, drone_tail, platform, packs, crashes, note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sessions s
  WHERE s.user_id = v.uid::uuid
    AND s.flown_on = (CURRENT_DATE - v.days_ago)::text
    AND s.session_type = v.stype::session_type
    AND s.duration_minutes = v.mins
);

-- ---------------------------------------------------------------------------
-- 5. Maintenance logs — service history + parseable failure reports.
--    Personal logs feed personal (Pro) failure analytics; org logs feed
--    squadron (Enterprise) analytics. First line must match
--    "Failure: <reason> · Part: <part> · Category: <bucket>".
-- ---------------------------------------------------------------------------
INSERT INTO personal_gear.maintenance_logs (id, user_id, gear_id, description, cost, reset_service_clock, performed_on)
VALUES
  ('dd000000-0000-4000-8000-000000000201'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000001'::uuid,
   'Failure: Tree strike · Part: HQ 5x4.3x3 props · Category: Other
Swapped two props, checked arms — straight.', 12.00, false, now() - interval '6 days'),
  ('dd000000-0000-4000-8000-000000000202'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000002'::uuid,
   'Failure: Motor bearing seizure · Part: ECO II 2306 front-left · Category: Motors
Replaced motor with bench spare.', 24.99, true, now() - interval '39 days'),
  ('dd000000-0000-4000-8000-000000000203'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000002'::uuid,
   'Failure: Hard landing · Part: Source One arm · Category: Frames
Zip-tied the crack; new arm set on order.', 0, false, now() - interval '10 days'),
  ('dd000000-0000-4000-8000-000000000204'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000001'::uuid,
   'Full service: cleaned, new props, gimbal check. Service clock reset.', 18.00, true, now() - interval '60 days'),
  ('dd000000-0000-4000-8000-000000000205'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid, 'dd000000-0000-4000-8000-000000000003'::uuid,
   'Failure: Gate clip · Part: Runcam Nano 6 · Category: VTX/Camera
Camera tilt knocked out; re-set and confirmed.', 0, false, now() - interval '6 days'),
  ('dd000000-0000-4000-8000-000000000206'::uuid, 'aa000000-0000-4000-8000-000000000004'::uuid, 'dd000000-0000-4000-8000-000000000004'::uuid,
   'Routine: tightened standoff screws.', 0, false, now() - interval '16 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_gear.maintenance_logs (id, team_id, user_id, gear_id, description, cost, reset_service_clock, performed_on)
VALUES
  ('cc000000-0000-4000-8000-000000000201'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000002'::uuid,
   'Failure: Tree strike · Part: Source One arm set · Category: Frames
Arm replaced from bench stock.', 24.99, true, now() - interval '12 days'),
  ('cc000000-0000-4000-8000-000000000202'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid,
   'Failure: ESC desync · Part: SpeedyBee 45A rear · Category: ESCs
Swapped ESC from the bench, bench spare re-ordered.', 38.50, true, now() - interval '20 days'),
  ('cc000000-0000-4000-8000-000000000203'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid,
   'Failure: Mid-air collision · Part: AX2306.5 motor C · Category: Motors
Bent shaft; replaced from bench.', 32.99, true, now() - interval '31 days'),
  ('cc000000-0000-4000-8000-000000000204'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid, 'cc000000-0000-4000-8000-000000000003'::uuid,
   'Failure: Battery failure · Part: Fleet CNHL pack #3 · Category: Other
Puff pack pulled from rotation.', 0, false, now() - interval '8 days'),
  ('cc000000-0000-4000-8000-000000000205'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000002'::uuid,
   'Failure: Hard landing · Part: Runcam Nano 6 · Category: VTX/Camera
Lens cracked; spare installed.', 44.95, false, now() - interval '26 days'),
  ('cc000000-0000-4000-8000-000000000206'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid,
   'Routine service: full checkout and cleanup. Service clock reset.', 15.00, true, now() - interval '45 days'),
  ('cc000000-0000-4000-8000-000000000207'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000003'::uuid,
   'Failure: Ground crash on launch · Part: Mobula6 canopy · Category: Other
Canopy zip tie replaced.', 2.50, false, now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Part installs — history for the parts panels (uninstalled rows are
--    the repair evidence; shelf rows stay available stock)
-- ---------------------------------------------------------------------------
INSERT INTO org_gear.drone_part_installs (id, team_id, user_id, drone_id, part_id, quantity, installed_at, uninstalled_at, removal_reason, notes)
VALUES
  ('cc000000-0000-4000-8000-000000000301'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000002'::uuid, 'cc000000-0000-4000-8000-000000000043'::uuid, 1, now() - interval '12 days', now() - interval '12 days' + interval '2 hours', 'broken', 'Arm snapped on the tree strike — replaced same day'),
  ('cc000000-0000-4000-8000-000000000302'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000042'::uuid, 1, now() - interval '20 days', now() - interval '20 days' + interval '1 hour', 'broken', 'ESC desync — swapped from bench'),
  ('cc000000-0000-4000-8000-000000000303'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000041'::uuid, 1, now() - interval '31 days', now() - interval '31 days' + interval '3 hours', 'broken', 'Bent shaft from mid-air'),
  ('cc000000-0000-4000-8000-000000000304'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000002'::uuid, 'cc000000-0000-4000-8000-000000000044'::uuid, 1, now() - interval '26 days', now() - interval '26 days' + interval '30 minutes', 'broken', 'Cracked lens'),
  ('cc000000-0000-4000-8000-000000000305'::uuid, 'bb000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000045'::uuid, 2, now() - interval '6 days', NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personal_gear.drone_part_installs (id, user_id, drone_id, part_id, quantity, installed_at, uninstalled_at, removal_reason, notes)
VALUES
  ('dd000000-0000-4000-8000-000000000301'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000002'::uuid, 'dd000000-0000-4000-8000-000000000051'::uuid, 1, now() - interval '39 days', now() - interval '39 days' + interval '2 hours', 'broken', 'Seized bearing'),
  ('dd000000-0000-4000-8000-000000000302'::uuid, 'aa000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000053'::uuid, 2, now() - interval '6 days', NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Update the landing page copy? No — just re-assert the fixture tiers
--    (defensive: keeps owner=pro / admin=enterprise even if someone
--    tampered through the UI).
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET tier = v.tier, role = v.role
FROM (VALUES
  ('aa000000-0000-4000-8000-000000000001'::uuid, 'user', 'pro'),
  ('aa000000-0000-4000-8000-000000000002'::uuid, 'user', 'pro'),
  ('aa000000-0000-4000-8000-000000000003'::uuid, 'user', 'free'),
  ('aa000000-0000-4000-8000-000000000004'::uuid, 'user', 'free'),
  ('aa000000-0000-4000-8000-000000000005'::uuid, 'user', 'free'),
  ('aa000000-0000-4000-8000-000000000006'::uuid, 'admin', 'enterprise')
) AS v(id, role, tier)
WHERE p.id = v.id;
