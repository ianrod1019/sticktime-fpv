-- ============================================================
-- Migration: Squad tier — bundled group billing for hobbyist squads
--
-- Squad sits next to Pro: identical non-commercial feature set (adds
-- 'squad' to check_pro_access()), just billed as one 5-10 pilot pack
-- attached to an existing squadron (team) instead of one price per pilot.
--
-- Deliberately NOT modeled through enterprises/organizations
-- (20260927100000) — that bridge is what every org-gated compliance
-- module (certs, sms, jha, firmware, portals — see ent_is_org_member)
-- checks for membership, regardless of plan_code. Giving Squad an
-- organizations row would hand a non-commercial hobbyist pack the same
-- compliance surfaces sold at Solo Commercial/School/Enterprise.
-- squad_subscriptions is a standalone table instead: it tags a team as a
-- paid group pack and caps its seats, and nothing more.
--
-- Tier assignment stays manual, same as every other paid tier today
-- (billing is invite-only per docs/billing-tiers.mdx) — a StickTime admin
-- sets profiles.tier = 'squad' for each pilot in the pack and inserts one
-- squad_subscriptions row for their team. No provisioning RPC, no Stripe
-- wiring (see BILLING_LIVE in src/lib/billing-status.ts).
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. check_pro_access() — Squad gets the same feature set as Pro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_pro_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_user_tier text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT tier INTO v_user_tier
  FROM public.profiles
  WHERE profiles.id = v_user_id;

  RETURN v_user_tier IS NOT NULL
     AND LOWER(v_user_tier) IN ('pro', 'squad', 'solo_commercial', 'enterprise');
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. squad_subscriptions — one bundled billing pack per team
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.squad_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          uuid NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  billing_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  min_seats        integer NOT NULL DEFAULT 5 CHECK (min_seats >= 1),
  max_seats        integer NOT NULL DEFAULT 10 CHECK (max_seats >= min_seats),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_squad_subscriptions_billing_owner
  ON public.squad_subscriptions(billing_owner_id);

ALTER TABLE public.squad_subscriptions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS squad_subscriptions_touch ON public.squad_subscriptions;
CREATE TRIGGER squad_subscriptions_touch
BEFORE UPDATE ON public.squad_subscriptions
FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 3. RLS — members can see their own squad's pack; only site staff manage
--    it (same manual-provisioning model as enterprises/organizations).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Squad pack visible to team members" ON public.squad_subscriptions;
CREATE POLICY "Squad pack visible to team members"
  ON public.squad_subscriptions FOR SELECT
  TO authenticated
  USING (
    public.is_team_member(team_id, auth.uid())
    OR public.ent_is_site_admin()
  );

DROP POLICY IF EXISTS "Squad pack managed by site staff" ON public.squad_subscriptions;
CREATE POLICY "Squad pack managed by site staff"
  ON public.squad_subscriptions FOR ALL
  TO authenticated
  USING (public.ent_is_site_admin())
  WITH CHECK (public.ent_is_site_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_subscriptions TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seat cap — a squad pack cannot exceed max_seats members. Mirrors
--    ent_enforce_seat_cap (20260927100200) but sourced from
--    squad_subscriptions instead of the enterprises/organizations bridge,
--    and coexists on team_members alongside it without conflict — each
--    trigger no-ops when the team isn't its kind of paid pack.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.squad_enforce_seat_cap()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  DECLARE
    v_cap   integer;
    v_count integer;
  BEGIN
    SELECT max_seats INTO v_cap
      FROM public.squad_subscriptions
     WHERE team_id = NEW.team_id;

    IF v_cap IS NULL THEN
      RETURN NEW; -- not a squad-pack team: no cap
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.team_members tm
     WHERE tm.team_id = NEW.team_id
       AND (TG_OP <> 'UPDATE' OR tm.user_id <> OLD.user_id);

    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'squad pack seat cap reached (% members max)', v_cap
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS squad_seat_cap_members ON public.team_members;
CREATE TRIGGER squad_seat_cap_members
  AFTER INSERT OR UPDATE OF user_id ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.squad_enforce_seat_cap();

-- ---------------------------------------------------------------------------
-- 5. Read view — seat usage for the app's "N of max seats used" badge.
--    security_invoker so it runs under the caller's own RLS, same pattern
--    as certs.vault_documents_status (20260928010000).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.squad_subscription_status
  WITH (security_invoker = true) AS
SELECT
  s.id,
  s.team_id,
  s.billing_owner_id,
  s.min_seats,
  s.max_seats,
  (SELECT COUNT(*) FROM public.team_members tm WHERE tm.team_id = s.team_id) AS seats_used,
  s.created_at,
  s.updated_at
FROM public.squad_subscriptions s;

GRANT SELECT ON public.squad_subscription_status TO authenticated;

-- ============================================================
-- End of migration
-- ============================================================
