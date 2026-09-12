-- ====================================================
-- Migration: Grant CRUD on drone_parts, inter_drone, component_failures
--
-- The earlier grant_personal_gear_select_permissions migration only granted
-- SELECT to authenticated and ran BEFORE drone_parts / inter_drone /
-- component_failures existed, so those three tables had NO table-level
-- privileges for the Data API roles. Every INSERT/UPDATE/DELETE (and any
-- SELECT that slipped past RLS) failed with "permission denied for table
-- drone_parts" — this is what broke the Add Part flow.
--
-- RLS policies (20260916000000_secure_drone_parts_and_inter_drone_rls)
-- already scope every operation to user_id = auth.uid(), and the inter_drone
-- pro-gate trigger (20260918000000_pro_gate_inter_drone) still blocks
-- non-Pro writes, so granting DML here does not open the tables up.
-- ====================================================

GRANT USAGE ON SCHEMA personal_gear TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON personal_gear.drone_parts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON personal_gear.inter_drone TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON personal_gear.component_failures TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA personal_gear
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ====================================================
-- End of migration
-- ====================================================
