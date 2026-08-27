-- Subscription state for Stripe webhook synchronization and server-side plan checks.
CREATE TYPE public.subscription_status AS ENUM ('inactive','trialing','active','past_due','canceled');

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  plan_key TEXT NOT NULL DEFAULT 'free',
  status public.subscription_status NOT NULL DEFAULT 'inactive',
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, callsign)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'callsign')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'free_user') ON CONFLICT DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan_key, status) VALUES (NEW.id, 'free', 'active') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP POLICY IF EXISTS "teams_insert_own" ON public.teams;
CREATE POLICY "teams_insert_pro_or_admin" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'pro_user')
      OR owner_id = auth.uid() AND public.has_role(auth.uid(), 'team_admin')
  );

CREATE OR REPLACE FUNCTION public.join_team_with_code(_code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_team UUID;
BEGIN
  SELECT team_id INTO target_team FROM public.team_invite_codes WHERE upper(code) = upper(_code) AND expires_at > now();
  IF target_team IS NULL THEN RAISE EXCEPTION 'Invalid or expired entry code'; END IF;
  INSERT INTO public.team_members (team_id, user_id) VALUES (target_team, auth.uid()) ON CONFLICT (team_id, user_id) DO NOTHING;
  RETURN target_team;
END; $$;
GRANT EXECUTE ON FUNCTION public.join_team_with_code(TEXT) TO authenticated;
