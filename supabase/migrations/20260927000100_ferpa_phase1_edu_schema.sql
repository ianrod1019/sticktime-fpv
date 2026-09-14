-- ============================================================
-- Migration: FERPA Phase 1 — edu schema: institutional tenancy
--
-- The two-plane model: institutional data lives in its own `edu` schema
-- and shares ONLY the auth identity with the consumer product. Personal
-- data (sessions, gear, squadrons) keeps its existing auth.uid() RLS
-- guarantees; no policy here touches a personal-plane table.
--
-- Tenancy: districts → schools → memberships → instructor assignments.
--
-- Design invariants:
--   * MINIMIZATION — no free-text PII beyond the operational minimum.
--     Student/staff display names are callsigns (pilot_settings), not
--     real names. Roster emails are school-issued and stored only in the
--     pending-roster staging table (never denormalized elsewhere).
--   * SINGLE-COMPARISON ISOLATION — edu.memberships carries a
--     denormalized district_id, stamped by trigger from the school.
--     Every RLS predicate reduces to "same district_id".
--   * NON-ENUMERATION — list RPCs are school-scoped and membership-
--     gated; there is no RPC that lists all districts or all schools.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS edu;
GRANT USAGE ON SCHEMA edu TO authenticated;
REVOKE ALL ON SCHEMA edu FROM anon, public;

