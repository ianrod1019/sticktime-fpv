/*
  Type declarations for Vite env variables.
  Adding explicit keys avoids TS‑4111 warnings when accessed with dot notation.
*/
interface ImportMetaEnv {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_SERVICE_ROLE_KEY: string;
  // Allow any other VITE_ prefixed vars
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
