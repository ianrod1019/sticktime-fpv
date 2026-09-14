-- ============================================================
-- Migration: Scheduling demo seed (dev/test fixture)
--
-- Marks "RBAC Test Squadron" as having purchased the Scheduling Add-On,
-- grants the can_schedule capability to one member (member2 — the
-- "authorized instructor" case), and inserts a week of demo bookings
-- reusing the org fleet + cast from 20260926130000_demo_flight_data.
--
-- Dev/test fixture — DO NOT RUN ON PROD.
-- Idempotent: fixed uuid literals + WHERE NOT EXISTS on every insert.
-- Depends on: 20260914120000_scheduling_module.sql,
--             20260926010000_seed_org_role_test_accounts.sql,
--             20260926130000_demo_flight_data.sql
-- ============================================================

-- Fixed uuids (same namespaces as the existing seeds):
--   squadron/team : bb000000-0000-4000-8000-000000000001
--   users         : aa000000-0000-4000-8000-0000000000 01..06
--   org drones    : cc000000-0000-4000-8000-0000000000 01..03
--   org batteries : cc000000-0000-4000-8000-0000000000 11..12
--   schedules     : ff000000-0000-4000-8000-0000000000 01..07

-- ---------------------------------------------------------------------------
-- 1. The org purchased the Scheduling Add-On
-- ---------------------------------------------------------------------------
INSERT INTO edu.organization_addons (team_id, scheduling_enabled, enabled_at)
VALUES ('bb000000-0000-4000-8000-000000000001'::uuid, true, now())
ON CONFLICT (team_id) DO UPDATE
  SET scheduling_enabled = true,
      enabled_at = COALESCE(edu.organization_addons.enabled_at, now());

-- ---------------------------------------------------------------------------
-- 2. member2 is the "authorized instructor": can_schedule granted directly
--    (owner/manager already manage by role; member stays read-only)
-- ---------------------------------------------------------------------------
UPDATE public.team_members
SET can_schedule = true
WHERE team_id = 'bb000000-0000-4000-8000-000000000001'::uuid
  AND user_id = 'aa000000-0000-4000-8000-000000000004'::uuid
  AND (can_schedule IS DISTINCT FROM true);

-- ---------------------------------------------------------------------------
-- 3. Demo bookings — next 7 days from the seed run, anchored to date_trunc
--    'week' so repeated `supabase db reset` produces a stable-looking week.
--    Friday's race day intentionally books the SAME airframe + battery
--    back-to-back (13-15, 15-17): legal under the [) exclusion ranges and
--    it demonstrates the boundary in the rendered calendar. Section 4
--    probes the actual violation path.
-- ---------------------------------------------------------------------------
INSERT INTO edu.schedules
  (id, organization_id, event_title, description, assigned_user_id,
   airframe_id, battery_id, start_time, end_time, status, created_by)
SELECT
  v.id::uuid,
  'bb000000-0000-4000-8000-000000000001'::uuid,
  v.title,
  v.descr,
  v.assignee::uuid,
  v.airframe::uuid,
  v.battery::uuid,
  (date_trunc('week', now()) + v.day_offset * interval '1 day' + v.start_hour * interval '1 hour'),
  (date_trunc('week', now()) + v.day_offset * interval '1 day' + v.end_hour * interval '1 hour'),
  v.status,
  'aa000000-0000-4000-8000-000000000001'::uuid -- created by the owner
