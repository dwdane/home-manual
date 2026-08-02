// sw.js
/**
 * Offline cache and update control for Home Manual.
 *
 * Bump CACHE_VERSION on every release together with `version` in config.js
 * and `version` in version.json - check-ui.py fails the build if they drift.
 *
 * Update model: a new worker precaches in the background and then waits. It
 * takes over only when the page posts SKIP_WAITING (the user tapping the
 * update banner), so nothing swaps out from under someone mid-task.
 */

const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `home-manual-${CACHE_VERSION}`;

/** Everything the app needs offline. Add every new module here. */
const PRECACHE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './config.js',
  './store.js',
  './schedule.js',
  './library.js',
  './photos.js',
  './updates.js',
  './manifest.webmanifest',
  './version.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // No skipWaiting() here: precache, then wait for the page to hand over.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('home-manual-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // version.json is the update signal, so it must never be answered from the
  // cache - a cache-first response would make the app permanently believe it
  // is up to date. Network first, cached copy only as an offline fallback.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./version.json', copy));
          }
          return response;
        })
        .catch(() => caches.match('./version.json', { ignoreSearch: true })),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
  );
});
