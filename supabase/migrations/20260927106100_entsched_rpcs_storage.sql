-- ============================================================
-- Migration: ent_scheduling — RPCs, public wrappers, storage
--
-- Client-facing surface: two anon-executable public wrappers over
-- SECURITY DEFINER schema functions, both keyed on the job's link
-- token. The anon role receives NO grants on ent_scheduling tables or
-- functions — every client read/confirm goes through the wrappers,
-- which pin the search_path and validate the token server-side.
--
-- Internal surface: direct table access under RLS via
-- supabase.schema("ent_scheduling") (like the edu module), plus an
-- admin-only token-rotation RPC.
--
-- Storage: the private 'client-deliverables' bucket. Uploads/deletes
-- are guarded by storage.objects policies that call
-- ent_scheduling.storage_job_access(), which resolves the job from the
-- path prefix and applies the enterprise manage gate.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Client view — what the /client/$token page renders.
--    Aggregate-only + job header fields; deliverables included only once
--    the job is delivered. Never returns the token itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ent_scheduling.get_client_job(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $fn$
DECLARE
  v_job ent_scheduling.client_jobs;
BEGIN
  SELECT * INTO v_job FROM ent_scheduling.client_jobs
   WHERE client_token = _token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'job_number', v_job.job_number,
    'title', v_job.title,
    'description', v_job.description,
    'location', v_job.location,
    'scheduled_start', v_job.scheduled_start,
    'scheduled_end', v_job.scheduled_end,
    'status', v_job.status,
    'client_name', v_job.client_name,
    'confirmed_at', v_job.confirmed_at,
    'delivered_at', v_job.delivered_at,
    'org_name', (
      SELECT t.name FROM public.organizations o
      JOIN public.teams t ON t.id = o.team_id
      WHERE o.id = v_job.organization_id
    ),
    'deliverables', CASE
      WHEN v_job.status = 'delivered' THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'file_name', d.file_name,
          'mime_type', d.mime_type,
          'size_bytes', d.size_bytes,
          'uploaded_at', d.created_at
        ) ORDER BY d.created_at), '[]'::jsonb)
        FROM ent_scheduling.job_deliverables d
        WHERE d.job_id = v_job.id
      )
      ELSE '[]'::jsonb
    END
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Client confirm — pending_confirmation → confirmed, only. The
--    status machine trigger stamps confirmed_at; here the token IS the
--    authority (definer context, no auth.uid()).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ent_scheduling.confirm_client_job(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $fn$
DECLARE
  v_job ent_scheduling.client_jobs;
BEGIN
  SELECT * INTO v_job FROM ent_scheduling.client_jobs
   WHERE client_token = _token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF v_job.status <> 'pending_confirmation' THEN
    RETURN jsonb_build_object(
      'error', 'invalid_state',
      'status', v_job.status
    );
  END IF;

  UPDATE ent_scheduling.client_jobs
     SET status = 'confirmed'
   WHERE id = v_job.id;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Admin token rotation — the "client link leaked" button. Old token
--    dies with the row update; the RPC returns the new one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ent_scheduling.rotate_client_token(_job uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $fn$
DECLARE
  v_new uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ent_scheduling.client_jobs j
     WHERE j.id = _job AND public.ent_can_manage(j.organization_id)
  ) THEN
    RAISE EXCEPTION 'Access denied: org admins only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE ent_scheduling.client_jobs
     SET client_token = gen_random_uuid()
   WHERE id = _job
   RETURNING client_token INTO v_new;

  RETURN v_new;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Storage gate — called by storage.objects policies. The bucket path
--    contract is <job_id>/<anything>. Resolves the job, applies the
--    enterprise manage gate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ent_scheduling.storage_job_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $fn$
DECLARE
  v_job_id uuid;
BEGIN
  -- First path segment must be the job id (bucket name arrives as the
  -- leading segment per storage.objects.name convention 'bucket/path').
  BEGIN
    v_job_id := split_part(split_part(coalesce(current_setting('storage.requested_path', true), ''), '/', 1), '/', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF v_job_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM ent_scheduling.client_jobs j
     WHERE j.id = v_job_id
       AND public.ent_can_manage(j.organization_id)
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Public wrappers (supabase-js rpc() only reaches public). Thin
--    delegation; the definer owner carries the rights.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entsched_client_job(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $$ SELECT ent_scheduling.get_client_job(_token) $$;

CREATE OR REPLACE FUNCTION public.entsched_confirm_job(_token uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $$ SELECT ent_scheduling.confirm_client_job(_token) $$;

CREATE OR REPLACE FUNCTION public.entsched_rotate_token(_job uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $$ SELECT ent_scheduling.rotate_client_token(_job) $$;

-- ---------------------------------------------------------------------------
-- 6. The private bucket. 500 MB cap mirrors job_deliverables.size_bytes.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('client-deliverables', 'client-deliverables', false, 524288000)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS entsched_upload ON storage.objects;
CREATE POLICY entsched_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-deliverables'
    AND ent_scheduling.storage_job_access()
  );

DROP POLICY IF EXISTS entsched_read ON storage.objects;
CREATE POLICY entsched_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-deliverables'
    AND ent_scheduling.storage_job_access()
  );

DROP POLICY IF EXISTS entsched_delete ON storage.objects;
CREATE POLICY entsched_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-deliverables'
    AND ent_scheduling.storage_job_access()
  );

-- ---------------------------------------------------------------------------
-- 7. Grants. authenticated: schema usage + table DML (RLS-gated).
--    anon: NOTHING on the schema — only EXECUTE on the two client
--    wrappers. Functions stay revved from PUBLIC per house style.
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA ent_scheduling FROM anon, PUBLIC;
GRANT USAGE ON SCHEMA ent_scheduling TO authenticated;

REVOKE ALL ON ent_scheduling.client_jobs FROM anon, PUBLIC, authenticated;
REVOKE ALL ON ent_scheduling.job_deliverables FROM anon, PUBLIC, authenticated;
REVOKE ALL ON ent_scheduling.outbox FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ent_scheduling.client_jobs TO authenticated;
GRANT SELECT, INSERT, DELETE ON ent_scheduling.job_deliverables TO authenticated;
GRANT SELECT ON ent_scheduling.outbox TO authenticated;

REVOKE ALL ON FUNCTION ent_scheduling.get_client_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ent_scheduling.confirm_client_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ent_scheduling.rotate_client_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ent_scheduling.storage_job_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.entsched_client_job(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entsched_confirm_job(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entsched_rotate_token(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.entsched_client_job(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entsched_confirm_job(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entsched_rotate_token(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 8. Realtime — the internal jobs board live-updates (idempotent).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'ent_scheduling'
      AND tablename = 'client_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ent_scheduling.client_jobs;
  END IF;
END $$;

-- ============================================================
-- End of migration. Client download flows through the
-- client-job-download edge function (token-validated, service role).
-- ============================================================