-- ---------------------------------------------------------------------------
-- 1. Tenancy tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.districts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  state         text,
  contract_status text NOT NULL DEFAULT 'active'
                CHECK (contract_status IN ('active', 'terminating', 'terminated')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS edu.schools (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id   uuid NOT NULL REFERENCES edu.districts(id) ON DELETE CASCADE,
  name          text NOT NULL,
  site_code     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edu_schools_district ON edu.schools(district_id);

CREATE TYPE edu.edu_role AS ENUM ('student', 'instructor', 'school_admin', 'district_admin');

-- Memberships carry the denormalized district_id — the column every
-- isolation decision reduces to. Written only through definer RPCs.
CREATE TABLE IF NOT EXISTS edu.memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id     uuid NOT NULL REFERENCES edu.schools(id) ON DELETE CASCADE,
  district_id   uuid NOT NULL REFERENCES edu.districts(id) ON DELETE CASCADE,
  edu_role      edu.edu_role NOT NULL,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- A user holds at most one active institutional role per school.
  CONSTRAINT edu_memberships_one_active_per_school
    UNIQUE (school_id, user_id, status)
);
CREATE INDEX IF NOT EXISTS idx_edu_memberships_district ON edu.memberships(district_id);
CREATE INDEX IF NOT EXISTS idx_edu_memberships_user     ON edu.memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_edu_memberships_school   ON edu.memberships(school_id);

-- Instructor ↔ student assignments. Scoped by school AND district so a
-- mis-scoped pair cannot exist. History via ended_at.
CREATE TABLE IF NOT EXISTS edu.instructor_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_membership_id uuid NOT NULL
                   REFERENCES edu.memberships(id) ON DELETE CASCADE,
  student_membership_id    uuid NOT NULL
                   REFERENCES edu.memberships(id) ON DELETE CASCADE,
  school_id        uuid NOT NULL REFERENCES edu.schools(id) ON DELETE CASCADE,
  district_id      uuid NOT NULL REFERENCES edu.districts(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  CONSTRAINT edu_instructor_assignments_no_self
    CHECK (instructor_membership_id <> student_membership_id)
);
-- One OPEN assignment per instructor/student pair (NULLs are distinct in
-- unique constraints, so the open case needs a partial index).
CREATE UNIQUE INDEX IF NOT EXISTS edu_assignments_open_unique
  ON edu.instructor_assignments (instructor_membership_id, student_membership_id)
  WHERE ended_at IS NULL;

-- The student who owns the assignment and the instructor who received it
-- must both belong to the same school — and therefore the same district.
CREATE OR REPLACE FUNCTION edu.validate_instructor_assignment()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'edu'
  AS $function$
DECLARE
  v_student_school uuid;
  v_student_district uuid;
BEGIN
  SELECT school_id, district_id INTO v_student_school, v_student_district
    FROM edu.memberships WHERE id = NEW.student_membership_id;
  IF v_student_school IS NULL
     OR v_student_school <> NEW.school_id
     OR v_student_district <> NEW.district_id THEN
    RAISE EXCEPTION 'assignment must pair members of the same school';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS edu_validate_instructor_assignment
  ON edu.instructor_assignments;
CREATE TRIGGER edu_validate_instructor_assignment
  BEFORE INSERT OR UPDATE OF student_membership_id, school_id, district_id
  ON edu.instructor_assignments
  FOR EACH ROW EXECUTE FUNCTION edu.validate_instructor_assignment();

CREATE INDEX IF NOT EXISTS idx_edu_assignments_instructor ON edu.instructor_assignments(instructor_membership_id);
CREATE INDEX IF NOT EXISTS idx_edu_assignments_student    ON edu.instructor_assignments(student_membership_id);
CREATE INDEX IF NOT EXISTS idx_edu_assignments_district   ON edu.instructor_assignments(district_id);

-- Denormalize district_id onto memberships (school → district), kept
-- truthful by trigger. This is what makes every RLS check one comparison.
CREATE OR REPLACE FUNCTION edu.stamp_membership_district()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'edu'
  AS $function$
DECLARE
  v_district uuid;
BEGIN
  SELECT district_id INTO v_district FROM edu.schools WHERE id = NEW.school_id;
  IF v_district IS NULL THEN
    RAISE EXCEPTION 'school % does not exist', NEW.school_id;
  END IF;
  NEW.district_id := v_district;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS edu_stamp_membership_district
  ON edu.memberships;
CREATE TRIGGER edu_stamp_membership_district
  BEFORE INSERT OR UPDATE OF school_id ON edu.memberships
  FOR EACH ROW EXECUTE FUNCTION edu.stamp_membership_district();

-- ---------------------------------------------------------------------------
-- 2. Pending roster staging — the enrollment queue
-- ---------------------------------------------------------------------------
-- School admins queue enrollments here; the provision step (server-side)
-- matches a row by email, links the account, and clears the PII column.
-- Emails never leave this table; nothing else in edu stores one.
CREATE TABLE IF NOT EXISTS edu.pending_roster (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES edu.schools(id) ON DELETE CASCADE,
  district_id   uuid NOT NULL REFERENCES edu.districts(id) ON DELETE CASCADE,
  school_email  text NOT NULL,
  edu_role      edu.edu_role NOT NULL
                CHECK (edu_role IN ('student', 'instructor', 'school_admin')),
  display_name  text,
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edu_pending_roster_unique_queue
    UNIQUE (school_id, school_email),
  CONSTRAINT edu_pending_roster_email_format
    CHECK (school_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
CREATE INDEX IF NOT EXISTS idx_edu_pending_roster_school ON edu.pending_roster(school_id);

CREATE OR REPLACE FUNCTION edu.lowercase_pending_email()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'edu'
  AS $function$
BEGIN
  NEW.school_email := lower(btrim(NEW.school_email));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS edu_lowercase_pending_email ON edu.pending_roster;
CREATE TRIGGER edu_lowercase_pending_email
  BEFORE INSERT OR UPDATE OF school_email ON edu.pending_roster
  FOR EACH ROW EXECUTE FUNCTION edu.lowercase_pending_email();

-- ---------------------------------------------------------------------------
-- 3. Guard functions — SECURITY DEFINER, pinned search_path, STABLE
-- ---------------------------------------------------------------------------
-- edu.can_view_student: the single decision point for cross-member record
-- access. Self, assigned instructor, school admin, or district admin of
-- the SAME district. Nothing else returns true.
CREATE OR REPLACE FUNCTION edu.can_view_student(_viewer uuid, _student_user uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'edu'
  AS $function$
DECLARE
  v_student_district uuid;
BEGIN
  IF _viewer IS NULL OR _student_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT m.district_id INTO v_student_district
    FROM edu.memberships m
   WHERE m.user_id = _student_user
     AND m.edu_role = 'student'
     AND m.status = 'active'
   LIMIT 1;

  IF v_student_district IS NULL THEN
    RETURN false;
  END IF;

  -- Self (any active membership in the student's district).
  IF EXISTS (
    SELECT 1 FROM edu.memberships m
     WHERE m.user_id = _viewer
       AND m.district_id = v_student_district
       AND m.status = 'active'
  ) AND _viewer = _student_user THEN
    RETURN true;
  END IF;

  -- Assigned instructor (open assignment, same district by construction).
  -- The instructor's own membership must still be ACTIVE: archiving a
  -- membership must end record access even if an assignment was left open.
  IF EXISTS (
    SELECT 1
      FROM edu.instructor_assignments ia
      JOIN edu.memberships mi ON mi.id = ia.instructor_membership_id
     WHERE ia.student_membership_id IN (
             SELECT id FROM edu.memberships
              WHERE user_id = _student_user AND edu_role = 'student'
           )
       AND mi.user_id = _viewer
       AND mi.status = 'active'
       AND ia.ended_at IS NULL
       AND ia.district_id = v_student_district
  ) THEN
    RETURN true;
  END IF;

  -- School admin of a school the student attends.
  IF EXISTS (
    SELECT 1
      FROM edu.memberships ma
      JOIN edu.memberships ms ON ms.user_id = _student_user
                             AND ms.edu_role = 'student'
                             AND ms.status = 'active'
     WHERE ma.user_id = _viewer
       AND ma.edu_role = 'school_admin'
       AND ma.status = 'active'
       AND ma.school_id = ms.school_id
       AND ma.district_id = v_student_district
  ) THEN
    RETURN true;
  END IF;

  -- District admin of the student's district.
  IF EXISTS (
    SELECT 1 FROM edu.memberships m
     WHERE m.user_id = _viewer
       AND m.edu_role = 'district_admin'
       AND m.status = 'active'
       AND m.district_id = v_student_district
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION edu.is_district_admin(_district uuid, _user uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'edu'
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM edu.memberships
     WHERE user_id = _user
       AND district_id = _district
       AND edu_role = 'district_admin'
       AND status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION edu.is_school_admin(_school uuid, _user uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'edu'
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM edu.memberships
     WHERE user_id = _user
       AND school_id = _school
       AND edu_role = 'school_admin'
       AND status = 'active'
  );
$function$;

-- Membership lookups from inside RLS policies MUST go through helpers
-- like these: a policy on edu.memberships that sub-queries edu.memberships
-- directly causes "infinite recursion detected in policy". The helpers are
-- SECURITY DEFINER, so their reads bypass RLS and terminate the cycle.

-- Any active membership in the district (gate for district-scoped reads).
CREATE OR REPLACE FUNCTION edu.is_active_district_member(_district uuid, _user uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'edu'
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM edu.memberships
     WHERE user_id = _user
       AND district_id = _district
       AND status = 'active'
  );
$function$;

-- Active STAFF membership in the district (instructors, school/district
-- admins) — gates staff-list visibility so students cannot enumerate staff.
CREATE OR REPLACE FUNCTION edu.is_district_staff(_district uuid, _user uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'edu'
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM edu.memberships
     WHERE user_id = _user
       AND district_id = _district
       AND status = 'active'
       AND edu_role IN ('instructor', 'school_admin', 'district_admin')
  );
$function$;

-- May _user see this assignment row? District staff of the assignment's
-- district, or the instructor/student of the assignment themselves.
CREATE OR REPLACE FUNCTION edu.can_view_assignment(
  _district uuid,
  _instructor_membership uuid,
  _student_membership uuid,
  _user uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'edu'
  AS $function$
  SELECT edu.is_district_staff(_district, _user)
     OR EXISTS (
       SELECT 1 FROM edu.memberships
        WHERE id IN (_instructor_membership, _student_membership)
          AND user_id = _user
     );
$function$;

-- ---------------------------------------------------------------------------
-- 4. RLS — every policy reduces to the district comparison
-- ---------------------------------------------------------------------------
ALTER TABLE edu.districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE edu.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE edu.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE edu.instructor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE edu.pending_roster ENABLE ROW LEVEL SECURITY;

-- Districts: visible only to that district's members. (All membership
-- lookups route through definer helpers to avoid policy self-reference.)
DROP POLICY IF EXISTS "edu districts visible to district members" ON edu.districts;
CREATE POLICY "edu districts visible to district members"
  ON edu.districts FOR SELECT
  TO authenticated
  USING (edu.is_active_district_member(districts.id, auth.uid()));

-- Schools: same-district members only. Admin writes go through definer
-- RPCs, so the only direct grant is SELECT.
DROP POLICY IF EXISTS "edu schools visible to district members" ON edu.schools;
CREATE POLICY "edu schools visible to district members"
  ON edu.schools FOR SELECT
  TO authenticated
  USING (edu.is_active_district_member(schools.district_id, auth.uid()));

-- Memberships: yourself always; students you are allowed to view; staff
-- visible to their district's staff (students cannot enumerate staff).
DROP POLICY IF EXISTS "edu memberships readable per role" ON edu.memberships;
CREATE POLICY "edu memberships readable per role"
  ON edu.memberships FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      edu_role = 'student'
      AND edu.can_view_student(auth.uid(), user_id)
    )
    OR (
      edu_role IN ('instructor', 'school_admin', 'district_admin')
      AND edu.is_district_staff(memberships.district_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "edu memberships staff insert" ON edu.memberships;
CREATE POLICY "edu memberships staff insert"
  ON edu.memberships FOR INSERT
  TO authenticated
  WITH CHECK (edu.is_district_admin(district_id, auth.uid()));

DROP POLICY IF EXISTS "edu memberships staff update" ON edu.memberships;
CREATE POLICY "edu memberships staff update"
  ON edu.memberships FOR UPDATE
  TO authenticated
  USING (edu.is_district_admin(district_id, auth.uid()))
  WITH CHECK (edu.is_district_admin(district_id, auth.uid()));

-- Assignments: readable within district (via helper; participants also
-- see their own rows). Writes go through definer RPCs, which also audit.
DROP POLICY IF EXISTS "edu assignments readable in district" ON edu.instructor_assignments;
CREATE POLICY "edu assignments readable in district"
  ON edu.instructor_assignments FOR SELECT
  TO authenticated
  USING (
    edu.can_view_assignment(
      instructor_assignments.district_id,
      instructor_assignments.instructor_membership_id,
      instructor_assignments.student_membership_id,
      auth.uid()
    )
  );

DROP POLICY IF EXISTS "edu assignments staff insert" ON edu.instructor_assignments;
CREATE POLICY "edu assignments staff insert"
  ON edu.instructor_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    edu.is_district_admin(district_id, auth.uid())
    OR edu.is_school_admin(school_id, auth.uid())
  );

-- Ending an assignment: same staff gate, update-only (history via ended_at).
DROP POLICY IF EXISTS "edu assignments staff update" ON edu.instructor_assignments;
CREATE POLICY "edu assignments staff update"
  ON edu.instructor_assignments FOR UPDATE
  TO authenticated
  USING (
    edu.is_district_admin(district_id, auth.uid())
    OR edu.is_school_admin(school_id, auth.uid())
  )
  WITH CHECK (
    edu.is_district_admin(district_id, auth.uid())
    OR edu.is_school_admin(school_id, auth.uid())
  );

-- Pending roster: the school's admin sees their own school's queue.
-- (edu.is_school_admin is also referenced by the insert/delete policies —
-- it reads edu.memberships through a definer helper, so no recursion.)
DROP POLICY IF EXISTS "edu pending roster school-admin" ON edu.pending_roster;
CREATE POLICY "edu pending roster school-admin"
  ON edu.pending_roster FOR SELECT
  TO authenticated
  USING (
    edu.is_school_admin(pending_roster.school_id, auth.uid())
    OR edu.is_district_admin(pending_roster.district_id, auth.uid())
  );

DROP POLICY IF EXISTS "edu pending roster staff insert" ON edu.pending_roster;
CREATE POLICY "edu pending roster staff insert"
  ON edu.pending_roster FOR INSERT
  TO authenticated
  WITH CHECK (
    edu.is_school_admin(school_id, auth.uid())
    OR edu.is_district_admin(district_id, auth.uid())
  );

DROP POLICY IF EXISTS "edu pending roster staff delete" ON edu.pending_roster;
CREATE POLICY "edu pending roster staff delete"
  ON edu.pending_roster FOR DELETE
  TO authenticated
  USING (
    edu.is_school_admin(school_id, auth.uid())
    OR edu.is_district_admin(district_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. DML grants: RPCs are the write path; direct writes are narrow and
--    policy-gated. Reads granted per table for the RLS policies above.
-- ---------------------------------------------------------------------------
REVOKE ALL ON edu.districts, edu.schools, edu.memberships,
             edu.instructor_assignments, edu.pending_roster
  FROM anon, public;
GRANT SELECT ON edu.districts, edu.schools, edu.memberships,
                edu.instructor_assignments, edu.pending_roster
  TO authenticated;
GRANT INSERT, UPDATE ON edu.memberships TO authenticated;
GRANT INSERT, UPDATE ON edu.instructor_assignments TO authenticated;
GRANT INSERT, DELETE ON edu.pending_roster TO authenticated;

-- ============================================================
-- End of migration
-- ============================================================
