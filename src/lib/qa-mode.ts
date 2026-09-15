/**
 * QA mode — the single owner of the fake-data switch.
 *
 * Toggled from the Dev & QA console (admins/devs/testers). While on, the
 * data-layer hooks intercept reads and serve fixtures from qa-fixtures,
 * and writes are refused — so testers can walk every gated surface
 * (vault, SMS, portals, scheduling, district) with realistic fake people
 * and fake orgs without touching real data. The server never changes:
 * RLS stays authoritative; QA mode only widens what the UI renders.
 *
 * The flag persists in localStorage under a qa-prefixed key so a reload
 * mid-review keeps the session usable; sign-out clears it (see
 * purgePersistedCache callers) so it never leaks into the next account.
 */

const STORAGE_KEY = "sticktime.qa-mode";

const listeners = new Set<() => void>();

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let current = typeof window !== "undefined" ? readStored() : false;

function emit() {
  listeners.forEach((l) => l());
}

export function isQaMode(): boolean {
  return current;
}

export function setQaMode(on: boolean): void {
  if (on === current) return;
  current = on;
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private-mode storage: in-memory flag still works for the session.
  }
  emit();
}

/** Clear without notifying listeners (used on sign-out teardown). */
export function clearQaMode(): void {
  current = false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** React-friendly subscription — pair with useSyncExternalStore. */
export function subscribeQaMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * True when the caller's role is allowed to toggle QA mode at all —
 * admins and devs get it by definition; testers are the audience it
 * exists for. Matches the /dev route's access check.
 */
export function canUseQaMode(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "dev" || r === "tester";
}
