-- ============================================================
-- Seed: credential catalog — FAA / EASA / FCC / internal checkouts.
-- Platform-level master data (public to authenticated, managed by
-- site admins). Idempotent via ON CONFLICT.
-- ============================================================

INSERT INTO certs.credential_definitions
  (code, name, description, category, jurisdiction, default_validity_days,
   evidence_required, verification_required, recency_rule,
   applies_to, applies_key, regulatory_citation, sensitive, sort_order)
VALUES
  -- Federal certificates
  ('faa_part_107', 'FAA Part 107 Remote Pilot Certificate',
   'Remote pilot certificate with small UAS rating. Currency requires the free online recurrent training every 24 calendar months.',
   'federal_certificate', 'FAA', 730, true, true, NULL, NULL, NULL,
   '14 CFR Part 107 / AC 107-2A', false, 10),
  ('trust_completion', 'TRUST Completion Certificate',
   'The Recreational UAS Safety Test — required for recreational flying under the Exception for Limited Recreational Operations.',
   'federal_certificate', 'FAA', NULL, true, false, NULL, NULL, NULL,
   '49 USC 44809', false, 20),

  -- Federal authorizations
  ('faa_night_waiver_107_29', 'Night Operations Authorization (107.29)',
   'Night operations authorization under 14 CFR 107.29 — either the 2021 operations-over-people rule with recurrent training, or a granted waiver.',
   'federal_authorization', 'FAA', 730, true, true, NULL, NULL, NULL,
   '14 CFR 107.29', false, 30),
  ('faa_bvlos_authorization', 'BVLOS Authorization (107.31 Waiver / COA)',
   'Beyond visual line of sight authorization via waiver or Certificate of Waiver/Authorization. Organization waiver must also be current.',
   'federal_authorization', 'FAA', 365, true, true, NULL, NULL, NULL,
   '14 CFR 107.31 waiver', false, 40),
  ('faa_oop_authorization', 'Operations Over People Authorization (107.39)',
   'Operations over people / moving vehicles authorization.',
   'federal_authorization', 'FAA', 730, true, true, NULL, NULL, NULL,
   '14 CFR 107.39', false, 50),

  -- Medical
  ('faa_medical', 'FAA Medical Certificate (Class 2)',
   'Second-class airman medical certificate for operations requiring it (e.g. certain BVLOS COA stipulations). SENSITIVE — masked in fleet views.',
   'medical', 'FAA', 730, true, false, NULL, NULL, NULL,
   '14 CFR Part 67', true, 60),
  ('faa_medical_class3', 'FAA Medical Certificate (Class 3)',
   'Third-class airman medical certificate. SENSITIVE — masked in fleet views.',
   'medical', 'FAA', 1825, true, false, NULL, NULL, NULL,
   '14 CFR Part 67', true, 61),

  -- Radio license
  ('fcc_grol', 'FCC GROL',
   'General Radiotelephone Operator License for broadcast/pilot operations requiring it. Does not expire.',
   'jurisdictional', 'FCC', NULL, true, false, NULL, NULL, NULL,
   '47 CFR Part 13', false, 70),

  -- EASA
  ('easa_a1_a3', 'EASA A1/A3 Open Category',
   'EASA open-category remote pilot competency (A1/A3). EU jurisdiction.',
   'jurisdictional', 'EASA', 730, true, false, NULL, NULL, NULL,
   'EU 2019/947', false, 80),
  ('easa_a2', 'EASA A2 Open Category',
   'EASA A2 remote pilot certificate of competency (closer-flight privileges).',
   'jurisdictional', 'EASA', 730, true, false, NULL, NULL, NULL,
   'EU 2019/947', false, 81),
  ('easa_specific_ops_auth', 'EASA SORA / Specific Operations Authorisation',
   'Operational authorisation for specific-category operations (SORA-based).',
   'jurisdictional', 'EASA', 365, true, true, NULL, NULL, NULL,
   'EU 2019/947 Art. 12', false, 82),

  -- Internal company currency
  ('internal_night_ops', 'Internal Night Operations Checkout',
   'Company night-ops checkout: authorization plus demonstrated night recency (3 night flights in 90 days). Recency is computed from logged flights.',
   'internal_checkout', 'internal', 365, true, true,
   '{"type":"flights_in_window","count":3,"window_days":90,"night_only":true}'::jsonb,
   NULL, NULL, 'Company ops manual §4.2', false, 100),
  ('internal_thermal_payload', 'Thermal Imaging Payload Checkout',
   'Practical checkout on radiometric thermal payloads: isotherm tuning, emissivity setup, spot/area temperature reads, data capture discipline.',
   'internal_checkout', 'internal', 365, true, true,
   '{"type":"flights_in_window","count":2,"window_days":180,"night_only":false}'::jsonb,
   'payload', 'thermal', 'Company ops manual §5.1', false, 110),
  ('internal_lidar_payload', 'LiDAR Payload Checkout',
   'Practical checkout on survey LiDAR: boresight calibration, return handling, GNSS/IMU planning, trajectory QA.',
   'internal_checkout', 'internal', 365, true, true, NULL,
   'payload', 'lidar', 'Company ops manual §5.2', false, 120),
  ('internal_heavy_lift', 'Heavy-Lift Multirotor Checkout',
   'Heavy-lift checkout for airframes over 9 kg AUW: rigging, CG management, failure drills, load charts.',
   'internal_checkout', 'internal', 365, true, true, NULL,
   'airframe_class', 'heavy_lift', 'Company ops manual §5.3', false, 130),
  ('internal_chief_pilot_ground', 'Annual Recurrent Ground School (Company)',
   'Company annual recurrent ground school: ops manual amendments, airspace refresh, incident learnings.',
   'company_currency', 'internal', 365, true, false, NULL, NULL, NULL,
   'Company ops manual §4.4', false, 140)

ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    jurisdiction = EXCLUDED.jurisdiction,
    default_validity_days = EXCLUDED.default_validity_days,
    recency_rule = EXCLUDED.recency_rule,
    applies_to = EXCLUDED.applies_to,
    applies_key = EXCLUDED.applies_key,
    regulatory_citation = EXCLUDED.regulatory_citation,
    sensitive = EXCLUDED.sensitive,
    sort_order = EXCLUDED.sort_order;

-- ============================================================
-- End of seed
-- ============================================================
