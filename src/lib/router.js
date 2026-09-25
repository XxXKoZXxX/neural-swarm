/**
 * Tiny hash router.
 *
 * Every view is addressable: `#/files?path=src/app.js`, `#/history?run=r_12`.
 * That buys the things a single-page app usually lacks — the browser back
 * button, shareable links, and a deep link straight into a file or a run.
 *
 * No dependencies, pure functions, unit-testable.
 */

/** Canonical view order — also the order used by the 1–9 shortcuts. */
export const TAB_ORDER = ["swarm", "preview", "files", "terminal", "canvas", "security", "research", "vault", "market", "history", "insights", "brain"];

export const DEFAULT_TAB = "swarm";
export const HOME_HASH = "#/";

export const isTab = (value) => TAB_ORDER.includes(value);

/**
 * Parse a location hash into `{ home, tab, params }`.
 * Anything unrecognised falls back to the default tab rather than throwing, so
 * a stale bookmark from an older build still lands somewhere sensible.
 */
export function parseRoute(hash = "") {
  const raw = String(hash).replace(/^#\/?/, "");
  if (!raw) return { home: true, tab: DEFAULT_TAB, params: {} };

  const [pathPart, queryPart = ""] = raw.split("?");
  const params = {};
  for (const pair of queryPart.split("&")) {
    if (!pair) continue;
    const [key, value = ""] = pair.split("=");
    if (!key) continue;
    try {
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
      params[key] = value;
    }
  }

  const segment = pathPart.split("/").filter(Boolean).pop() || "";
  const tab = isTab(segment) ? segment : DEFAULT_TAB;
  return { home: false, tab, params };
}

const encodePair = ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;

/** Serialise a destination back into a hash: `routeHref("files", { path: "a/b.ts" })`. */
export function routeHref(tab = DEFAULT_TAB, params = {}) {
  const safeTab = isTab(tab) ? tab : DEFAULT_TAB;
  const pairs = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
  const query = pairs.map(encodePair).join("&");
  return `#/${safeTab}${query ? `?${query}` : ""}`;
}

/** Hash for the marketing landing page. */
export const homeHref = () => HOME_HASH;

/**
 * Human-readable trail for the context bar, e.g.
 * `{ label: "Files", detail: "src/app.js" }`.
 */
export function routeTitle(route, labels = {}) {
  const label = labels[route.tab] || route.tab;
  const detail = route.params.path || route.params.item || route.params.run || route.params.template || "";
  return { label, detail: String(detail).slice(0, 64) };
}
