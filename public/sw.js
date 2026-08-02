/* public/sw.js — service worker for capture & offline core (path 1).
 *
 * Goals:
 *   - Precache the app shell on install so the app boots to a viewfinder with
 *     the network off (acceptance criterion 3).
 *   - Cache-first for the shell and static assets.
 *   - Network-first with cache fallback for the grid.
 *   - Never touch ingest traffic: non-GET and cross-origin (Convex) requests
 *     pass straight through, so sync is never intercepted or double-handled.
 *
 * Next.js hashes its JS/CSS filenames per build, so those cannot be listed in
 * a static precache. Instead we precache the shell entry points and let
 * `_next/static/*` populate the cache runtime-first on the first online load;
 * every subsequent offline load is then served from cache.
 */

const CACHE = "capture-shell-v1";

// Everything here has a stable URL and exists at build time.
const SHELL_PRECACHE = ["/", "/manifest.webmanifest", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll is atomic — one 404 aborts install — so add individually and
      // tolerate a miss rather than blocking the whole worker on one asset.
      await Promise.all(
        SHELL_PRECACHE.map((url) =>
          cache.add(url).catch(() => {
            /* best-effort; runtime caching will backfill */
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Never intercept ingest or any mutating traffic.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Let cross-origin requests (Convex, JamBase, CDNs) go straight to network.
  if (url.origin !== self.location.origin) return;

  // Skip dev/HMR machinery so local development isn't served stale chunks.
  if (
    url.pathname.includes("/_next/webpack-hmr") ||
    url.pathname.includes("hot-update") ||
    url.pathname.includes("/_next/static/development")
  ) {
    return;
  }

  // Grid: network-first, cache fallback (kept fresh, survives offline).
  if (isGridRequest(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Navigations: serve the cached shell first so the app boots offline.
  if (req.mode === "navigate") {
    event.respondWith(shellFirst(req));
    return;
  }

  // Static same-origin assets (_next/static, manifest, icons): cache-first.
  event.respondWith(cacheFirst(req));
});

function isGridRequest(url) {
  // Heuristic until the grid transport is pinned down with paths 3/4.
  return url.pathname.includes("/grid");
}

async function shellFirst(req) {
  const cache = await caches.open(CACHE);
  const cachedShell = await cache.match("/");
  if (cachedShell) {
    // Revalidate in the background; ignore failure (offline is normal).
    revalidateShell(req, cache);
    return cachedShell;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put("/", res.clone());
    return res;
  } catch {
    return cachedShell || Response.error();
  }
}

function revalidateShell(req, cache) {
  fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put("/", res.clone());
    })
    .catch(() => {});
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    // Only cache complete, same-origin 200s (skip opaque/partial responses).
    if (res && res.status === 200 && res.type === "basic") {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || Response.error();
  }
}
