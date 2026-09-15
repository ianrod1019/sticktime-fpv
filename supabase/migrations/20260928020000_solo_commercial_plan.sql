-- ============================================================
-- Migration: Solo Commercial tier
--
-- A single-seat commercial tier between Pro and Enterprise: everything
-- Pro unlocks, plus the Cert & Waiver Vault (certs.vault_documents,
-- 20260928010000) — Part 107/trust/waiver compliance for a pilot who
-- isn't part of a squadron. It reuses the existing enterprise_plans /
-- organizations model rather than a parallel "personal vault" schema:
-- onboarding a Solo Commercial customer is the same manual process
-- already used for every paid tier today (billing is invite-only per
-- docs/billing-tiers.mdx) — create their personal team, an enterprises
-- row with plan_code='solo_commercial' (max_orgs=1, max_seats_per_org=1),
-- and one organizations row bridging them. No new provisioning RPC.
--
-- annual_price_floor is a placeholder (billing isn't live yet, see
-- BILLING_LIVE in src/lib/billing-status.ts) — set the real number
-- before Stripe checkout ships.
-- ============================================================

INSERT INTO public.enterprise_plans
  (code, name, annual_price_floor, max_orgs, max_seats_per_org,
   district_features, description)
VALUES
  ('solo_commercial', 'Solo Commercial', 180.00, 1, 1, false,
   'Single commercial pilot: everything in Pro plus the Cert & Waiver Vault for Part 107/waiver compliance')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- check_pro_access() only ever recognized tier = 'pro' literally, so an
-- 'enterprise'-tier pilot (see profiles.tier, e.g. district admins in
-- 20260927100400_enterprise_seed.sql) already fell through this Pro gate
-- despite Enterprise being advertised as Pro-and-up. Fixing that here
-- rather than adding a second special case for 'solo_commercial' only —
-- one gate, every tier that should pass, routes through it.
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
     AND LOWER(v_user_tier) IN ('pro', 'solo_commercial', 'enterprise');
END;
$$;

-- ============================================================
-- End of migration
-- ============================================================
