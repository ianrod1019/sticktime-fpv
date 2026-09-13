import { supabase } from "@/integrations/supabase/client";
import { isAdmin } from "./role-verification";
import {
  deltaSyncRead,
  deltaSyncRemoveLocal,
  deltaSyncUpsertLocal,
  type DeltaSyncResult,
} from "./delta-sync";

/**
 * Safety cap: any select without an explicit limit pulls at most this many
 * rows. Prevents an unbounded query from draining the user's bandwidth or
 * enumerating a whole table in one request. Callers needing more must page
 * (see `pagination` below).
 */
const MAX_ROWS_PER_QUERY = 500;

/**
 * Write-payload guards: rejects inserts/updates that would push an absurd
 * batch to the Data API (accidental runaway loop or hostile local code).
 * These fail fast client-side — no request leaves the browser.
 */
const MAX_ROWS_PER_WRITE = 50;
const MAX_WRITE_PAYLOAD_CHARS = 256 * 1024; // 256 KB of serialized JSON

export interface Pagination {
  /** Zero-based page index. */
  index: number;
  /** Rows per page (>0). */
  size: number;
}

const PERSONAL_GEAR_SCHEMA = "personal_gear";
const ORG_GEAR_SCHEMA = "org_gear";
/** The gear tables exist with identical names in personal_gear AND org_gear. */
const PERSONAL_GEAR_TABLES = new Set([
  "batteries",
  "drones",
  "transmitters",
  "goggles",
  "other_gear",
  "drone_parts",
  "drone_part_installs",
  "transmitter_parts",
  "goggles_parts",
  "other_parts",
  "maintenance_logs",
]);

/**
 * Resolves the gear schema a request actually targets: an explicit schema is
 * honored (personal_gear or org_gear — same table names in both), and a
 * schema-less request defaults to personal_gear for the known gear tables.
 * Returns null when the table is not a synced gear table.
 */
function resolveGearSchema(schema?: string, table?: string): string | null {
  if (!table) return null;
  if (schema === PERSONAL_GEAR_SCHEMA || schema === ORG_GEAR_SCHEMA) {
    return PERSONAL_GEAR_TABLES.has(table) ? schema : null;
  }
  if (schema == null && PERSONAL_GEAR_TABLES.has(table)) {
    return PERSONAL_GEAR_SCHEMA;
  }
  return null;
}

function isPersonalGearTable(schema?: string, table?: string): boolean {
  return resolveGearSchema(schema, table) === PERSONAL_GEAR_SCHEMA;
}

