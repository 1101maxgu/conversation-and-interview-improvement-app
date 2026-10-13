import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (notify: () => void) => {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", notify);
  return () => list.removeEventListener("change", notify);
};

/** True when the person asks for reduced motion. Follows the setting live, and is false while rendering on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
