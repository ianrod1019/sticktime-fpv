-- ============================================================
-- Migration: firmware — registry & taxonomy (module 1 of 3)
--
-- The Firmware, Configuration & Electronic Component Version
-- Control module. Dedicated schema (house pattern: certs, sms,
-- edu, org_gear), exposed through SECURITY DEFINER RPCs in the
-- public schema (public.firmware_*) so no dashboard API-schema
-- click is required for the hosted project.
--
-- This file: the SHARED registry plane — manufacturers, firmware
-- families, hardware targets, releases and their capability maps.
-- Registry rows are global reference data (like a parts catalog):
-- every enterprise org member can read, nobody but site admins/devs
-- and future admin tooling writes. Tenant fleet state lives in
-- module 2; workflows/interlocks in module 3.
--
-- Release lifecycle: approved | provisional | restricted | blacklisted.
--   approved     — cleared for fleet installation
--   provisional  — new, pending safety-manager review
--   restricted   — permitted only with an explicit note (EOL etc.)
--   blacklisted  — NEVER installed; installed copies ground the airframe
-- ============================================================

CREATE SCHEMA IF NOT EXISTS firmware;

-- ---------------------------------------------------------------------------
-- 1. Reference taxonomy
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS firmware.manufacturers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,
  support_url       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS firmware.families (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id   uuid NOT NULL REFERENCES firmware.manufacturers(id) ON DELETE CASCADE,
  name              text NOT NULL,          -- Betaflight, ArduPilot, DJI OEM, ...
  docs_url          text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manufacturer_id, name)
);

CREATE TABLE IF NOT EXISTS firmware.hardware_targets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         uuid NOT NULL REFERENCES firmware.families(id) ON DELETE CASCADE,
  target_key        text NOT NULL,          -- stm32f722, matekh743, o3_air_unit, ...
  description       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, target_key)
);

CREATE TABLE IF NOT EXISTS firmware.firmware_releases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id         uuid NOT NULL REFERENCES firmware.hardware_targets(id) ON DELETE CASCADE,
  version           text NOT NULL,
  -- dotted-numeric sort key, e.g. {4,5,1} for "4.5.1" (kept in sync by the
  -- writer; enables ORDER BY without string comparison pitfalls)
  version_sort_key  numeric[] NOT NULL DEFAULT '{}'::numeric[],
  release_status    text NOT NULL DEFAULT 'provisional'
                    CHECK (release_status IN ('approved','provisional','restricted','blacklisted')),
  certified         boolean NOT NULL DEFAULT false,
  release_url       text,
  sha256            text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_id, version)
);

CREATE INDEX IF NOT EXISTS idx_firmware_releases_target
  ON firmware.firmware_releases(target_id, version_sort_key DESC);

-- Capability map — what a given release brings on its target
-- (gps_rescue, blackbox, fence, rtl, telemetry, hd_link, ...).
CREATE TABLE IF NOT EXISTS firmware.release_capabilities (
  release_id        uuid NOT NULL REFERENCES firmware.firmware_releases(id) ON DELETE CASCADE,
  capability        text NOT NULL,
  PRIMARY KEY (release_id, capability)
);

-- ---------------------------------------------------------------------------
-- 2. Registry visibility: any enterprise org member (or site staff).
--    Mirrors the certs-vault access model — the enterprise role plane
--    (public.ent_*) is the single source of role truth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION firmware.can_read_registry()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.ent_is_site_admin() OR EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE public.ent_is_org_member(o.id)
  );
$$;

ALTER TABLE firmware.manufacturers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmware.families           ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmware.hardware_targets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmware.firmware_releases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmware.release_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registry_select ON firmware.manufacturers;
CREATE POLICY registry_select ON firmware.manufacturers FOR SELECT
  TO authenticated USING (firmware.can_read_registry());
DROP POLICY IF EXISTS registry_select ON firmware.families;
CREATE POLICY registry_select ON firmware.families FOR SELECT
  TO authenticated USING (firmware.can_read_registry());
DROP POLICY IF EXISTS registry_select ON firmware.hardware_targets;
CREATE POLICY registry_select ON firmware.hardware_targets FOR SELECT
  TO authenticated USING (firmware.can_read_registry());
