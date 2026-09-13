/**
 * Delta sync layer — every DB read only fetches rows the client does not
 * already have.
 *
 * Mechanism per table + scope (e.g. user_id):
 *  - a localStorage "sync state" stores the high-water mark (`last_synced_at`,
 *    the newest `updated_at` we have seen) and a compact row cache of the
 *    columns we actually use (`id -> row`).
 *  - a "delta pass" queries `updated_at > last_synced_at` and merges the
 *    returned rows into the cache by id. Typically transfers 0 rows.
 *  - a "full reconcile" re-pulls the complete row set (paged, so it drains
 *    any volume) and rebuilds the cache. It runs when the cache is empty,
 *    when the sync state is older than the TTL (default 24h), or on demand.
 *    It is also the only pass that can observe server-side deletions: when
 *    the read owns the whole table for its scope (no caller filters) the
 *    reconcile REPLACES the cache, so remotely deleted rows vanish locally
 *    instead of lingering as ghosts.
 *
 * Persistence is a speed layer, never a ceiling:
 *  - the row cache is capped (`MAX_CACHED_ROWS`); beyond it the layer switches
 *    to paged streaming mode where rows are aggregated in memory and only the
 *    final aggregates + watermark are stored.
 *  - all writes are wrapped — a quota failure never breaks a read; the next
 *    full reconcile repairs the cache.
 */

import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Rows kept in the localStorage row cache per table+scope. */
export const MAX_CACHED_ROWS = 2000;

/** Sync states older than this trigger a full reconcile. */
export const DELTA_SYNC_TTL_MS = 24 * 60 * 60 * 1000;

/** Cap applied to any single unpaginated pull (defensive, mirrors db_request). */
export const MAX_ROWS_PER_PULL = 500;

/**
 * TTL for cached RPC results (ledger pages etc.) probed via a watermark RPC.
 * Short: the watermark probe is a few bytes, so a stale hit costs almost
 * nothing; this only bounds the probe frequency.
 */
export const RPC_CACHE_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncState<Row = Record<string, unknown>> {
  /** High-water mark: newest `updated_at` seen, ISO string. */
  lastSyncedAt: string | null;
  /** When this sync state was last advanced (for TTL reconcile). */
  lastSyncAt: string;
  /** Compact row cache (`id -> row`), only used below the row cap. */
  rows: Record<string, Row>;
  /** True once a full reconcile has completed for this key. */
  reconciled: boolean;
}

export interface DeltaSyncOptions<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Gear table name, e.g. "maintenance_logs" (personal_gear or org_gear). */
  table: string;
  /** DB schema holding the table. Defaults to "personal_gear". */
  schema?: string;
  /** Cache scope — the owner key (user id or team id). Never share across owners. */
  scope: string;
  /** Columns to select (always the minimal set; never "*"). */
  columns: string;
  /** Extra PostgREST filters, e.g. `{ category: "motor" }` (AND semantics). */
  filters?: Record<string, unknown>;
  /** Column to order by when pulling (defaults to `updated_at`). */
  orderColumn?: string;
  /** Force a full reconcile regardless of cache state. */
  forceFull?: boolean;
  /**
   * When a full reconcile runs, REPLACE the cache with the pulled rows
   * instead of merging into the old ones. Only safe when this read owns the
   * whole table for its scope (no caller filters narrowing the pull below
   * that scope) — otherwise a subset pull would wrongly drop rows outside
   * the filter. This is what lets a reconcile observe server-side deletions.
   */
  reconcileReplaces?: boolean;
  /** Override the TTL (useful for tests / aggressive freshness). */
  ttlMs?: number;
  /** Merge + reduce of the cached rows into the final result. */
  reduce: (rows: Row[]) => unknown;
}

export interface DeltaSyncResult<T = unknown> {
  data: T;
  /** Which pass produced the result. */
  pass: "full" | "delta" | "cache";
  /** Rows transferred over the network in this pass. */
  transferredRows: number;
}

// ---------------------------------------------------------------------------
// Storage (quota-safe)
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "delta-sync:";

function storageKey(schema: string, table: string, scope: string): string {
  return `${STORAGE_PREFIX}${schema}:${table}:${scope}`;
}

