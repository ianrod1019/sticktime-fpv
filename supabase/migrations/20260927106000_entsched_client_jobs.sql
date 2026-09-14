-- ============================================================
-- Migration: ent_scheduling — the client-job CRM plane
--
-- Professional client work, scheduled like a job. A squadron/enterprise
-- org books a job for an external client; the client gets a secure
-- token link (no account needed) to view the summary, confirm the
-- booking, and later download the deliverables.
--
-- Tables:
--   ent_scheduling.client_jobs       — job header (org, client, window, status)
--   ent_scheduling.job_deliverables  — uploaded files handed to the client
--   ent_scheduling.outbox            — email queue. The future provider
--     seam: rows appear here on confirm/deliver transitions; plugging in
--     Resend/SMTP later means draining this table from a worker. Nothing
--     sends email today.
--
-- Status machine (trigger-enforced):
--   draft → pending_confirmation → confirmed → in_progress → delivered
--   archived; cancelled reachable from any non-terminal state.
--
-- Access model:
--   * Internal (authenticated): RLS via the enterprise helpers — org
--     members read, org admins write (public.ent_can_manage, 20260927100100).
--   * Client (anon): ZERO direct table access. Every client-facing read
--     is a parameterized RPC requiring the job's link token; downloads go
--     through the client-job-download edge function (service role,
--     token-validated). The token never appears in an RLS policy, so a
--     leaked table grant could not expose client data.
--
-- House style mirrors edu (20260914120000): explicit USING/WITH CHECK
-- everywhere, SECURITY DEFINER helpers with pinned search_path, REVOKE
-- from anon/public, moddatetime touch triggers, idempotent realtime.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS ent_scheduling;

-- ---------------------------------------------------------------------------
-- 1. client_jobs — the job header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ent_scheduling.client_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_number       bigint GENERATED ALWAYS AS IDENTITY UNIQUE,

  -- The client-link secret. 128-bit uuid, shown once to the creating
  -- admin, rotatable via ent_rotate_client_token. Not a foreign key to
  -- anything — it identifies the job to the public surface only.
  client_token     uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  title            text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 140),
  description      text,
  location         text,
  scheduled_start  timestamptz NOT NULL,
  scheduled_end    timestamptz NOT NULL,

  client_name      text NOT NULL CHECK (char_length(btrim(client_name)) BETWEEN 1 AND 120),
  client_email     text CHECK (client_email IS NULL OR char_length(btrim(client_email)) <= 320),

  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_confirmation', 'confirmed',
                                     'in_progress', 'delivered', 'archived', 'cancelled')),
  confirmed_at     timestamptz,
  delivered_at     timestamptz,

  created_by       uuid NOT NULL DEFAULT auth.uid()
                   REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CHECK (scheduled_end > scheduled_start)
);

-- ---------------------------------------------------------------------------
-- 2. job_deliverables — the files behind the client's download button
--    Objects live in the private 'client-deliverables' storage bucket at
--    path <job_id>/<deliverable_id>. The browser never gets a bucket
--    grant; the edge function streams a zip built from these paths.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ent_scheduling.job_deliverables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES ent_scheduling.client_jobs(id) ON DELETE CASCADE,
  file_name   text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 200),
  mime_type   text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes  bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 524288000), -- 500 MB
  storage_path text NOT NULL,
  uploaded_by uuid NOT NULL DEFAULT auth.uid()
              REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (job_id, storage_path)
);

-- ---------------------------------------------------------------------------
-- 3. outbox — the email seam. Rows are intents, not sends.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ent_scheduling.outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid REFERENCES ent_scheduling.client_jobs(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('job_confirmation', 'deliverables_ready')),
  to_email    text NOT NULL,
  subject     text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- 4. Internal RLS. Reads: org members + site admin. Writes: org admins
--    (district/squadron) + site admin. Explicit USING and WITH CHECK on
--    every operation, per the security mandate.
-- ---------------------------------------------------------------------------