export async function db_request<T = any>({
  mode,
  rpcFunction,
  rpcParams,
  schema,
  table,
  operation,
  selectColumns,
  data,
  filters,
  orderBy,
  limit,
  pagination,
  head,
  single,
  count,
  sync = "full",
  forceFullSync = false,
  syncScope,
  requireAdmin = false,
  allowedRoles = [],
}: {
  mode: "rpc" | "query";
  rpcFunction?: string;
  rpcParams?: Record<string, any>;
  schema?: string;
  table?: string;
  operation?: "select" | "insert" | "update" | "delete" | "count" | "upsert";
  selectColumns?: string;
  data?: any;
  filters?: Record<string, any>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  /** Keyset-free range pagination: .range(index*size, index*size+size-1). */
  pagination?: Pagination;
  head?: boolean;
  single?: boolean;
  count?: "exact" | "planned" | "estimated";
  /**
   * Incremental sync mode for personal_gear selects (default "full"):
   *  - "delta": only fetch rows newer than the client's watermark
   *    (`updated_at > last_synced_at`), merged with the cached rows — usually
   *    0 rows transferred. Falls back to a paged full pull when the cache is
   *    empty/older than the TTL, so it never serves stale data as current.
   *  - "full": plain one-shot select (legacy behavior).
   */
  sync?: "delta" | "full";
  /** When true, a delta read performs a full reconcile first. */
  forceFullSync?: boolean;
  /**
   * Delta-sync cache owner key. Defaults to the signed-in user id; org_gear
   * reads pass the team id so the whole squadron shares one warm cache.
   */
  syncScope?: string;
  requireAdmin?: boolean;
  allowedRoles?: string[];
}): Promise<{ data: T | null; error: Error | null; count?: number }> {
  if (!["rpc", "query"].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Must be 'rpc' or 'query'.`);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    return { data: null, error: userError };
  }

  const userId = userData.user?.id ?? null;

  // Fetch the user's role from the profiles table instead of relying on
  // auth user metadata, which may not contain a role field.
  const userRole = await fetchUserRole(userId);

  if (requireAdmin && !isAdmin(userRole ?? undefined)) {
    throw new Error("Admin access required");
  }

  if (allowedRoles.length > 0 && userRole && !allowedRoles.includes(userRole)) {
    throw new Error(
      `User role "${userRole}" not in allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  const isPersonalGear = isPersonalGearTable(schema, table);
  const isAdminUser = isAdmin(userRole ?? undefined);

  // Auto-inject user_id ownership filter for personal_gear tables when non-admin
  const mergedFilters = (extraFilters?: Record<string, any>) => {
    if (!isPersonalGear || isAdminUser || !userId) return extraFilters ?? {};
    const base: Record<string, any> = { user_id: userId };
    if (extraFilters && Object.keys(extraFilters).length > 0) {
      return { ...extraFilters, ...base };
    }
    return base;
  };

  // Auto-inject user_id into insert data for personal_gear tables.
  // Applies to admins too: RLS WITH CHECK (user_id = auth.uid()) still applies
  // to the authenticated role even for admin users, so an insert without
  // user_id would fail. Explicitly-provided user_id is never overwritten
  // (allows admin "on behalf of" inserts).
  const injectOwner = (payload: any) => {
    if (!isPersonalGear || !userId || !payload) return payload;
    if (Array.isArray(payload)) {
      return payload.map((row: any) =>
        row && row.user_id == null ? { ...row, user_id: userId } : row,
      );
    }
    return payload.user_id == null ? { ...payload, user_id: userId } : payload;
  };

  try {
    if (mode === "rpc") {
      if (!rpcFunction) {
        throw new Error("RPC mode requires rpcFunction parameter.");
      }
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        rpcFunction,
        rpcParams ?? {},
      );
      if (rpcError) {
        return { data: null, error: rpcError };
      }
      return { data: rpcData, error: null };
    }

    if (!table) {
      throw new Error("Query mode requires table parameter.");
    }

    const fromBuilder = schema
      ? supabase.schema(schema).from(table)
      : supabase.from(table);

    const applyFilters = (query: any, extraFilters?: Record<string, any>) => {
      const allFilters = mergedFilters(extraFilters);
      if (Object.keys(allFilters).length > 0) {
        Object.entries(allFilters).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else if (typeof value === "object" && value !== null) {
            // Support range operators: $gte, $gt, $lte, $lt
            if (value.$gte !== undefined) query = query.gte(key, value.$gte);
            if (value.$gt !== undefined) query = query.gt(key, value.$gt);
            if (value.$lte !== undefined) query = query.lte(key, value.$lte);
            if (value.$lt !== undefined) query = query.lt(key, value.$lt);
            if (value.$eq !== undefined) query = query.eq(key, value.$eq);
          } else {
            query = query.eq(key, value);
          }
        });
      }
      return query;
    };

    const applyOrder = (query: any) => {
      if (orderBy) {
        query = query.order(orderBy.column, {
          ascending: orderBy.ascending ?? true,
        });
      }
      return query;
    };

    const applyLimit = (query: any) => {
      if (pagination !== undefined) {
        const size = Math.max(1, pagination.size);
        const index = Math.max(0, pagination.index);
        query = query.range(index * size, index * size + size - 1);
      } else if (limit !== undefined) {
        query = query.limit(Math.min(limit, MAX_ROWS_PER_QUERY));
      } else {
        // Hard safety cap — no unbounded client query.
        query = query.limit(MAX_ROWS_PER_QUERY);
      }
      return query;
    };

    switch (operation ?? "select") {
      case "select": {
        // ---- Incremental sync path ----------------------------------------
        if (sync === "delta") {
          if (
            pagination !== undefined ||
            head ||
            single ||
            count !== undefined
          ) {
            throw new Error(
              "sync:'delta' does not support pagination/head/single/count.",
            );
          }
          try {
            const result = await deltaSyncRead<Record<string, unknown>, T>({
              table: table!,
              schema: schema ?? PERSONAL_GEAR_SCHEMA,
              scope: syncScope ?? userId ?? "anon",
              columns: selectColumns ?? "*",
              filters: mergedFilters(filters),
              forceFull: forceFullSync,
              // Without caller filters the read owns the whole table for its
              // scope, so a full reconcile can safely REPLACE the cache —
              // letting it observe rows deleted server-side.
              reconcileReplaces: !filters || Object.keys(filters).length === 0,
              reduce: (rows: Record<string, unknown>[]) => rows as unknown as T,
            });
            return {
              data: result.data,
              error: null,
            };
          } catch (syncErr) {
            return {
              data: null,
              error:
                syncErr instanceof Error ? syncErr : new Error(String(syncErr)),
            };
          }
        }

        const selectStr = selectColumns ?? "*";
        // Range pagination needs an exact count alongside the page rows.
        const wantsCount = count !== undefined || pagination !== undefined;
        let query = fromBuilder.select(
          selectStr,
          wantsCount ? { count: count ?? "exact" } : undefined,
        );
        query = applyFilters(query, filters);
        query = applyOrder(query);
        query = applyLimit(query);

        if (head || single) {
          query = query.limit(1);
          const { data: selectData, error: selectError } = await query.single();
          if (selectError) {
            return { data: null, error: selectError };
          }
          return { data: selectData as T, error: null };
        }

        const {
          data: selectData,
          error: selectError,
          count: rowCount,
        } = await query;
        if (selectError) {
          return { data: null, error: selectError };
        }
        return {
          data: selectData as T,
          error: null,
          ...(rowCount !== undefined && rowCount !== null
            ? { count: rowCount }
            : {}),
        };
      }

      case "insert":
      case "upsert": {
        if (!data) {
          throw new Error(`${operation} operation requires data parameter.`);
        }
        const insertData = Array.isArray(data) ? data : [data];
        assertWritePayload(insertData);
        const payload = injectOwner(insertData);
        const builder =
          operation === "upsert"
            ? fromBuilder.upsert(payload)
            : fromBuilder.insert(payload);
        let query: any = builder.select();
        if (single) query = query.single();
        const { data: insertResult, error: insertError } = await query;
        if (insertError) {
          return { data: null, error: insertError };
        }
        // With single:true supabase-js resolves to a single object, not an
        // array — indexing [0] would always yield undefined.
        return {
          data: (single
            ? insertResult
            : Array.isArray(data)
              ? insertResult
              : (insertResult?.[0] ?? null)) as T,
          error: null,
        };
      }

      case "update": {
        if (!data) {
          throw new Error("Update operation requires data parameter.");
        }
        assertWritePayload(Array.isArray(data) ? data : [data]);
        if (!filters || Object.keys(filters).length === 0) {
          throw new Error(
            "Update operation requires filters to identify rows.",
          );
        }
        let query = fromBuilder.update(data);
        query = applyFilters(query, filters);
        if (head || single) {
          query = query.limit(1);
          const { data: updateResult, error: updateError } =
            await query.single();
          if (updateError) {
            return { data: null, error: updateError };
          }
          return { data: updateResult as T, error: null };
        } else {
          const { data: updateResult, error: updateError } =
            await query.select();
          if (updateError) {
            return { data: null, error: updateError };
          }
          return { data: updateResult as T, error: null };
        }
      }

      case "delete": {
        if (!filters || Object.keys(filters).length === 0) {
          throw new Error(
            "Delete operation requires filters to identify rows.",
          );
        }
        let query = fromBuilder.delete();
        query = applyFilters(query, filters);
        if (head || single) {
          query = query.limit(1);
          const { data: deleteResult, error: deleteError } =
            await query.single();
          if (deleteError) {
            return { data: null, error: deleteError };
          }
          evictDeletedFromSyncCache(
            schema,
            table,
            syncScope ?? userId,
            deleteResult,
          );
          return { data: deleteResult as T, error: null };
        } else {
          const { data: deleteResult, error: deleteError } =
            await query.select();
          if (deleteError) {
            return { data: null, error: deleteError };
          }
          evictDeletedFromSyncCache(
            schema,
            table,
            syncScope ?? userId,
            deleteResult,
          );
          return { data: deleteResult as T, error: null };
        }
      }

      case "count": {
        let query = fromBuilder.select(selectColumns ?? "*", {
          count: count ?? "exact",
        });
        query = applyFilters(query, filters);
        const { count: rowCount, error: countError } = await query;
        if (countError) {
          return { data: null, error: countError };
        }
        return { data: null, error: null, count: rowCount ?? 0 };
      }

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export interface DbRequestOptions {
  mode: "rpc" | "query";
  rpcFunction?: string;
  rpcParams?: Record<string, any>;
  schema?: string;
  table?: string;
  operation?: "select" | "insert" | "update" | "delete" | "count" | "upsert";
  selectColumns?: string;
  data?: any;
  filters?: Record<string, any>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  /** Keyset-free range pagination: .range(index*size, index*size+size-1). */
  pagination?: Pagination;
  head?: boolean;
  single?: boolean;
  count?: "exact" | "planned" | "estimated";
  requireAdmin?: boolean;
  allowedRoles?: string[];
}

export interface DbRequestResult<T = any> {
  data: T | null;
  error: Error | null;
  count?: number;
}

export async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_is_admin", {
    p_user_id: userId,
  });
  if (error) throw error;
  return data === true || (data && (data as any).is_admin === true);
}

