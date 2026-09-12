import type { PartCategory } from "./constants";

/**
 * Category-specific spec fields rendered dynamically in PartFormModal and
 * persisted to the drone_parts.specs JSONB column. Each field is flattened to
 * a string before writing (JSONB stores both text and numeric inputs).
 */
export interface SpecField {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "number";
  suffix?: string;
}

export const SPEC_FIELDS: Record<PartCategory, SpecField[]> = {
  motor: [
    {
      key: "kv",
      label: "KV Rating",
      placeholder: "e.g. 1750",
      type: "number",
      suffix: "KV",
    },
    {
      key: "stator_size",
      label: "Stator Size",
      placeholder: "e.g. 2306",
      type: "text",
    },
    {
      key: "mounting",
      label: "Mounting",
      placeholder: "e.g. 16x16 / T-Mount",
      type: "text",
    },
  ],
  vtx: [
    {
      key: "max_power_mw",
      label: "Max Output Power",
      placeholder: "e.g. 800",
      type: "number",
      suffix: "mW",
    },
    {
      key: "bands",
      label: "Bands",
      placeholder: "e.g. A / B / E / F / R",
      type: "text",
    },
    {
      key: "connector",
      label: "Connector",
      placeholder: "e.g. U.FL / MMCX",
      type: "text",
    },
  ],
  aio: [
    { key: "mcu", label: "MCU", placeholder: "e.g. STM32H743", type: "text" },
    {
      key: "esc_amp",
      label: "ESC Rating",
      placeholder: "e.g. 45",
      type: "number",
      suffix: "A",
    },
    {
      key: "mounting",
      label: "Mounting",
      placeholder: "e.g. 25.5x25.5",
      type: "text",
    },
  ],
  frame: [
    {
      key: "wheelbase",
      label: "Wheelbase",
      placeholder: "e.g. 5",
      type: "number",
      suffix: "in",
    },
    {
      key: "arm_thickness",
      label: "Arm Thickness",
      placeholder: "e.g. 5",
      type: "number",
      suffix: "mm",
    },
    {
      key: "material",
      label: "Material",
      placeholder: "e.g. 3K Carbon",
      type: "text",
    },
  ],
  fc: [
    { key: "mcu", label: "MCU", placeholder: "e.g. STM32F722", type: "text" },
    {
      key: "gyro",
      label: "Gyro",
      placeholder: "e.g. BMI270 / ICM42688",
      type: "text",
    },
    {
      key: "mounting",
      label: "Mounting",
      placeholder: "e.g. 30.5x30.5",
      type: "text",
    },
  ],
  esc: [
    {
      key: "esc_amp",
      label: "Continuous Amps",
      placeholder: "e.g. 50",
      type: "number",
      suffix: "A",
    },
    {
      key: "protocol",
      label: "Protocols",
      placeholder: "e.g. DShot600",
      type: "text",
    },
    {
      key: "input_voltage",
      label: "Input Voltage",
      placeholder: "e.g. 3-6S",
      type: "text",
    },
  ],
  rx: [
    {
      key: "protocol",
      label: "Protocol",
      placeholder: "e.g. ELRS 2.4G / Crossfire",
      type: "text",
    },
    {
      key: "antenna",
      label: "Antenna",
      placeholder: "e.g. U.FL Whip",
      type: "text",
    },
  ],
  camera: [
    {
      key: "sensor_size",
      label: "Sensor",
      placeholder: 'e.g. 1/1.8"',
      type: "text",
    },
    {
      key: "fov",
      label: "FOV",
      placeholder: "e.g. 160",
      type: "number",
      suffix: "°",
    },
    {
      key: "system",
      label: "System",
      placeholder: "e.g. Analog / O3 / HDZero",
      type: "text",
    },
  ],
  battery: [
    {
      key: "cells",
      label: "Cell Count",
      placeholder: "e.g. 6",
      type: "number",
      suffix: "S",
    },
    {
      key: "capacity",
      label: "Capacity",
      placeholder: "e.g. 1300",
      type: "number",
      suffix: "mAh",
    },
    {
      key: "c_rating",
      label: "C Rating",
      placeholder: "e.g. 150",
      type: "number",
      suffix: "C",
    },
    {
      key: "connector",
      label: "Connector",
      placeholder: "e.g. XT60",
      type: "text",
    },
  ],
  other: [],
};

export function specFieldsFor(category: string): SpecField[] {
  return SPEC_FIELDS[category as PartCategory] ?? SPEC_FIELDS.other;
}
