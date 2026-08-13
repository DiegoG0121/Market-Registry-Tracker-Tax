// Service worker for Register No. 1 — makes the app open instantly and work
// without internet by caching the app shell (this single-file app, plus its
// external font/Firebase-SDK dependencies).
//
// Strategy:
//  - The app page itself: "network-first" — always try to fetch the latest
//    deployed version when online (so updates show up immediately, same as
//    before), and only fall back to the cached copy when there's no
//    connection at all. This means opening the app offline still works, and
//    opening it online never shows a stale version.
//  - External static assets (Google Fonts CSS, Firebase SDK scripts):
//    "cache-first" — these are pinned to a specific version in their URL
//    and essentially never change, so once cached they're reused instantly
//    without a network round-trip, but still refreshed in the background.
//
// Bump CACHE_VERSION any time the caching strategy itself changes, so old
// caches get cleaned up. It does NOT need to change for normal app updates —
// the network-first strategy above already handles those.
const CACHE_VERSION = 'register-app-v1';
 
const APP_SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
];
 
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Best-effort — if any single URL fails to cache (e.g. offline during
      // install, or a CDN hiccup), don't let that block the rest.
      return Promise.all(
        APP_SHELL_URLS.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});
 
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});
 
function isExternalStaticAsset(url) {
  return url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com'
    || url.hostname === 'www.gstatic.com';
}
 
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept writes (Firebase, API lookups, etc.)
 
  const url = new URL(req.url);
 
  // The app document itself, and same-origin app files — network-first.
  if (req.mode === 'navigate' || url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }
 
  // Pinned external assets (fonts, Firebase SDK) — cache-first.
  if (isExternalStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }
 
  // Everything else (Firebase database calls, barcode-lookup APIs, etc.) —
  // always go straight to the network, never cached. This is data, not app
  // shell, and caching it here would risk showing stale store data.
});
 