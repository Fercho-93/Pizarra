const CACHE = "pizarra-v20";
const ASSETS = [
  "./", "./index.html", "./styles.css?v=20", "./core.js?v=20", "./app.js?v=20",
  "./data/players.js?v=20", "./data/enrichment.js?v=20", "./data/verified.js?v=20", "./data/official-corrections.js?v=20", "./manifest.webmanifest", "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => event.request.mode === "navigate" ? caches.match("./index.html") : Response.error())));
});