export async function fetchUserRole(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (error) return null;
  return (data as any)?.role ?? "user";
}

export async function isUserInRoles(
  userId: string,
  roles: string[],
): Promise<boolean> {
  const role = await fetchUserRole(userId);
  return role ? roles.includes(role) : false;
}

/**
 * Throw when a write payload is bigger than anything the app legitimately
 * sends (single rows, or small batches at most). Local, synchronous, free.
 */
function assertWritePayload(rows: unknown[]): void {
  if (rows.length > MAX_ROWS_PER_WRITE) {
    throw new Error(
      `Write rejected: ${rows.length} rows exceeds the ${MAX_ROWS_PER_WRITE}-row payload cap.`,
    );
  }
  const serialized = JSON.stringify(rows);
  if (serialized.length > MAX_WRITE_PAYLOAD_CHARS) {
    throw new Error(
      `Write rejected: payload exceeds ${MAX_WRITE_PAYLOAD_CHARS / 1024} KB.`,
    );
  }
}

/**
 * Drop rows just deleted through db_request from the delta-sync cache so
 * subsequent delta reads never resurrect them. A delete does not bump
 * `updated_at`, so the eviction must happen here, at the moment of deletion.
 * No-op when nothing relevant is cached; the next full reconcile repairs
 * any remaining gaps.
 */
