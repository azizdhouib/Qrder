/* Qrder PWA — cache statique SWR, navigation offline, mises à jour via SKIP_WAITING */
/* Bump CACHE_REV après changement majeur du SW pour purger les anciens caches. */
const CACHE_REV = "v9";
const SHELL_CACHE = `qrder-shell-${CACHE_REV}`;
const STATIC_CACHE = `qrder-static-${CACHE_REV}`;

const SHELL_URLS = ["/offline", "/manifest.webmanifest", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL_URLS))
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  const legit = new Set([SHELL_CACHE, STATIC_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("qrder-") && !legit.has(k)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

/** Logo + icônes : réseau d’abord pour voir tout de suite un logo remplacé (évite SWR qui garde l’ancien). */
function isLogoOrAppIcon(url) {
  return url.pathname === "/logo.png" || url.pathname.startsWith("/icons/");
}

function isStaticAssetSwr(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pwa/") ||
    (url.pathname.startsWith("/brand/") && /\.(png|jpe?g|webp|svg|ico|gif)$/i.test(url.pathname))
  );
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response("Hors ligne", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && response.status === 200) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkPromise;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!sameOrigin(url)) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok || res.type === "opaqueredirect") return res;
          throw new Error("nav-fail");
        })
        .catch(() =>
          caches.match("/offline").then((c) => c || new Response("Hors ligne", { status: 503, statusText: "Offline" }))
        )
    );
    return;
  }

  if (isLogoOrAppIcon(url)) {
    event.respondWith(networkFirst(req, STATIC_CACHE));
    return;
  }
  if (isStaticAssetSwr(url)) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
  }
});

self.addEventListener("push", () => {});

self.addEventListener("notificationclick", (event) => {
  try {
    event.notification.close();
  } catch {
    /* ignore */
  }
});
