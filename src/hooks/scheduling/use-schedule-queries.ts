/**
 * Supporting scheduling queries: the assignable roster, org fleet
 * pickers, the person-overlap lookup (warn-but-allow), and the realtime
 * subscription that repaints the grid when a teammate moves a booking.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getOrgAirframes,
  getOrgBatteries,
  getOrgRoster,
  getPersonConflicts,
  subscribeToScheduleEvents,
} from "@/lib/scheduling/api";
import type { GearOption, PersonConflict } from "@/lib/scheduling/types";

export function useOrgRoster(teamId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["schedule-roster", teamId],
    queryFn: () => getOrgRoster(teamId as string),
    enabled: enabled && !!teamId,
    staleTime: 60_000,
  });
}

export function useOrgAirframeOptions(teamId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["schedule-airframes", teamId],
    queryFn: () => getOrgAirframes(teamId as string),
    enabled: enabled && !!teamId,
    staleTime: 60_000,
  });
}

export function useOrgBatteryOptions(teamId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["schedule-batteries", teamId],
    queryFn: () => getOrgBatteries(teamId as string),
    enabled: enabled && !!teamId,
    staleTime: 60_000,
  });
}

/**
 * Person conflicts for the confirm flow. Called with enabled=false until
 * the dialog wants to check a specific window.
 */
export function usePersonConflicts(params: {
  userId: string | null;
  start: string | null;
  end: string | null;
  excludeId?: string | null;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: [
      "person-conflicts",
      params.userId,
      params.start,
      params.end,
      params.excludeId ?? null,
    ],
    queryFn: (): Promise<PersonConflict[]> =>
      getPersonConflicts({
        userId: params.userId as string,
        start: params.start as string,
        end: params.end as string,
        excludeId: params.excludeId ?? null,
      }),
    enabled:
      params.enabled && !!params.userId && !!params.start && !!params.end,
    staleTime: 0,
  });
}

/** Live repaints: any schedules change for this org invalidates the grid. */
export function useScheduleRealtime(teamId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!teamId) return;
    return subscribeToScheduleEvents(teamId, () => {
      void qc.invalidateQueries({
        queryKey: ["schedule-events", teamId],
      });
    });
  }, [teamId, qc]);
}