function evictDeletedFromSyncCache(
  schema: string | undefined,
  table: string | undefined,
  scope: string | null,
  deleted: unknown,
): void {
  const syncSchema = resolveGearSchema(schema, table);
  if (!syncSchema || !scope) {
    return;
  }
  const rows: Array<Record<string, unknown>> = Array.isArray(deleted)
    ? (deleted as Array<Record<string, unknown>>)
    : deleted && typeof deleted === "object"
      ? [deleted as Record<string, unknown>]
      : [];
  const ids = rows
    .map((row) => row?.["id"])
    .filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return;
  deltaSyncRemoveLocal(syncSchema, table!, scope, ids);
}

/**
 * Write a freshly created/updated personal_gear row into the delta-sync cache
 * so subsequent delta reads see it immediately (advances the watermark).
 * No-op when there is no cache for that table+user yet.
 */
export function primeDeltaSyncCache(
  table: string,
  scope: string,
  row: Record<string, unknown>,
  schema: string = PERSONAL_GEAR_SCHEMA,
): void {
  deltaSyncUpsertLocal(schema, table, scope, row);
}

export type { DeltaSyncResult };

export async function getUserSessionsWithGear(
  userId: string,
  sessionIds?: string[],
): Promise<any[]> {
  const { data, error } = await supabase.rpc("get_user_sessions_with_gear", {
    p_user_id: userId,
    p_session_ids: sessionIds || null,
  });
  if (error) throw error;
  return data as any[];
}
