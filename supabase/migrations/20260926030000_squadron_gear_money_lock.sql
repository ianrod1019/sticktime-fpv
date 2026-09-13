-- ============================================================
-- Migration: Money-lock org_gear.squadron_gear
--
-- squadron_gear (the shared-gear table with purchase_cost) was never
-- registered in org_gear.money_columns() and never got the money_lock
-- trigger, unlike every other org_gear money-bearing table. With the
-- full-access bypass dropped (20260926020000) that would have left
-- purchase_cost writable by any team member. This registers the table
-- in the same data-driven lock the rest of the schema uses.
-- ============================================================

CREATE OR REPLACE FUNCTION org_gear.money_columns(p_table text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = org_gear
AS $$
  SELECT CASE p_table
    WHEN 'drones'           THEN ARRAY['purchase_cost']
    WHEN 'batteries'        THEN ARRAY['purchase_cost']
    WHEN 'transmitters'     THEN ARRAY['purchase_cost', 'purchase_date', 'current_value']
    WHEN 'goggles'          THEN ARRAY['purchase_cost']
    WHEN 'other_gear'       THEN ARRAY['purchase_cost', 'purchase_date', 'current_value']
    WHEN 'drone_parts'      THEN ARRAY['purchase_cost', 'purchase_date', 'vendor']
    WHEN 'maintenance_logs' THEN ARRAY['cost']
    WHEN 'squadron_gear'    THEN ARRAY['purchase_cost']
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE TRIGGER money_lock
BEFORE INSERT OR UPDATE OR DELETE ON org_gear.squadron_gear
FOR EACH ROW EXECUTE FUNCTION org_gear.enforce_money_locks();
