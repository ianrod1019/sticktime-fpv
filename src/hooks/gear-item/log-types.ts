export interface MaintenanceLog {
  id: string;
  gear_id: string;
  user_id: string;
  description: string;
  cost: number | null;
  performed_on: string;
  reset_service_clock: boolean;
}

export interface GearLogResult {
  logs: MaintenanceLog[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toLog(row: unknown): MaintenanceLog | null {
  if (!isRecord(row)) return null;
  return {
    id: String(row["id"]),
    gear_id: String(row["gear_id"] ?? ""),
    user_id: String(row["user_id"] ?? ""),
    description: String(row["description"] ?? ""),
    cost: row["cost"] == null ? null : Number(row["cost"]),
    performed_on: String(row["performed_on"] ?? ""),
    reset_service_clock: Boolean(row["reset_service_clock"]),
  };
}

export function mapLogs(rows: unknown): MaintenanceLog[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(toLog).filter((l): l is MaintenanceLog => l !== null);
}
