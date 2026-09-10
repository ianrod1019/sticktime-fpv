-- Add cost tracking columns to gear table for Cost-per-Flight-Hour Ledger
ALTER TABLE "public"."gear"
  ADD COLUMN IF NOT EXISTS purchase_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS current_value numeric DEFAULT 0;

-- Add index for cost-based queries
CREATE INDEX IF NOT EXISTS idx_gear_purchase_cost ON public.gear USING btree (purchase_cost);

-- Add RLS policy for cost data (users can manage their own gear costs)
CREATE POLICY "Users can manage their own gear costs" ON "public"."gear"
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));