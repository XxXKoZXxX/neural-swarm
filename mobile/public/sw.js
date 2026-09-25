/* Neural Swarm app shell service worker.
 *
 * Rules that matter:
 *  - Never touch non-GET or cross-origin requests. API traffic carries keys in
 *    headers and must never be cached.
 *  - Network-first everywhere else: the app is always fresh when online, and
 *    still opens from the launcher when offline.
 *  - Paths are resolved against the registration scope so the same build works
 *    at a domain root (its own Vercel project) and under a subpath.
 */

const CACHE = 'neural-swarm-shell-v1'
const SHELL = new URL('index.html', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([SHELL, new URL('manifest.webmanifest', self.registration.scope).href]))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // provider APIs stay untouched
  if (url.pathname.includes('/@')) return // vite internals / HMR

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req)
        // Only cache clean, complete responses.
        if (fresh && fresh.ok && fresh.type === 'basic') {
          const copy = fresh.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined)
        }
        return fresh
      } catch (err) {
        const hit = await caches.match(req)
        if (hit) return hit
        if (req.mode === 'navigate') {
          const shell = await caches.match(SHELL)
          if (shell) return shell
        }
        throw err
      }
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})
