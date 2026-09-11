-- Ensure user_id is always set on insert for personal_gear tables
-- This prevents RLS violations when the client doesn't inject user_id (e.g., admin users)

CREATE OR REPLACE FUNCTION personal_gear.set_user_id_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to all personal_gear tables
CREATE TRIGGER set_user_id_on_insert_batteries
BEFORE INSERT ON personal_gear.batteries
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_drones
BEFORE INSERT ON personal_gear.drones
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_transmitters
BEFORE INSERT ON personal_gear.transmitters
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_goggles
BEFORE INSERT ON personal_gear.goggles
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_other_gear
BEFORE INSERT ON personal_gear.other_gear
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_battery_parts
BEFORE INSERT ON personal_gear.battery_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_drone_parts
BEFORE INSERT ON personal_gear.drone_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_transmitter_parts
BEFORE INSERT ON personal_gear.transmitter_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_goggles_parts
BEFORE INSERT ON personal_gear.goggles_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_other_parts
BEFORE INSERT ON personal_gear.other_parts
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();

CREATE TRIGGER set_user_id_on_insert_maintenance_logs
BEFORE INSERT ON personal_gear.maintenance_logs
FOR EACH ROW EXECUTE FUNCTION personal_gear.set_user_id_on_insert();