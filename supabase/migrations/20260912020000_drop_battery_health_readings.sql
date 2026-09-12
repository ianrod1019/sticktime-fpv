-- Remove the personal_gear.battery_health_readings table ("battery_stealth"
-- readings) from the live schema.
--
-- It was ported from public.battery_health_readings in migration
-- 20260912010000_move_battery_packs_to_personal_gear.sql, but nothing in the
-- app reads or writes it (the IR tracker uses battery_ir_readings per pack).
-- It is empty in production, so nothing is lost by dropping it.

DROP TABLE IF EXISTS personal_gear.battery_health_readings CASCADE;
