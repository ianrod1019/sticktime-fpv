import {
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { experimental_createQueryPersister as createQueryPersister } from "@tanstack/query-persist-client-core";

/**
 * Central React Query configuration: local-first caching with localStorage
 * persistence (instant paint on reload), background refetch on focus /
 * reconnect / realtime events as the "catch-up" mechanism.
 */

const PERSISTER_BUSTER = "v1";
const PERSISTER_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const PERSISTER_KEY_PREFIX = "tanstack-query-";

/**
 * Query-key fragments that must NEVER be written to localStorage: elevated-
 * role signals, entitlements, account identity and the auth session (which
 * contains bearer/refresh tokens). None of them grant anything server-side
 * from a cached copy (the DB is the authority), but caching them on disk is
 * unnecessary risk on shared or compromised machines — and they're cheap to
 * refetch. Checked against the serialized storage key, so EVERY write path
 * (persister internals included) is covered.
 */
const SENSITIVE_KEY_PREFIXES = [
  "role-and-tier",
  "admin-status",
  "admin-",
  "pro-access",
  "pilot-settings",
  "auth-session",
  "current-auth-user-id",
] as const;

function isSensitiveStorageKey(storageKey: string): boolean {
  if (!storageKey.startsWith(PERSISTER_KEY_PREFIX)) return false;
  // Storage keys look like: tanstack-query-["admin-status","<uuid>"]
  const firstKey = storageKey
    .slice(PERSISTER_KEY_PREFIX.length)
    .match(/^"([^"]+)"/)?.[1];
  if (!firstKey) return false;
  return SENSITIVE_KEY_PREFIXES.some(
    (prefix) => firstKey === prefix || firstKey.startsWith(prefix),
  );
}

/**
 * localStorage wrapper that silently drops writes of sensitive keys.
 * Reads/removals pass through so any pre-existing entries still age out.
 */
function createFilteredStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  const inner = window.localStorage;
  return {
    get length() {
      return inner.length;
    },
    getItem: (key: string) => inner.getItem(key),
    setItem: (key: string, value: string) => {
      if (isSensitiveStorageKey(key)) return; // denylist: skip the write
      inner.setItem(key, value);
    },
    removeItem: (key: string) => inner.removeItem(key),
    key: (index: number) => inner.key(index),
    clear: () => inner.clear(),
  };
}

/** Removes every persisted cache entry from localStorage (sign-out hygiene). */
export function purgePersistedCache(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PERSISTER_KEY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch (err) {
    console.warn("Could not purge persisted query cache:", err);
  }
}

export function createAppQueryClient(): QueryClient {
  const persister = createQueryPersister({
    storage: createFilteredStorage(),
    maxAge: PERSISTER_MAX_AGE_MS,
    buster: PERSISTER_BUSTER,
  });

  return new QueryClient({
    queryCache: new QueryCache(),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        retry: (failureCount, error) => {
          // Never retry client errors (4xx) — they won't succeed.
          const status = (error as { status?: number })?.status;
          if (typeof status === "number" && status >= 400 && status < 500) {
            return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        persister: persister.persisterFn,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
