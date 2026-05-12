/* Shell minimal : navigation offline + quelques assets. Pas d’interception des chunks Next.js. */
const SHELL = ["/offline", "/brand/qrder-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("qrder-shell-v1").then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== "qrder-shell-v1").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

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
  }
});
