/* Mandela SW — Phase 7 (guardian PWA, DEV-PHASES).
 * Three tiers, each as narrow as it can be:
 *   1. Immutable assets (content-hashed /_next/static, icons, manifest):
 *      cache-first — the classic shell.
 *   2. App navigations + GET /web/ reads: network-first, every success updates
 *      a per-URL "last-read" copy; offline serves the last-read copy (the
 *      guardian sees their fees/homework from the last time they had signal).
 *      Navigations that have no copy fall back to /offline.
 *   3. Writes and auth/session pages: NEVER cached — money and sessions hit
 *      real errors, not stale 200s (OFFLINE-CONSTRAINTS law; SyncBanner owns
 *      the write queue).
 */
const CACHE = "mandela-static-v4";
const READS = "mandela-reads-v4";
const OFFLINE_URL = "/offline";
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Precache the offline fallback so a cold offline open still renders.
      try {
        await cache.addAll([OFFLINE_URL, "/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/manifest.webmanifest"]);
      } catch {
        /* a missing icon must never block install */
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) {
        if (k !== CACHE && k !== READS) await caches.delete(k);
      }
      await self.clients.claim();
    })(),
  );
});

/** Network with a hard timeout — offline detection must not hang the screen. */
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then(
      (res) => { clearTimeout(t); resolve(res); },
      (err) => { clearTimeout(t); reject(err); },
    );
  });
}

/** Session/auth surfaces: always network, never cached, never stale. */
function isSessionSurface(url) {
  return url.pathname === "/login" || url.pathname === "/register" || url.pathname.startsWith("/api/auth");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes: always network (queue lives in SyncBanner)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache on a dev server — dev chunk URLs are unhashed, so a cache-first
  // SW would serve stale screens forever. Prod assets are content-hashed.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;
  if (isSessionSurface(url)) return; // auth: real errors, never stale

  // 1) Immutable shell — cache-first.
  const immutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/icon.svg" ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/sw.js";
  if (immutable) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached ?? network;
      })(),
    );
    return;
  }

  // 2) GET /web/ reads — network-first; success updates the last-read copy.
  if (url.pathname.startsWith("/web/")) {
    event.respondWith(
      (async () => {
        const reads = await caches.open(READS);
        try {
          const res = await fetch(req);
          if (res.ok) reads.put(req, res.clone());
          return res;
        } catch {
          const cached = await reads.match(req);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
      })(),
    );
    return;
  }

  // 3) App navigations — network-first with timeout; offline serves the
  //    last-read copy of that screen, else the /offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const reads = await caches.open(READS);
        try {
          const res = await fetchWithTimeout(req, NAV_TIMEOUT_MS);
          if (res.ok && !isSessionSurface(new URL(res.url || req.url))) {
            reads.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = await reads.match(req);
          if (cached) return cached;
          const offline = await caches.open(CACHE);
          const fallback = await offline.match(OFFLINE_URL);
          return fallback ?? new Response("Offline", { status: 503 });
        }
      })(),
    );
  }
});