FROM (VALUES
  -- Monday: Tinywhoop trainer class, morning (member2 = instructor w/ grant)
  ('ff000000-0000-4000-8000-000000000001',
   'Tinywhoop Trainer Class',
   'Intro FPV — gym drones, batteries 11 + 12 rotated',
   'aa000000-0000-4000-8000-000000000004',
   'cc000000-0000-4000-8000-000000000003',
   'cc000000-0000-4000-8000-000000000011',
   1, 9, 11, 'scheduled'),

  -- Tuesday: freestyle practice (manager)
  ('ff000000-0000-4000-8000-000000000002',
   'Freestyle Practice',
   'Flow laps on the back field. Fleet Freestyle 6" + CNHL packs.',
   'aa000000-0000-4000-8000-000000000002',
   'cc000000-0000-4000-8000-000000000002',
   'cc000000-0000-4000-8000-000000000011',
   2, 16, 18, 'scheduled'),

  -- Wednesday: racer checkout (owner)
  ('ff000000-0000-4000-8000-000000000003',
   'Squadron Racer Checkout',
   'Pre-race inspection and practice heats.',
   'aa000000-0000-4000-8000-000000000001',
   'cc000000-0000-4000-8000-000000000001',
   'cc000000-0000-4000-8000-000000000012',
   3, 17, 19, 'scheduled'),

  -- Thursday: ground school — no hardware, pure instruction (member2)
  ('ff000000-0000-4000-8000-000000000004',
   'Ground School: Airspace & Regs',
   'Classroom session — no airframes reserved.',
   'aa000000-0000-4000-8000-000000000004',
   NULL, NULL,
   4, 15, 16.5, 'scheduled'),

  -- Friday: race day double-header, two bookings, sequential battery use
  ('ff000000-0000-4000-8000-000000000005',
   'Race Day — Heats 1-3',
   'Squadron Racer + Tattu pack, heats one through three.',
   'aa000000-0000-4000-8000-000000000003',
   'cc000000-0000-4000-8000-000000000001',
   'cc000000-0000-4000-8000-000000000012',
   5, 13, 15, 'scheduled'),

  ('ff000000-0000-4000-8000-000000000006',
   'Race Day — Finals',
   'Same airframe, fresh battery set. Back-to-back slot.',
   'aa000000-0000-4000-8000-000000000006', -- RBAC Admin: org member (the
   -- schedules_manager_update policy re-checks is_org_member_user on every
   -- update; assigning a non-member would make the row undeletable/uneditable)
   'cc000000-0000-4000-8000-000000000001',
   'cc000000-0000-4000-8000-000000000012',
   5, 15, 17, 'scheduled'),

  -- Last week: a completed booking for history rendering
  ('ff000000-0000-4000-8000-000000000007',
   'Tinywhoop Trainer Class',
   'Previous class — completed.',
   'aa000000-0000-4000-8000-000000000004',
   'cc000000-0000-4000-8000-000000000003',
   'cc000000-0000-4000-8000-000000000011',
   -7, 9, 11, 'completed')
) AS v(id, title, descr, assignee, airframe, battery, day_offset, start_hour, end_hour, status)
WHERE NOT EXISTS (
  SELECT 1 FROM edu.schedules s WHERE s.id = v.id::uuid
);

-- ---------------------------------------------------------------------------
-- 4. Sanity: the constraint demo — inserting an overlapping booking for the
--    same battery must fail. Wrapped so the seed SUCCEEDS only when the
--    constraint fires (then rolls the probe back). Skipped silently if the
--    demo rows above were already present (probe would double-book).
-- ---------------------------------------------------------------------------
DO $probe$
DECLARE
  v_conflict_count int;
BEGIN
  IF EXISTS (SELECT 1 FROM edu.schedules WHERE id = 'ff000000-0000-4000-8000-000000000002'::uuid)
     AND EXISTS (SELECT 1 FROM edu.schedules WHERE id = 'ff000000-0000-4000-8000-000000000001'::uuid)
     AND NOT EXISTS (
       SELECT 1 FROM edu.schedules
       WHERE event_title = 'PROBE battery double-book attempt'
     ) THEN
    BEGIN
      INSERT INTO edu.schedules
        (organization_id, event_title, assigned_user_id, airframe_id, battery_id,
         start_time, end_time, status, created_by)
      SELECT organization_id, 'PROBE battery double-book attempt', assigned_user_id,
             airframe_id, battery_id, start_time + interval '30 minutes',
             end_time + interval '30 minutes', 'scheduled', created_by
      FROM edu.schedules
      WHERE id = 'ff000000-0000-4000-8000-000000000002'::uuid;

      -- If we got here the constraint did NOT fire — hard fail the seed.
      SELECT count(*) INTO v_conflict_count
      FROM edu.schedules WHERE event_title = 'PROBE battery double-book attempt';
      IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'Seed integrity failure: battery double-book was NOT rejected';
      END IF;
    EXCEPTION
      WHEN exclusion_violation THEN
        -- Expected: the storage-layer double-booking guard fired.
        RAISE NOTICE 'Seed probe OK: overlapping battery booking rejected (23P01)';
    END;
  END IF;
END
$probe$;

-- ============================================================
-- End of migration
-- ============================================================