DROP POLICY IF EXISTS registry_select ON firmware.firmware_releases;
CREATE POLICY registry_select ON firmware.firmware_releases FOR SELECT
  TO authenticated USING (firmware.can_read_registry());
DROP POLICY IF EXISTS registry_select ON firmware.release_capabilities;
CREATE POLICY registry_select ON firmware.release_capabilities FOR SELECT
  TO authenticated USING (firmware.can_read_registry());

-- Writes: registry is reference data — no direct authenticated writes.
-- Site admins/devs mutate via SQL/admin tooling (service role bypasses RLS).

-- ---------------------------------------------------------------------------
-- 3. Seed — representative multi-manufacturer registry so the module is
--    demonstrable and the playtest has a blacklisted release to trip over.
--    Idempotent: natural-key ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------

INSERT INTO firmware.manufacturers (name, support_url) VALUES
  ('Betaflight',   'https://betaflight.com/support'),
  ('ArduPilot',    'https://ardupilot.org'),
  ('INAV',         'https://inav-flight.com'),
  ('DJI',          'https://www.dji.com/support'),
  ('SpeedyBee',    'https://www.speedybee.com')
ON CONFLICT (name) DO NOTHING;

INSERT INTO firmware.families (manufacturer_id, name, docs_url)
SELECT m.id, v.name, v.docs
FROM firmware.manufacturers m
JOIN (VALUES
  ('Betaflight', 'Betaflight', 'https://betaflight.com/docs/wiki'),
  ('ArduPilot',  'ArduPilot Copter', 'https://ardupilot.org/copter/docs'),
  ('ArduPilot',  'ArduPilot Rover', 'https://ardupilot.org/rover/docs'),
  ('INAV',       'INAV', 'https://github.com/iNavFlight/inav/wiki'),
  ('DJI',        'DJI Air Unit OEM', 'https://www.dji.com')
) AS v(mfr, name, docs) ON v.mfr = m.name
ON CONFLICT (manufacturer_id, name) DO NOTHING;

INSERT INTO firmware.hardware_targets (family_id, target_key, description)
SELECT f.id, v.target_key, v.description
FROM firmware.families f
JOIN (VALUES
  ('Betaflight',       'stm32f405', 'F405 flight controllers (e.g. SpeedyBee F405 V4)'),
  ('Betaflight',       'stm32f722', 'F722 flight controllers'),
  ('Betaflight',       'stm32h743', 'H743 flight controllers (e.g. Matek H743)'),
  ('ArduPilot Copter', 'matekh743', 'Matek H743 flight controller'),
  ('ArduPilot Copter', 'pixhawk6c', 'Pixhawk 6C'),
  ('ArduPilot Rover',  'matekh743', 'Matek H743 running Rover'),
  ('INAV',             'stm32f722', 'F722 flight controllers'),
  ('DJI Air Unit OEM', 'o3_air_unit', 'DJI O3 Air Unit / Goggles 2 ecosystem')
) AS v(family, target_key, description) ON v.family = f.name
ON CONFLICT (family_id, target_key) DO NOTHING;

INSERT INTO firmware.firmware_releases
  (target_id, version, version_sort_key, release_status, certified, release_url, notes)
