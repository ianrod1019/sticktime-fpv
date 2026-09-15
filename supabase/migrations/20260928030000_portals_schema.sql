-- ============================================================
-- Migration: portals — white-labeled client delivery portals
--
-- A squadron/enterprise org wraps a finished job's files into a
-- branded, expiring link and hands it to the client. No client
-- account: the access_token in the URL is the credential.
--
-- Tables:
--   portals.deliveries       — the delivery header (org, client,
--     branding, expiration, access token)
--   portals.delivery_files   — the files behind the client's
--     download buttons. Objects live in the private
--     'delivery-files' storage bucket at path <delivery_id>/<uuid>-name;
--     the browser never gets a bucket grant on the client side — see
--     20260928030100 for the public download seam.
--
-- Access model, mirroring ent_scheduling (20260927106000):
--   * Internal (authenticated): RLS — any org member can create and
--     manage their org's portals (spec: broader than ent_scheduling's
--     admin-only writes, since delivery links are routine pilot work).
--   * Client (anon): ZERO direct table access. Every client-facing
--     read is the parameterized RPC in 20260928030100, keyed by
--     access_token; downloads go through the portal-download edge
--     function (service role, token + expiry validated). The token
--     never appears in an RLS policy.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS portals;

-- ---------------------------------------------------------------------------
-- 1. deliveries — the portal header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portals.deliveries (
  delivery_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- The portal-link secret. Shown once to the creating pilot, rotatable
  -- via portals.rotate_access_token. Not a foreign key to anything — it
  -- identifies the delivery to the public surface only.
  access_token     uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  client_name      text NOT NULL CHECK (char_length(btrim(client_name)) BETWEEN 1 AND 120),
  project_title    text NOT NULL CHECK (char_length(btrim(project_title)) BETWEEN 1 AND 140),

  expires_at       timestamptz NOT NULL,

  -- { logo_url, brand_color, agency_name } — rendered on the public
  -- portal page. Validated shape-only client-side; no server schema.
  branding_config  jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by       uuid NOT NULL DEFAULT auth.uid()
                   REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. delivery_files — the files behind the client's download button
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portals.delivery_files (
  file_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  uuid NOT NULL REFERENCES portals.deliveries(delivery_id) ON DELETE CASCADE,
  file_name    text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 200),
  file_size    bigint NOT NULL CHECK (file_size > 0 AND file_size <= 524288000), -- 500 MB
  storage_path text NOT NULL,
  uploaded_by  uuid NOT NULL DEFAULT auth.uid()
               REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (delivery_id, storage_path)
);

-- ---------------------------------------------------------------------------
-- 3. Internal RLS. Reads/writes: any org member (spec: org members
--    create and manage their org's portals). Explicit USING and WITH
--    CHECK on every operation, per the security mandate.
-- ---------------------------------------------------------------------------

ALTER TABLE portals.deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deliveries_member_select ON portals.deliveries;
CREATE POLICY deliveries_member_select
  ON portals.deliveries FOR SELECT
  USING (
    public.ent_is_site_admin()
    OR public.ent_is_org_member(organization_id)
  );

DROP POLICY IF EXISTS deliveries_member_insert ON portals.deliveries;
CREATE POLICY deliveries_member_insert
  ON portals.deliveries FOR INSERT
  WITH CHECK (
    public.ent_is_org_member(organization_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS deliveries_member_update ON portals.deliveries;
CREATE POLICY deliveries_member_update
  ON portals.deliveries FOR UPDATE
  USING (public.ent_is_org_member(organization_id))
  WITH CHECK (
    public.ent_is_org_member(organization_id)
    -- The delivery can never be smuggled to another org.
    AND organization_id = (SELECT o.id FROM public.organizations o
                            WHERE o.id = portals.deliveries.organization_id)
  );

DROP POLICY IF EXISTS deliveries_member_delete ON portals.deliveries;
CREATE POLICY deliveries_member_delete
  ON portals.deliveries FOR DELETE
  USING (public.ent_is_org_member(organization_id));

ALTER TABLE portals.delivery_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_files_member_select ON portals.delivery_files;
CREATE POLICY delivery_files_member_select
  ON portals.delivery_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portals.deliveries d
       WHERE d.delivery_id = delivery_id
         AND (public.ent_is_site_admin() OR public.ent_is_org_member(d.organization_id))
    )
  );

DROP POLICY IF EXISTS delivery_files_member_insert ON portals.delivery_files;
CREATE POLICY delivery_files_member_insert
  ON portals.delivery_files FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portals.deliveries d
       WHERE d.delivery_id = delivery_id
         AND public.ent_is_org_member(d.organization_id)
    )
    -- The storage path must address THIS delivery's prefix.
    AND storage_path LIKE delivery_id::text || '/%'
  );

DROP POLICY IF EXISTS delivery_files_member_delete ON portals.delivery_files;
CREATE POLICY delivery_files_member_delete
  ON portals.delivery_files FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM portals.deliveries d
       WHERE d.delivery_id = delivery_id
         AND public.ent_is_org_member(d.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Keep updated_at truthful.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS touch_delivery_updated_at ON portals.deliveries;
CREATE TRIGGER touch_delivery_updated_at
BEFORE UPDATE ON portals.deliveries
FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_deliveries_org
  ON portals.deliveries (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_files_delivery
  ON portals.delivery_files (delivery_id);

-- ============================================================
-- End of migration (RPCs + storage continue in
-- 20260928030100_portals_rpcs_storage.sql)
-- ============================================================
