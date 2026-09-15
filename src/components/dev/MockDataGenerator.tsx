import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db_request } from "@/lib/db_request";
import { usePilot } from "@/hooks/use-pilot";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Trash2 } from "lucide-react";

/** Tag on every fixture row so it can be found and wiped later. */
const MOCK_TAG = "QA-MOCK";

const DRONE_NAMES = ["5-inch Freestyle", "3-inch Toothpick", "7-inch Long Range", "Cinewhoop"];
const BATTERY_NAMES = ["4S 1300mAh", "6S 850mAh", "4S 650mAh Baby", "6S 1400mAh"];
const TX_NAMES = ["EdgeTX Radio", "Backup Radio"];
const GOGGLE_NAMES = ["Analog Goggles", "Digital Goggles"];

type GearTable = "drones" | "batteries" | "transmitters" | "goggles";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

/**
 * Live schema: pack_count exists on batteries/drones/other_gear only;
 * cells + connector_type exist on batteries/drones only. Sending a column
 * a table lacks 400s with a schema-cache error (PGRST204).
 */
function gearColumnsFor(table: GearTable): Record<string, unknown> {
  if (table === "batteries" || table === "drones") {
    return {
      pack_count: table === "batteries" ? 4 : 0,
      cells: 6,
      connector_type: "XT60",
    };
  }
  return {};
}

async function insertMockGear(table: GearTable, name: string) {
  const { data, error } = await db_request({
    mode: "query",
    schema: "personal_gear",
    table,
    operation: "insert",
    data: {
      name: `[QA] ${name}`,
      brand: MOCK_TAG,
      service_interval_minutes: 600,
      ...gearColumnsFor(table),
      purchase_cost: Math.round(Math.random() * 400),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    single: true,
  });
  if (error) throw error;
  return data as { id: string };
}

/** A few deliberately awkward rows: zero duration, huge duration, no gear attached. */
async function insertMockSession(userId: string, overrides: Record<string, unknown>) {
  const { error } = await db_request({
    mode: "query",
    schema: "public",
    table: "sessions",
    operation: "insert",
    data: {
      // sessions RLS requires the row's user_id to match the caller — omitting
      // it 403s (the column has no default).
      user_id: userId,
      session_type: "sim",
      flown_on: new Date(
        Date.now() - Math.floor(Math.random() * 30) * 86400000,
      ).toISOString(),
      duration_minutes: 20,
      drone_id: null,
      controller_id: null,
      goggles_id: null,
      battery_set_id: null,
      location_id: null,
      track_id: null,
      sim_platform: "Liftoff",
      packs_flown: 0,
      crashes: 0,
      battery_notes: null,
      weather: null,
      notes: `[${MOCK_TAG}] fixture session`,
      ...overrides,
    },
  });
  if (error) throw error;
}

async function generateFixtures(userId: string) {
  const drone = await insertMockGear("drones", pick(DRONE_NAMES));
  const battery = await insertMockGear("batteries", pick(BATTERY_NAMES));
  await insertMockGear("transmitters", pick(TX_NAMES));
  await insertMockGear("goggles", pick(GOGGLE_NAMES));

  // Normal-looking real flights against the fixture gear.
  for (let i = 0; i < 5; i++) {
    await insertMockSession(userId, {
      session_type: "real",
      drone_id: drone.id,
      battery_set_id: battery.id,
      duration_minutes: 5 + Math.floor(Math.random() * 25),
      packs_flown: 1 + Math.floor(Math.random() * 4),
      crashes: Math.random() < 0.2 ? 1 : 0,
    });
  }

  // Edge cases worth exercising in the UI: zero-length session, a very long
  // one, and a sim session with no gear selected at all.
  await insertMockSession(userId, { duration_minutes: 0, notes: `[${MOCK_TAG}] zero-duration edge case` });
  await insertMockSession(userId, { duration_minutes: 480, session_type: "real", drone_id: drone.id, notes: `[${MOCK_TAG}] marathon session edge case` });
  await insertMockSession(userId, { notes: `[${MOCK_TAG}] no gear attached edge case` });
}

async function clearFixtures() {
  const gearTables: GearTable[] = ["drones", "batteries", "transmitters", "goggles"];
  for (const table of gearTables) {
    const { error } = await db_request({
      mode: "query",
      schema: "personal_gear",
      table,
      operation: "delete",
      filters: { brand: MOCK_TAG },
    });
    if (error) throw error;
  }

  const { data: sessions, error: fetchError } = await db_request({
    mode: "query",
    schema: "public",
    table: "sessions",
    operation: "select",
    selectColumns: "id, notes",
  });
  if (fetchError) throw fetchError;

  const mockSessionIds = ((sessions as { id: string; notes: string | null }[]) ?? [])
    .filter((s) => s.notes?.includes(MOCK_TAG))
    .map((s) => s.id);

  if (mockSessionIds.length > 0) {
    const { error } = await db_request({
      mode: "query",
      schema: "public",
      table: "sessions",
      operation: "delete",
      filters: { id: mockSessionIds },
    });
    if (error) throw error;
  }
}

export function MockDataGenerator() {
  const queryClient = useQueryClient();
  const { userId } = usePilot();
  const [runCount, setRunCount] = useState(0);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["hanger"] });
    queryClient.invalidateQueries({ queryKey: ["log-data"] });
  };

  const generate = useMutation({
    mutationFn: () => {
      if (!userId) return Promise.reject(new Error("Not signed in"));
      return generateFixtures(userId);
    },
    onSuccess: () => {
      setRunCount((n) => n + 1);
      invalidate();
      toast.success("Fixture data generated — 4 gear items, 8 sessions incl. edge cases");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to generate fixtures"),
  });

  const clear = useMutation({
    mutationFn: clearFixtures,
    onSuccess: () => {
      setRunCount(0);
      invalidate();
      toast.success("Fixture data cleared");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to clear fixtures"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Mock data generator
        </CardTitle>
        <CardDescription>
          Seeds realistic gear and flight sessions into your own hanger —
          including zero-duration, marathon-length, and no-gear edge cases —
          for exercising the UI under load. Every row is tagged{" "}
          <code className="text-[11px]">{MOCK_TAG}</code> so it never mixes
          with real data and can be wiped in one click.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          size="sm"
        >
          {generate.isPending ? "Generating…" : "Generate fixture set"}
        </Button>
        <Button
          onClick={() => clear.mutate()}
          disabled={clear.isPending}
          variant="outline"
          size="sm"
          className="gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear mock data
        </Button>
        {runCount > 0 && (
          <Badge variant="secondary" className="font-mono text-[10px]">
            {runCount} batch{runCount > 1 ? "es" : ""} generated this session
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