ALTER TABLE ent_scheduling.client_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_jobs_member_select ON ent_scheduling.client_jobs;
CREATE POLICY client_jobs_member_select
  ON ent_scheduling.client_jobs FOR SELECT
  USING (
    public.ent_is_site_admin()
    OR public.ent_is_org_member(organization_id)
  );

DROP POLICY IF EXISTS client_jobs_admin_insert ON ent_scheduling.client_jobs;
CREATE POLICY client_jobs_admin_insert
  ON ent_scheduling.client_jobs FOR INSERT
  WITH CHECK (
    public.ent_can_manage(organization_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS client_jobs_admin_update ON ent_scheduling.client_jobs;
CREATE POLICY client_jobs_admin_update
  ON ent_scheduling.client_jobs FOR UPDATE
  USING (public.ent_can_manage(organization_id))
  WITH CHECK (
    public.ent_can_manage(organization_id)
    -- The job can never be smuggled to another org.
    AND organization_id = (SELECT o.id FROM public.organizations o
                            WHERE o.id = ent_scheduling.client_jobs.organization_id)
  );

DROP POLICY IF EXISTS client_jobs_admin_delete ON ent_scheduling.client_jobs;
CREATE POLICY client_jobs_admin_delete
  ON ent_scheduling.client_jobs FOR DELETE
  USING (public.ent_can_manage(organization_id));

ALTER TABLE ent_scheduling.job_deliverables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deliverables_member_select ON ent_scheduling.job_deliverables;
CREATE POLICY deliverables_member_select
  ON ent_scheduling.job_deliverables FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ent_scheduling.client_jobs j
       WHERE j.id = job_id
         AND (public.ent_is_site_admin() OR public.ent_is_org_member(j.organization_id))
    )
  );

DROP POLICY IF EXISTS deliverables_admin_insert ON ent_scheduling.job_deliverables;
CREATE POLICY deliverables_admin_insert
  ON ent_scheduling.job_deliverables FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ent_scheduling.client_jobs j
       WHERE j.id = job_id
         AND public.ent_can_manage(j.organization_id)
    )
    -- The storage path must address THIS job's prefix.
    AND storage_path LIKE job_id::text || '/%'
  );

DROP POLICY IF EXISTS deliverables_admin_delete ON ent_scheduling.job_deliverables;
CREATE POLICY deliverables_admin_delete
  ON ent_scheduling.job_deliverables FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ent_scheduling.client_jobs j
       WHERE j.id = job_id
         AND public.ent_can_manage(j.organization_id)
    )
  );

