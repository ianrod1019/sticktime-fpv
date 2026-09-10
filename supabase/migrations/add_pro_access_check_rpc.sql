/*
  # Add Pro Access Check RPC Function

  1. Changes
    - Create `check_pro_access()` function that returns boolean
    - Function checks user's subscription tier in profiles table
    - Returns true only for users with tier = 'pro'
    - Used to gate pro features like Cost-per-Flight-Hour Ledger
    
  2. Security
    - SECURITY DEFINER function to ensure proper access control
    - Returns true if tier is exactly 'pro'
    - Returns false for free users or admin/dev without pro tier
    - Cannot be bypassed by client-side code
*/

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

  IF v_user_tier IS NOT NULL AND LOWER(v_user_tier) = 'pro' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_pro_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pro_access_details()
RETURNS TABLE (
  has_access boolean,
  user_role text,
  user_tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_tier text;
  v_has_access boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT role, tier INTO v_user_role, v_user_tier
  FROM public.profiles
  WHERE profiles.id = v_user_id;

  IF v_user_tier IS NOT NULL AND LOWER(v_user_tier) = 'pro' THEN
    v_has_access := true;
  ELSE
    v_has_access := false;
  END IF;

  RETURN QUERY SELECT v_has_access, v_user_role, v_user_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pro_access_details() TO authenticated;

COMMENT ON FUNCTION public.check_pro_access() IS 'Returns true only if user has tier=pro. Used to gate pro features.';
COMMENT ON FUNCTION public.get_pro_access_details() IS 'Returns detailed pro access status including role and tier. Useful for UI rendering decisions.';
