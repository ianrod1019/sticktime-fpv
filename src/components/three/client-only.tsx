import { useSyncExternalStore, type ReactNode } from "react";

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * True only after hydration on the client. SSR-safe by design: the server
 * snapshot renders false, so WebGL canvases never appear in SSR HTML (no
 * hydration mismatch, no GL context on the server).
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);
}

/**
 * Renders children only in the browser after hydration. Optional fallback
 * keeps layout height stable while the 3D layer lazy-loads in.
 */
export function ClientOnly({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const isClient = useIsClient();
  return <>{isClient ? children : (fallback ?? null)}</>;
}
