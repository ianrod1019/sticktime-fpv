/*
  Type declarations for Vite env variables.
  Adding explicit keys avoids TS‑4111 warnings when accessed with dot notation.
*/
interface ImportMetaEnv {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
  // Allow any other VITE_ prefixed vars
  [key: string]: string | undefined;
}
// SECURITY: never add VITE_* declarations for secret keys (service role, etc.) —
// every VITE_* variable is inlined into the client bundle at build time.

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
