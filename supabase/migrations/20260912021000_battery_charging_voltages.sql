-- Battery charging-practice voltages (all optional).
--
-- Cells stay NULL unless the pilot records a custom value. Storage voltage
-- may be defaulted from the pack's cell count by the UI; full and empty
-- voltages are never invented. The battery detail view only renders the
-- Charging Practice card when at least one voltage differs from the
-- assumed default, so the UI never presents invented data as fact.

ALTER TABLE personal_gear.batteries
  ADD COLUMN IF NOT EXISTS storage_voltage_per_cell numeric(3, 2),
  ADD COLUMN IF NOT EXISTS full_voltage_per_cell numeric(3, 2),
  ADD COLUMN IF NOT EXISTS empty_voltage_per_cell numeric(3, 2);
