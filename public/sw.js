/* Neural Swarm service worker.
 *
 * Goal: an installed phone app that opens instantly and still works with a bad
 * connection, without ever serving a stale build.
 *
 *  - navigations: network-first, falling back to the cached shell
 *  - static assets: stale-while-revalidate (hashed files never change)
 *  - anything cross-origin (model APIs, Supabase, analytics): untouched
 *
 * Bump CACHE when the shell changes; the old cache is dropped on activate.
 */
const CACHE = "neural-swarm-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./favicon-32.png", "./apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // Individually, not addAll: one missing file must not empty the shell.
        Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))),
      )
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Only the studio's own shell may be written to the shell cache. The
    // separate app under /app/ has its own service worker and its own HTML; a
    // first visit there can still be handled here, and caching that response as
    // "./index.html" would leave the studio's offline shell holding the app.
    const shellPath = new URL(self.registration.scope).pathname;
    const requested = new URL(request.url).pathname.replace(/index\.html$/, "");
    const isShell = requested === shellPath;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isShell) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() =>
          isShell ? caches.match("./index.html").then((cached) => cached || caches.match("./")) : Response.error(),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
