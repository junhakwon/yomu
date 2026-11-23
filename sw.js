// Offline support. Online, app files and feeds come from the network (so updates show up right away) and a copy is
// kept for offline use. The stories and dictionary never change, so they are kept after the first open and not
// downloaded again. Bump VERSION when any app file changes so phones pick it up.
const VERSION = "yomu-4";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "library.json", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const KEEP = "yomu-data";                                   // stories + dictionary, kept across versions
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(f =>
    fetch(f, { cache: "reload" }).then(r => r.ok && c.put(f, r)).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== KEEP).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (/\/(text-\d+|dict)\.json$/.test(url.pathname)) {
    e.respondWith(caches.open(KEEP).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
});
