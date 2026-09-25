import { useCallback, useSyncExternalStore } from "react";

const getServerSnapshot = () => false;

/**
 * Reactive CSS media query. Layout-critical branches (nav bars, panels) use
 * this instead of duplicating markup and hiding half of it with CSS.
 */
export default function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener?.("change", onChange);
      return () => mql.removeEventListener?.("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** One source of truth for the phone/tablet breakpoint. */
export const useIsMobile = () => useMediaQuery("(max-width: 900px)");
export const useIsNarrow = () => useMediaQuery("(max-width: 700px)");
