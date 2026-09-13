import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live catch-up layer: one Supabase Realtime subscription for every
 * user-facing table. postgres_changes events invalidate the affected query
 * keys so any mounted screen refetches automatically — edits made on another
 * device or by another tab appear without a reload.
 *
 * RLS still governs delivery: Postgres only broadcasts rows the subscriber's
 * JWT can SELECT, so this never leaks another pilot's data.
 */

const TABLE_QUERY_KEYS: Record<string, string[]> = {
  // gear tables feed hanger, detail pages and dashboard rig stats
  "personal_gear:batteries": [
    "hanger",
    "gear-item",
    "gear",
    "drone-options",
    "cost-ledger",
  ],
  "personal_gear:drones": [
    "hanger",
    "gear-item",
    "gear",
    "drone-build",
    "drone-options",
    "cost-ledger",
    "active-rigs",
    "rig-usage",
  ],
  "personal_gear:transmitters": ["hanger", "gear-item", "gear", "cost-ledger"],
  "personal_gear:goggles": ["hanger", "gear-item", "gear", "cost-ledger"],
  "personal_gear:other_gear": ["hanger", "gear-item", "gear", "cost-ledger"],
  // parts / installs feed the bench inventory and build sheets
  "personal_gear:drone_parts": [
    "master-inventory",
    "drone-build",
    "gear-parts",
  ],
  "personal_gear:drone_part_installs": [
    "part-installs",
    "drone-build",
    "master-inventory",
  ],
  "personal_gear:transmitter_parts": ["hanger", "gear-parts"],
  "personal_gear:goggles_parts": ["hanger", "gear-parts"],
  "personal_gear:other_parts": ["hanger", "gear-parts"],
  // logs and battery telemetry
  "personal_gear:maintenance_logs": ["gear-logs", "hanger", "cost-ledger"],
  "personal_gear:battery_packs": ["battery-packs"],
  "personal_gear:battery_ir_readings": ["battery-ir"],
  // squadron org_gear fleet feeds the org hanger + org ledger. The legacy
  // org_gear.squadron_gear checkout tables are intentionally absent: no
  // mounted screen reads them anymore (the hanger page reads the per-type
  // tables directly), so subscribing would only waste a channel entry.
  "org_gear:drones": ["hanger-org", "hanger-org-ledger"],
  "org_gear:batteries": ["hanger-org", "hanger-org-ledger"],
  "org_gear:transmitters": ["hanger-org", "hanger-org-ledger"],
  "org_gear:goggles": ["hanger-org", "hanger-org-ledger"],
  "org_gear:other_gear": ["hanger-org", "hanger-org-ledger"],
  "org_gear:drone_parts": [
    "hanger-org",
    "hanger-org-ledger",
    "org-failure-analytics",
  ],
  "org_gear:drone_part_installs": ["hanger-org", "hanger-org-ledger"],
  "org_gear:transmitter_parts": ["hanger-org"],
  "org_gear:goggles_parts": ["hanger-org"],
  "org_gear:other_parts": ["hanger-org"],
  "org_gear:maintenance_logs": [
    "hanger-org",
    "hanger-org-ledger",
    "org-failure-analytics",
  ],
  // sessions drive the flight log and every dashboard metric
  "public:sessions": [
    "log-data",
    "session-totals",
    "monthly-volume",
    "heatmap",
    "recent-sessions",
    "active-rigs",
    "current-streak",
    "weekly-goal",
    "cost-ledger",
  ],
};

/** Keys that must never trigger a refetch storm from realtime. */
const SENSITIVE_PREFIXES = new Set(["admin-", "role-and-tier", "pro-access"]);

/**
 * Debounce window for realtime-triggered refetches. A busy table (bulk
 * import, another tab hammering writes, a churning checkout) fires one
 * postgres_changes event per row — without coalescing, every mounted screen
 * refetches once per row. All invalidations inside the window collapse into
 * one refetch per query prefix. This is the app-wide "no refetch storm, no
 * runaway egress" guard.
 */
const INVALIDATION_DEBOUNCE_MS = 2_000;

const pendingInvalidations = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleInvalidation(
  queryClient: ReturnType<typeof useQueryClient>,
  prefix: string,
) {
  const existing = pendingInvalidations.get(prefix);
  if (existing !== undefined) return; // already scheduled within the window
  const timer = setTimeout(() => {
    pendingInvalidations.delete(prefix);
    queryClient.invalidateQueries({ queryKey: [prefix] });
  }, INVALIDATION_DEBOUNCE_MS);
  pendingInvalidations.set(prefix, timer);
}

function invalidateForTable(
  queryClient: ReturnType<typeof useQueryClient>,
  tableRef: string,
) {
  const prefixes = TABLE_QUERY_KEYS[tableRef];
  if (!prefixes) return;
  for (const prefix of prefixes) {
    if (SENSITIVE_PREFIXES.has(prefix)) continue;
    scheduleInvalidation(queryClient, prefix);
  }
}

/**
 * Mounts the realtime subscription for the lifetime of the app shell.
 * No-op on the server (window undefined) and when unauthenticated — the
 * channel is (re)created whenever the user id changes.
 */
export function useRealtimeInvalidation(userId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    const tables = Object.keys(TABLE_QUERY_KEYS);
    const channel = supabase.channel(`cache-catchup-${userId}`);

    for (const tableRef of tables) {
      const [schema, table] = tableRef.split(":");
      // Typed as unknown: supabase-js's channel.on overloads narrow on
      // literal schema/table strings, which a dynamic pair can't satisfy.
      (channel as unknown as { on: (...args: unknown[]) => void }).on(
        "postgres_changes",
        {
          event: "*",
          schema,
          table,
        },
        () => invalidateForTable(queryClient, tableRef),
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      // Timers from this mount must not fire after unmount.
      for (const timer of pendingInvalidations.values()) clearTimeout(timer);
      pendingInvalidations.clear();
    };
  }, [userId, queryClient]);
}