SELECT t.id, v.version, v.sort_key::numeric[], v.status, v.certified, v.url, v.notes
FROM firmware.hardware_targets t
JOIN firmware.families f ON f.id = t.family_id
JOIN (VALUES
  -- Betaflight on F722
  ('Betaflight', 'stm32f722', '4.4.1', '{4,4,1}',   'approved',    true,  'https://github.com/betaflight/betaflight/releases/tag/4.4.1', 'Mature baseline; EOL for new installs but widely validated.'),
  ('Betaflight', 'stm32f722', '4.5.1', '{4,5,1}',   'approved',    true,  'https://github.com/betaflight/betaflight/releases/tag/4.5.1', 'Current fleet standard.'),
  ('Betaflight', 'stm32f722', '4.6.0', '{4,6,0}',   'provisional', false, 'https://github.com/betaflight/betaflight/releases/tag/4.6.0', 'New — pending safety review.'),
  -- Betaflight on H743
  ('Betaflight', 'stm32h743', '4.5.1', '{4,5,1}',   'approved',    true,  'https://github.com/betaflight/betaflight/releases/tag/4.5.1', 'Current fleet standard (H743).'),
  ('Betaflight', 'stm32h743', '4.5.2', '{4,5,2}',   'blacklisted', false, NULL, 'RECALLED — failsafe regression under GPS loss. Installed copies must be flashed back to 4.5.1 before release.'),
  -- Betaflight on F405
  ('Betaflight', 'stm32f405', '4.5.1', '{4,5,1}',   'approved',    true,  'https://github.com/betaflight/betaflight/releases/tag/4.5.1', 'Current fleet standard (F405).'),
  -- ArduPilot Copter
  ('ArduPilot Copter', 'matekh743', '4.5.7', '{4,5,7}', 'approved',    true,  'https://firmware.ardupilot.org/Copter/stable-4.5.7', 'Stable copter release.'),
  ('ArduPilot Copter', 'matekh743', '4.6.2', '{4,6,2}', 'approved',    true,  'https://firmware.ardupilot.org/Copter/stable-4.6.2', 'Current copter standard.'),
  ('ArduPilot Copter', 'pixhawk6c', '4.6.2', '{4,6,2}', 'approved',   true,  'https://firmware.ardupilot.org/Copter/stable-4.6.2', 'Current copter standard.'),
  -- ArduPilot Rover
  ('ArduPilot Rover', 'matekh743', '4.5.7', '{4,5,7}',  'approved',    true,  'https://firmware.ardupilot.org/Rover/stable-4.5.7', 'Stable rover release.'),
  -- INAV
  ('INAV', 'stm32f722', '8.0.1', '{8,0,1}',              'restricted',  false, 'https://github.com/iNavFlight/inav/releases', 'Permitted only for documented long-range builds with safety-manager sign-off.'),
  -- DJI
  ('DJI Air Unit OEM', 'o3_air_unit', '01.04.0300', '{1,4,300}', 'approved',    false, NULL, 'Validated against current fleet Betaflight builds.'),
  ('DJI Air Unit OEM', 'o3_air_unit', '01.06.0000', '{1,6,0}',   'provisional', false, NULL, 'Under evaluation.')
) AS v(family, target_key, version, sort_key, status, certified, url, notes)
  ON v.family = f.name AND v.target_key = t.target_key
ON CONFLICT (target_id, version) DO NOTHING;

INSERT INTO firmware.release_capabilities (release_id, capability)
SELECT r.id, c.cap
FROM firmware.firmware_releases r
JOIN firmware.hardware_targets t ON t.id = r.target_id
JOIN firmware.families f ON f.id = t.family_id
JOIN (VALUES
  ('Betaflight', '4.5.1', 'gps_rescue'),
  ('Betaflight', '4.5.1', 'blackbox'),
  ('Betaflight', '4.5.1', 'dyn_notch'),
  ('Betaflight', '4.5.1', 'osd'),
  ('Betaflight', '4.5.1', 'ledstrip'),
  ('Betaflight', '4.5.2', 'gps_rescue'),
  ('Betaflight', '4.5.2', 'blackbox'),
  ('ArduPilot Copter', '4.6.2', 'fence'),
  ('ArduPilot Copter', '4.6.2', 'rtl'),
  ('ArduPilot Copter', '4.6.2', 'rally'),
  ('ArduPilot Copter', '4.6.2', 'lua_scripting'),
  ('ArduPilot Rover', '4.5.7', 'fence'),
  ('ArduPilot Rover', '4.5.7', 'rtl'),
  ('DJI Air Unit OEM', '01.04.0300', 'hd_link'),
  ('DJI Air Unit OEM', '01.04.0300', 'canvas_mode')
) AS c(family, version, cap) ON c.family = f.name AND c.version = r.version
ON CONFLICT (release_id, capability) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Grants — read-only reference data; RPCs do all client work
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA firmware FROM anon, PUBLIC;
GRANT USAGE ON SCHEMA firmware TO authenticated;

REVOKE ALL ON firmware.manufacturers FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.families FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.hardware_targets FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.firmware_releases FROM anon, PUBLIC, authenticated;
REVOKE ALL ON firmware.release_capabilities FROM anon, PUBLIC, authenticated;
GRANT SELECT ON firmware.manufacturers, firmware.families,
  firmware.hardware_targets, firmware.firmware_releases,
  firmware.release_capabilities TO authenticated;

REVOKE ALL ON FUNCTION firmware.can_read_registry() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration
-- ============================================================
