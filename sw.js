// sw.js (robuste Aktualisierung)
const VERSION = "satteldach-v1-" + new Date().toISOString().slice(0,10);
const CORE_CACHE = `core-${VERSION}`;
const STATIC_CACHE = `static-${VERSION}`;

const START_URL = "./index.html";
const CORE_ASSETS = ["./", START_URL, "./manifest.webmanifest"];
const STATIC_ASSETS = ["./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const core = await caches.open(CORE_CACHE);
    await core.addAll(CORE_ASSETS);
    const stat = await caches.open(STATIC_CACHE);
    await stat.addAll(STATIC_ASSETS);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (![CORE_CACHE, STATIC_CACHE].includes(k)) return caches.delete(k);
    }));
  })());
  self.clients.claim();
});

async function networkFirst(req, cacheName, timeoutMs = 2500) {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fresh = await fetch(req, { signal: controller.signal });
    clearTimeout(id);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    clearTimeout(id);
    const cached = await cache.match(req);
    if (cached) return cached;
    const start = await cache.match(START_URL);
    if (start) return start;
    throw e;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => undefined);
  return cached || fetchPromise || fetch(req);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isNavigate = request.mode === "navigate" || request.destination === "document" || url.pathname.endsWith("/index.html");
  if (sameOrigin && isNavigate) {
    event.respondWith(networkFirst(request, CORE_CACHE));
    return;
  }
  if (sameOrigin && (
    request.destination === "manifest" ||
    request.destination === "image" ||
    request.destination === "style" ||
    request.destination === "font" ||
    request.destination === "script"
  )) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
