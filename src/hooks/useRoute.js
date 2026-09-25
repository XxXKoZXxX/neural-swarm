import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_TAB, HOME_HASH, homeHref, parseRoute, routeHref } from "../lib/router.js";

const subscribe = (onChange) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

const getSnapshot = () => window.location.hash;
const getServerSnapshot = () => "";

/**
 * Reads the current route out of `location.hash` and writes it back on
 * navigation. Uses useSyncExternalStore so there is no setState-in-effect and
 * back/forward stay in sync automatically.
 */
export default function useRoute() {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const route = useMemo(() => parseRoute(hash), [hash]);

  const go = useCallback((nextHash, { replace = false } = {}) => {
    if (typeof window === "undefined") return;
    if (window.location.hash === nextHash) return;
    if (replace) {
      // replaceState does not fire hashchange, so announce it ourselves.
      window.history.replaceState(null, "", nextHash);
      window.dispatchEvent(new Event("hashchange"));
    } else {
      window.location.hash = nextHash;
    }
  }, []);

  const navigate = useCallback(
    (tab = DEFAULT_TAB, params = {}, options) => go(routeHref(tab, params), options),
    [go],
  );
  const goHome = useCallback(() => go(homeHref()), [go]);
  const goBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) window.history.back();
    else go(HOME_HASH, { replace: true });
  }, [go]);

  return { ...route, navigate, goHome, goBack, hash: hash || HOME_HASH };
}
