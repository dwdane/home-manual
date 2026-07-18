// sw.js
// Offline-first service worker with a controlled update flow.
//
// Bump CACHE_VERSION on every release. Keep it in step with APP_VERSION in
// app.js so the version a user reads on screen identifies the running code.
//
// Update model: a new worker installs and precaches in the background, then
// WAITS rather than taking over immediately. The page detects the waiting
// worker and shows an "update ready" banner. Only when the user taps it does
// the page post SKIP_WAITING, the new worker activates, and the page reloads
// once onto the new version.

const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `home-manual-${CACHE_VERSION}`;

// Paths are relative so the app works under a project subpath such as
// /home-manual/ on GitHub Pages without any absolute-URL rewriting.
const PRECACHE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './store.js',
  './schedule.js',
  './library.js',
  './manifest.webmanifest',
  './version.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  // No skipWaiting() here: the new worker precaches, then waits for the page
  // to tell it to take over.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('home-manual-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// The page posts SKIP_WAITING when the user accepts the update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only handle same-origin requests; fonts and external links go straight
  // to the network.
  if (url.origin !== self.location.origin) return;

  // version.json is the update signal, so it must never be answered from the
  // cache - a cache-first response here would make the app permanently
  // believe it is up to date. Network first, cached copy only as an offline
  // fallback.
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
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          // Cache successful same-origin fetches opportunistically so a file
          // missed by the precache still works offline next time.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
