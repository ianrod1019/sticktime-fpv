import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LedgerEntry {
  gear_id: string;
  gear_name: string;
  gear_type: string;
  purchase_cost: number;
  repair_cost: number;
  total_cost: number;
  flight_minutes: number;
  flight_hours: number;
  cost_per_hour: number;
  flight_count: number;
  last_flight: string | null;
}

export interface LedgerSummary {
  total_investment: number;
  total_repairs: number;
  total_cost: number;
  total_flight_minutes: number;
  total_flight_hours: number;
  total_cost_per_hour: number;
  gear_count: number;
  flight_count: number;
}

interface LedgerRawRow {
  gear_id: string;
  gear_name: string;
  gear_type: string;
  purchase_cost: number | null;
  repair_cost: number | null;
  total_cost: number | null;
  flight_minutes: number | null;
  flight_count: number | null;
  last_flight: string | null;
}

export function useCostPerFlightHourLedger(userId: string | null) {
  return useQuery({
    queryKey: ["cost-per-flight-hour-ledger", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { summary: null, entries: [] };

      const { data, error } = await supabase.rpc(
        "get_cost_per_flight_hour_ledger",
        {
          p_user_id: userId,
        },
      );

      if (error) throw error;

      const rows = (data ?? []) as LedgerRawRow[];
      const entries: LedgerEntry[] = rows.map((row) => {
        const flightHours = row.flight_minutes != null ? row.flight_minutes / 60 : 0;
        return {
          gear_id: row.gear_id,
          gear_name: row.gear_name,
          gear_type: row.gear_type,
          purchase_cost: row.purchase_cost ?? 0,
          repair_cost: row.repair_cost ?? 0,
          total_cost: row.total_cost ?? 0,
          flight_minutes: row.flight_minutes ?? 0,
          flight_hours: flightHours,
          cost_per_hour: flightHours > 0 ? (row.total_cost ?? 0) / flightHours : 0,
          flight_count: row.flight_count ?? 0,
          last_flight: row.last_flight,
        };
      });

      const summary: LedgerSummary = {
        total_investment: entries.reduce((sum, e) => sum + e.purchase_cost, 0),
        total_repairs: entries.reduce((sum, e) => sum + e.repair_cost, 0),
        total_cost: entries.reduce((sum, e) => sum + e.total_cost, 0),
        total_flight_minutes: entries.reduce(
          (sum, e) => sum + e.flight_minutes,
          0,
        ),
        total_flight_hours: entries.reduce((sum, e) => sum + e.flight_hours, 0),
        total_cost_per_hour:
          entries.reduce((sum, e) => sum + e.flight_minutes, 0) / 60 > 0
            ? entries.reduce((sum, e) => sum + e.total_cost, 0) /
              (entries.reduce((sum, e) => sum + e.flight_minutes, 0) / 60)
            : 0,
        gear_count: entries.length,
        flight_count: entries.reduce((sum, e) => sum + e.flight_count, 0),
      };

      return { summary, entries };
    },
  });
}