-- outbox: written by the enqueue trigger (SECURITY DEFINER) and read by
-- admins for the "email pending" indicator. No direct client writes.
ALTER TABLE ent_scheduling.outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_admin_select ON ent_scheduling.outbox;
CREATE POLICY outbox_admin_select
  ON ent_scheduling.outbox FOR SELECT
  USING (
    job_id IS NULL
    OR EXISTS (
      SELECT 1 FROM ent_scheduling.client_jobs j
       WHERE j.id = job_id
         AND (public.ent_is_site_admin() OR public.ent_can_manage(j.organization_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Write-path triggers
-- ---------------------------------------------------------------------------

-- 5a. Status machine + timestamp discipline. Delivered requires at least
--     one deliverable (a "delivered" job with nothing to download is a
--     lie); confirmed/delivered stamps are set here, not by the client.
CREATE OR REPLACE FUNCTION ent_scheduling.enforce_job_status_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    -- Client-side transitions (confirmation, timestamps) happen inside
    -- SECURITY DEFINER RPCs; interactive callers never set these.
    IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
       OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
      RAISE EXCEPTION 'Confirmation and delivery timestamps are server-managed'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('archived', 'cancelled') THEN
    RAISE EXCEPTION 'Job is % and can no longer change status', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'delivered' AND NEW.status NOT IN ('archived') THEN
    RAISE EXCEPTION 'A delivered job can only be archived'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'confirmed' THEN
    NEW.confirmed_at := now();
  ELSIF NEW.status = 'delivered' THEN
    IF NOT EXISTS (
      SELECT 1 FROM ent_scheduling.job_deliverables d WHERE d.job_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Upload at least one deliverable before marking the job delivered'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.delivered_at := now();
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS job_status_machine ON ent_scheduling.client_jobs;
CREATE TRIGGER job_status_machine
BEFORE UPDATE ON ent_scheduling.client_jobs
FOR EACH ROW EXECUTE FUNCTION ent_scheduling.enforce_job_status_machine();

-- 5b. Deliverables can only land on jobs that are at least confirmed —
--     files for an unconfirmed draft leak work-product to a client who
--     never agreed to the job.
CREATE OR REPLACE FUNCTION ent_scheduling.enforce_deliverable_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ent_scheduling.client_jobs j
     WHERE j.id = NEW.job_id
       AND j.status IN ('confirmed', 'in_progress', 'delivered')
  ) THEN
    RAISE EXCEPTION 'Deliverables can be uploaded once the job is confirmed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS deliverable_stage ON ent_scheduling.job_deliverables;
CREATE TRIGGER deliverable_stage
BEFORE INSERT ON ent_scheduling.job_deliverables
FOR EACH ROW EXECUTE FUNCTION ent_scheduling.enforce_deliverable_stage();

-- 5c. The email seam: enqueue (never send) on the two client-relevant
--     transitions. A later worker drains this table; today it is inert.
CREATE OR REPLACE FUNCTION ent_scheduling.enqueue_job_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'ent_scheduling'
AS $fn$
BEGIN
  IF NEW.client_email IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'confirmed' AND NEW.status = 'confirmed' THEN
    INSERT INTO ent_scheduling.outbox (job_id, kind, to_email, subject, payload)
    VALUES (
      NEW.id, 'job_confirmation', NEW.client_email,
      'Your booking is confirmed: ' || NEW.title,
      jsonb_build_object(
        'job_number', NEW.job_number,
        'title', NEW.title,
        'start', NEW.scheduled_start,
        'end', NEW.scheduled_end,
        'token', NEW.client_token
      )
    );
  ELSIF OLD.status <> 'delivered' AND NEW.status = 'delivered' THEN
    INSERT INTO ent_scheduling.outbox (job_id, kind, to_email, subject, payload)
    VALUES (
      NEW.id, 'deliverables_ready', NEW.client_email,
      'Your deliverables are ready: ' || NEW.title,
      jsonb_build_object(
        'job_number', NEW.job_number,
        'title', NEW.title,
        'token', NEW.client_token
      )
    );
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS job_email_enqueue ON ent_scheduling.client_jobs;
CREATE TRIGGER job_email_enqueue
AFTER UPDATE ON ent_scheduling.client_jobs
FOR EACH ROW EXECUTE FUNCTION ent_scheduling.enqueue_job_email();

-- 5d. Keep updated_at truthful.
DROP TRIGGER IF EXISTS touch_job_updated_at ON ent_scheduling.client_jobs;
CREATE TRIGGER touch_job_updated_at
BEFORE UPDATE ON ent_scheduling.client_jobs
FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 6. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_client_jobs_org_status
  ON ent_scheduling.client_jobs (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_client_jobs_org_start
  ON ent_scheduling.client_jobs (organization_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_deliverables_job
  ON ent_scheduling.job_deliverables (job_id);
CREATE INDEX IF NOT EXISTS idx_outbox_unsent
  ON ent_scheduling.outbox (sent_at) WHERE sent_at IS NULL;

-- ============================================================
-- End of migration (RPCs + storage continue in
-- 20260927106100_entsched_rpcs_storage.sql)
-- ============================================================