function readState<Row>(key: string): SyncState<Row> | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncState<Row>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.rows || typeof parsed.rows !== "object") parsed.rows = {};
    return parsed;
  } catch {
    return null;
  }
}

function writeState<Row>(key: string, state: SyncState<Row>): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    // Quota exceeded or storage disabled — drop the cache, keep the watermark
    // so the next delta pass stays incremental. Next full reconcile rebuilds.
    try {
      window.localStorage.setItem(key, JSON.stringify({ ...state, rows: {} }));
    } catch {
      /* storage unavailable entirely; in-memory only */
    }
    return false;
  }
}

function removeState(key: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Test/dev helper: drop all delta-sync state (forces a full reconcile on the
 * next read of any table). Also drops the RPC watermark cache.
 */
export function resetDeltaSyncState(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key &&
        (key.startsWith(STORAGE_PREFIX) || key.startsWith(RPC_CACHE_PREFIX))
      ) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

/** Test/dev helper: drop the sync state for one schema+table+scope. */
export function resetDeltaSyncTable(
  schema: string,
  table: string,
  scope: string,
): void {
  removeState(storageKey(schema, table, scope));
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

function updatedAtOf(row: Record<string, unknown>): string | null {
  const value = row ? row["updated_at"] : undefined;
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function idOf(row: Record<string, unknown>): string | null {
  const value = row ? row["id"] : undefined;
  return typeof value === "string" ? value : null;
}

function rowList<Row>(state: SyncState<Row> | null): Row[] {
  if (!state) return [];
  return Object.values(state.rows) as Row[];
}

/** Evict oldest-`updated_at` rows to keep the cache under the cap. */
function evictOverflow<Row>(state: SyncState<Row>): void {
  const ids = Object.keys(state.rows);
  if (ids.length <= MAX_CACHED_ROWS) return;
  const sorted = [...ids]
    .map((id) => ({
      id,
      at: updatedAtOf(state.rows[id] as Record<string, unknown>),
    }))
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  const excess = sorted.length - MAX_CACHED_ROWS;
  for (let i = 0; i < excess; i++) {
    const victim = sorted[i];
    if (victim) delete state.rows[victim.id];
  }
}

// ---------------------------------------------------------------------------
// PostgREST helpers (own the filters; RLS still scopes every query)
// ---------------------------------------------------------------------------

// The builder chain is typed loosely (mirroring db_request's `query: any`)
// because dynamic table/column names defeat supabase-js's literal overloads.
function applyFilters(query: any, filters?: Record<string, unknown>): any {
  let q = query;
  if (!filters) return q;
  for (const [key, value] of Object.entries(filters)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      q = q.in(key, value);
    } else if (typeof value === "object") {
      const range = value as Record<string, unknown>;
      if (range["$gte"] !== undefined) q = q.gte(key, range["$gte"]);
      if (range["$gt"] !== undefined) q = q.gt(key, range["$gt"]);
      if (range["$lte"] !== undefined) q = q.lte(key, range["$lte"]);
      if (range["$lt"] !== undefined) q = q.lt(key, range["$lt"]);
      if (range["$eq"] !== undefined) q = q.eq(key, range["$eq"]);
    } else {
      q = q.eq(key, value);
    }
  }
  return q;
}

/**
 * Pull one page of rows starting at PostgREST range offset `from`.
 * Returns null on error (caller decides whether to fail or fall back).
 */
async function pullPage<Row>(
  table: string,
  columns: string,
  filters: Record<string, unknown> | undefined,
  orderColumn: string,
  from: number,
  to: number,
  schema: string = "personal_gear",
): Promise<Row[] | null> {
  let q: any = supabase.schema(schema).from(table).select(columns);
  q = applyFilters(q, filters);
  q = q.order(orderColumn, { ascending: true }).range(from, to);
  const { data, error } = await q;
  if (error) {
    console.error(`[delta-sync] pull failed for ${table}:`, error.message);
    return null;
  }
  return (data ?? []) as Row[];
}

async function pullAll<Row>(
  table: string,
  columns: string,
  filters: Record<string, unknown> | undefined,
  orderColumn: string,
  schema: string = "personal_gear",
): Promise<{ rows: Row[]; error: boolean }> {
  const rows: Row[] = [];
  const pageSize = MAX_ROWS_PER_PULL;
  let from = 0;
  // Page until a short page comes back — drains any volume, so the row cap
  // and the db_request safety cap never silently truncate a fleet.
  for (;;) {
    const page = await pullPage<Row>(
      table,
      columns,
      filters,
      orderColumn,
      from,
      from + pageSize - 1,
      schema,
    );
    if (page === null) return { rows: [], error: true };
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return { rows, error: false };
}

async function pullDelta<Row>(
  table: string,
  columns: string,
  filters: Record<string, unknown> | undefined,
  orderColumn: string,
  since: string,
  schema: string = "personal_gear",
): Promise<{ rows: Row[]; error: boolean }> {
  const deltaFilters = { ...(filters ?? {}), updated_at: { $gt: since } };
  const rows = await pullPage<Row>(
    table,
    columns,
    deltaFilters,
    orderColumn,
    0,
    MAX_ROWS_PER_PULL - 1,
    schema,
  );
  if (rows === null) return { rows: [], error: true };
  return { rows, error: false };
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Read a table with watermark-based incremental sync.
 *
 * - First read (or post-reset): full reconcile, paged, cache rebuilt.
 * - Warm read: delta pass (`updated_at > watermark`) merged into the cached
 *   rows — usually 0 rows transferred.
 * - Result is always the merged, newest-known set, passed through `reduce`
 *   to build the final payload.
 */
export async function deltaSyncRead<
  Row extends Record<string, unknown> = Record<string, unknown>,
  T = unknown,
>(options: DeltaSyncOptions<Row>): Promise<DeltaSyncResult<T>> {
  const {
    table,
    schema = "personal_gear",
    scope,
    columns,
    filters,
    orderColumn = "updated_at",
    forceFull = false,
    ttlMs = DELTA_SYNC_TTL_MS,
    reduce,
    reconcileReplaces = false,
  } = options;

  const key = storageKey(schema, table, scope);
  const state = readState<Row>(key);

  // Decide the pass type before touching the network.
  const expired =
    !state?.lastSyncAt ||
    Date.now() - Date.parse(state.lastSyncAt) > ttlMs ||
    Number.isNaN(Date.parse(state.lastSyncAt ?? ""));
  const needsFull =
    forceFull ||
    !state ||
    !state.reconciled ||
    expired ||
    Object.keys(state.rows).length === 0;

  if (needsFull) {
    const { rows, error } = await pullAll<Row>(
      table,
      columns,
      filters,
      orderColumn,
      schema,
    );
    if (error) {
      // Serve stale cache if we have one; otherwise surface the failure.
      if (state && Object.keys(state.rows).length > 0) {
        return {
          data: reduce(rowList(state)) as T,
          pass: "cache",
          transferredRows: 0,
        };
      }
      throw new Error(`Could not sync ${table}`);
    }

    const now = new Date().toISOString();
    let watermark = state?.lastSyncedAt ?? null;
    // Replace semantics (when declared safe) let the reconcile observe
    // deletions: rows missing from the fresh pull are dropped. Merge
    // semantics otherwise preserve any rows the pull did not cover.
    const merged: Record<string, Row> = reconcileReplaces
      ? {}
      : state?.rows
        ? { ...state.rows }
        : {};
    for (const row of rows) {
      const id = idOf(row as Record<string, unknown>);
      if (!id) continue;
      merged[id] = row;
      const at = updatedAtOf(row as Record<string, unknown>);
      if (at && (!watermark || at > watermark)) watermark = at;
    }

    const overCap = Object.keys(merged).length > MAX_CACHED_ROWS;
    const nextState: SyncState<Row> = {
      lastSyncedAt: watermark ?? now,
      lastSyncAt: now,
      rows: overCap ? {} : merged,
      reconciled: true,
    };
    writeState(key, nextState);

    return {
      data: reduce(
        overCap ? (rows as Row[]) : (Object.values(merged) as Row[]),
      ) as T,
      pass: "full",
      transferredRows: rows.length,
    };
  }

  // ---- Delta pass ---------------------------------------------------------
  const since = state!.lastSyncedAt ?? epoch;
  const { rows, error } = await pullDelta<Row>(
    table,
    columns,
    filters,
    orderColumn,
    since,
    schema,
  );

  if (error) {
    return {
      data: reduce(rowList(state)) as T,
      pass: "cache",
      transferredRows: 0,
    };
  }

  let watermark = state!.lastSyncedAt;
  const merged: Record<string, Row> = { ...state!.rows };
  for (const row of rows) {
    const id = idOf(row as Record<string, unknown>);
    if (!id) continue;
    merged[id] = row;
    const at = updatedAtOf(row as Record<string, unknown>);
    if (at && (!watermark || at > watermark)) watermark = at;
  }

  evictOverflow(state!);
  const nextState: SyncState<Row> = {
    lastSyncedAt: watermark,
    lastSyncAt: new Date().toISOString(),
    rows: merged,
    reconciled: true,
  };
  evictOverflow(nextState);
  writeState(key, nextState);

  return {
    data: reduce(Object.values(merged) as Row[]) as T,
    pass: "delta",
    transferredRows: rows.length,
  };
}

const epoch = "1970-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Local mutation fast-path (keeps the cache newest without a round trip)
// ---------------------------------------------------------------------------

/**
 * Upsert a row the client just wrote (insert/update) into the sync cache so
 * the watermark can advance past it without waiting for the next pass.
 * For deletes see `deltaSyncRemoveLocal`.
 */
export function deltaSyncUpsertLocal<Row extends Record<string, unknown>>(
  schema: string,
  table: string,
  scope: string,
  row: Row,
): void {
  const key = storageKey(schema, table, scope);
  const state = readState<Row>(key);
  if (!state) return; // nothing cached yet; next read will reconcile
  const id = idOf(row);
  if (!id) return;
  state.rows[id] = row;
  const at = updatedAtOf(row);
  if (at && (!state.lastSyncedAt || at > state.lastSyncedAt)) {
    state.lastSyncedAt = at;
  }
  state.lastSyncAt = new Date().toISOString();
  evictOverflow(state);
  writeState(key, state);
}

// ---------------------------------------------------------------------------
// Watermark-gated RPC result cache (computed reads: ledger pages etc.)
// ---------------------------------------------------------------------------
// The row cache above syncs raw tables. Computed reads (the cost-ledger RPC
// aggregates ten tables) can't be synced row-by-row — but their freshness can
// be probed with a single tiny RPC ("what's the newest updated_at?"), and the
// heavy result cached until that watermark moves.

interface RpcCacheEntry {
  /** RPC + params the payload came from (identity check). */
  fn: string;
  params: Record<string, unknown>;
  /** Rows as returned by the RPC (cached verbatim). */
  rows: unknown[];
  /** Watermark the payload was built from (probe result). */
  watermark: string | null;
  /** When the entry was last probed (TTL bound on probe frequency). */
  probedAt: string;
}

const RPC_CACHE_PREFIX = "delta-sync-rpc:";

function rpcCacheKey(fn: string, scope: string): string {
  return `${RPC_CACHE_PREFIX}${fn}:${scope}`;
}

function readRpcCache(key: string): RpcCacheEntry | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RpcCacheEntry;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRpcCache(key: string, entry: RpcCacheEntry): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
    return true;
  } catch {
    // Quota or storage failure: the next read re-runs the RPC. Never fatal.
    return false;
  }
}

function removeRpcCache(key: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export interface RpcWatermarkReadOptions {
  /** The heavy RPC, e.g. "get_cost_per_flight_hour_ledger". */
  fn: string;
  /** Cache scope — the owner key (user id or team id). */
  scope: string;
  /** RPC params (excluding the watermark probe's scope argument). */
  params: Record<string, unknown>;
  /** The cheap freshness probe RPC, e.g. "get_org_gear_watermark". */
  watermarkFn: string;
  /** Argument object passed to the watermark RPC. */
  watermarkParams: Record<string, unknown>;
  /** Cache TTL on re-probing the watermark (probe is tiny; keep short). */
  ttlMs?: number;
}

export interface RpcWatermarkReadResult<T = unknown> {
  data: T;
  /** "cache" = watermark unchanged, payload served locally (0 heavy rows). */
  pass: "fresh" | "cache" | "error";
  transferredRows: number;
}

/**
 * Read a computed (RPC-aggregated) result through a watermark-gated cache.
 *
 * First call runs the heavy RPC and caches its rows + the watermark. Later
 * calls probe the watermark first; while it is unchanged the cached payload
 * is served — the heavy RPC transfers nothing. Any probe failure falls
 * through to running the RPC (correctness over savings).
 */
export async function rpcWatermarkRead<T = unknown[]>(
  options: RpcWatermarkReadOptions,
): Promise<RpcWatermarkReadResult<T>> {
  const {
    fn,
    scope,
    params,
    watermarkFn,
    watermarkParams,
    ttlMs = RPC_CACHE_TTL_MS,
  } = options;
  const key = rpcCacheKey(fn, scope);
  const cached = readRpcCache(key);
  const probeOk =
    cached &&
    cached.fn === fn &&
    JSON.stringify(cached.params) === JSON.stringify(params);

  if (probeOk) {
    const withinTtl =
      cached!.probedAt &&
      Date.now() - Date.parse(cached!.probedAt) >= 0 &&
      Date.now() - Date.parse(cached!.probedAt) < ttlMs;
    if (withinTtl) {
      return { data: cached!.rows as T, pass: "cache", transferredRows: 0 };
    }
    try {
      const { data: wm, error } = await supabase.rpc(
        watermarkFn,
        watermarkParams,
      );
      if (!error) {
        const at = typeof wm === "string" ? wm : null;
        if (at === cached!.watermark) {
          writeRpcCache(key, {
            ...cached!,
            probedAt: new Date().toISOString(),
          });
          return { data: cached!.rows as T, pass: "cache", transferredRows: 0 };
        }
      }
      // Probe failed or moved on — fall through to a real fetch.
    } catch {
      /* fall through */
    }
  }

  try {
    const { data, error } = await supabase.rpc(fn, params);
    if (error) {
      // Serve the stale cache if we have one, else surface the error.
      if (probeOk) {
        return { data: cached!.rows as T, pass: "error", transferredRows: 0 };
      }
      return { data: [] as unknown as T, pass: "error", transferredRows: 0 };
    }
    const rows = (data ?? []) as unknown[];
    let watermark: string | null = null;
    try {
      const { data: wm, error: wmError } = await supabase.rpc(
        watermarkFn,
        watermarkParams,
      );
      if (!wmError && typeof wm === "string") watermark = wm;
    } catch {
      /* watermark unknown; cache will always re-fetch */
    }
    writeRpcCache(key, {
      fn,
      params,
      rows,
      watermark,
      probedAt: new Date().toISOString(),
    });
    return { data: rows as T, pass: "fresh", transferredRows: rows.length };
  } catch {
    if (probeOk) {
      return { data: cached!.rows as T, pass: "error", transferredRows: 0 };
    }
    return { data: [] as unknown as T, pass: "error", transferredRows: 0 };
  }
}

/** Test/dev helper: drop the RPC watermark cache for one fn+scope. */
export function resetRpcCache(fn: string, scope: string): void {
  removeRpcCache(rpcCacheKey(fn, scope));
}

/**
 * Remove rows the client just deleted from the sync cache so subsequent
 * delta reads never resurrect them. A delete never bumps `updated_at`, so
 * without this eviction a delta pass could not observe it. No-op for rows
 * or tables that are not cached (the next full reconcile repairs anyway).
 */
export function deltaSyncRemoveLocal(
  schema: string,
  table: string,
  scope: string,
  ids: string[],
): void {
  if (ids.length === 0) return;
  const key = storageKey(schema, table, scope);
  const state = readState<Record<string, unknown>>(key);
  if (!state) return;
  let removed = false;
  for (const id of ids) {
    if (id in state.rows) {
      delete state.rows[id];
      removed = true;
    }
  }
  if (removed) {
    state.lastSyncAt = new Date().toISOString();
    writeState(key, state);
  }
}
