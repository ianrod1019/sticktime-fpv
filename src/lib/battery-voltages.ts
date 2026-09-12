/**
 * Charging-practice voltages for LiPo battery sets (per-cell values).
 *
 * The database columns are all optional: storage voltage is *assumed* to be
 * the industry-standard value below when a pilot hasn't recorded one, and
 * full/empty voltages are never invented. The UI only surfaces a Charging
 * Practice card when the pilot's values differ from the assumptions — blank
 * fields mean "use the default", never "pretend this was recorded".
 */

/** Assumed per-cell storage voltage when none was recorded (3.80 V). */
export const DEFAULT_STORAGE_VOLTAGE_PER_CELL = 3.8;

/** Assumed per-cell full voltage when none was recorded (4.20 V). */
export const DEFAULT_FULL_VOLTAGE_PER_CELL = 4.2;

/** Assumed per-cell empty voltage when none was recorded (3.50 V). */
export const DEFAULT_EMPTY_VOLTAGE_PER_CELL = 3.5;

export interface BatteryVoltageFields {
  storage_voltage_per_cell?: number | null | undefined;
  full_voltage_per_cell?: number | null | undefined;
  empty_voltage_per_cell?: number | null | undefined;
}

function parseOptionalVoltage(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) return null;
  return parsed;
}

/**
 * Maps blank/invalid voltage strings onto the optional DB columns: blank
 * clears the custom value (back to the assumed default), a number stores it.
 */
export function parseVoltageFields(fields: {
  storageVoltage: string;
  fullVoltage: string;
  emptyVoltage: string;
}): BatteryVoltageFields {
  return {
    storage_voltage_per_cell: parseOptionalVoltage(fields.storageVoltage),
    full_voltage_per_cell: parseOptionalVoltage(fields.fullVoltage),
    empty_voltage_per_cell: parseOptionalVoltage(fields.emptyVoltage),
  };
}

/**
 * True when at least one charging-practice value was explicitly recorded and
 * differs from the assumed defaults — the only case where the detail view
 * renders the Charging Practice card.
 */
export function hasCustomChargingPractice(
  fields: BatteryVoltageFields,
): boolean {
  const {
    storage_voltage_per_cell,
    full_voltage_per_cell,
    empty_voltage_per_cell,
  } = fields;
  if (
    storage_voltage_per_cell != null &&
    storage_voltage_per_cell !== DEFAULT_STORAGE_VOLTAGE_PER_CELL
  )
    return true;
  if (
    full_voltage_per_cell != null &&
    full_voltage_per_cell !== DEFAULT_FULL_VOLTAGE_PER_CELL
  )
    return true;
  if (
    empty_voltage_per_cell != null &&
    empty_voltage_per_cell !== DEFAULT_EMPTY_VOLTAGE_PER_CELL
  )
    return true;
  return false;
}
