import { useSyncExternalStore } from "react";
import { isQaMode, subscribeQaMode } from "@/lib/qa-mode";

/** Reactive QA-mode flag for components and data hooks. */
export function useQaMode(): boolean {
  return useSyncExternalStore(subscribeQaMode, isQaMode, () => false);
}
