-- ============================================================
-- Migration: portals — RPCs, public wrapper, storage
--
-- Client-facing surface: ONE anon-executable public wrapper over a
-- SECURITY DEFINER schema function, keyed on the delivery's access
-- token. The anon role receives NO grants on portals tables or
-- functions — every client read goes through the wrapper, which pins
-- the search_path and validates the token + expiration server-side.
--
-- Expiration is enforced as a real HTTP status, not a soft error flag:
-- PostgREST maps a raised exception whose SQLSTATE matches PT\d{3} to
-- that literal HTTP status (documented PostgREST convention), so an
-- expired link genuinely returns 410 Gone and an unknown token 404.
--
-- Internal surface: direct table access under RLS via
-- supabase.schema("portals") (same shape as ent_scheduling/certs).
--
-- Storage: the private 'delivery-files' bucket — today's local/mock
-- stub (ponytail: swap-to-B2 seam, see src/lib/portals/storage.ts).
-- Uploads/reads/deletes from the browser are guarded by
-- storage.objects policies that call portals.storage_delivery_access(),
-- which resolves the delivery from the path prefix and applies the
-- org-member gate. Client downloads never touch the bucket directly —
-- they go through the portal-download edge function (service role,
-- token + expiry validated), same pattern as client-job-download.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Client view — what the /portal/$token page renders. Never returns
--    the token itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portals.get_delivery(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'portals'
AS $fn$
DECLARE
  v_delivery portals.deliveries;
BEGIN
  SELECT * INTO v_delivery FROM portals.deliveries
   WHERE access_token = _token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This delivery link is not valid'
      USING ERRCODE = 'PT404';
  END IF;

  IF v_delivery.expires_at < now() THEN
    RAISE EXCEPTION 'This delivery link has expired'
      USING ERRCODE = 'PT410';
  END IF;

  RETURN jsonb_build_object(
    'client_name', v_delivery.client_name,
    'project_title', v_delivery.project_title,
    'branding_config', v_delivery.branding_config,
    'expires_at', v_delivery.expires_at,
    'created_at', v_delivery.created_at,
    'files', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'file_id', f.file_id,
        'file_name', f.file_name,
        'file_size', f.file_size,
        'uploaded_at', f.created_at
      ) ORDER BY f.created_at), '[]'::jsonb)
      FROM portals.delivery_files f
      WHERE f.delivery_id = v_delivery.delivery_id
    )
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Admin token rotation — the "client link leaked" button.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portals.rotate_access_token(_delivery uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'portals'
AS $fn$
DECLARE
  v_new uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM portals.deliveries d
     WHERE d.delivery_id = _delivery AND public.ent_is_org_member(d.organization_id)
  ) THEN
    RAISE EXCEPTION 'Access denied: org members only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE portals.deliveries
     SET access_token = gen_random_uuid()
   WHERE delivery_id = _delivery
   RETURNING access_token INTO v_new;

  RETURN v_new;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Storage gate — called by storage.objects policies. The bucket
--    path contract is <delivery_id>/<anything>.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portals.storage_delivery_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'portals'
AS $fn$
DECLARE
  v_delivery_id uuid;
BEGIN
  BEGIN
    v_delivery_id := split_part(split_part(coalesce(current_setting('storage.requested_path', true), ''), '/', 1), '/', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM portals.deliveries d
     WHERE d.delivery_id = v_delivery_id
       AND public.ent_is_org_member(d.organization_id)
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Public wrapper (supabase-js rpc() only reaches public). Thin
--    delegation; the definer owner carries the rights.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portals_get_delivery(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'portals'
AS $$ SELECT portals.get_delivery(_token) $$;

CREATE OR REPLACE FUNCTION public.portals_rotate_token(_delivery uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'portals'
AS $$ SELECT portals.rotate_access_token(_delivery) $$;

-- ---------------------------------------------------------------------------
-- 5. The private bucket. 500 MB cap mirrors delivery_files.file_size.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('delivery-files', 'delivery-files', false, 524288000)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS portals_upload ON storage.objects;
CREATE POLICY portals_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-files'
    AND portals.storage_delivery_access()
  );

DROP POLICY IF EXISTS portals_read ON storage.objects;
CREATE POLICY portals_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-files'
    AND portals.storage_delivery_access()
  );

DROP POLICY IF EXISTS portals_delete ON storage.objects;
CREATE POLICY portals_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'delivery-files'
    AND portals.storage_delivery_access()
  );

-- ---------------------------------------------------------------------------
-- 6. Grants. authenticated: schema usage + table DML (RLS-gated).
--    anon: NOTHING on the schema — only EXECUTE on the client wrapper.
--    Functions stay revoked from PUBLIC per house style.
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA portals FROM anon, PUBLIC;
GRANT USAGE ON SCHEMA portals TO authenticated;

REVOKE ALL ON portals.deliveries FROM anon, PUBLIC, authenticated;
REVOKE ALL ON portals.delivery_files FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON portals.deliveries TO authenticated;
GRANT SELECT, INSERT, DELETE ON portals.delivery_files TO authenticated;

REVOKE ALL ON FUNCTION portals.get_delivery(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION portals.rotate_access_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION portals.storage_delivery_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portals_get_delivery(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portals_rotate_token(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.portals_get_delivery(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portals_rotate_token(uuid) TO authenticated;

-- storage.objects policies below run AS the authenticated role (Storage
-- evaluates bucket RLS using the requesting client's role), so the gate
-- function they call must stay executable by that role — unlike the
-- other portals functions above, which are only ever reached through
-- the public wrappers.
GRANT EXECUTE ON FUNCTION portals.storage_delivery_access() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- End of migration. Client download flows through the
-- portal-download edge function (token-validated, service role).
-- ============================================================
