// updates.js
/**
 * Update detection and installation.
 *
 * Three independent mechanisms, because any one alone can silently fail and
 * leave a home-screen app frozen on an old build:
 *
 *   1. version.json - deployed with the app, fetched `no-store` on every
 *      launch and foreground return. The authority on what is *published*.
 *      sw.js serves it network-first for the same reason.
 *   2. registration.update() - re-fetches sw.js. The registration uses
 *      `updateViaCache: 'none'` so sw.js is never answered from the HTTP
 *      cache, the most common reason a PWA never sees a deployment.
 *   3. Force reinstall - drops every cache and the worker, reloads from the
 *      network. IndexedDB is untouched, so user data survives.
 */

import { APP } from './config.js';

const CHECK_THROTTLE_MS = 60 * 1000;

let registration = null;
let waitingWorker = null;
let publishedVersion = null;
let lastCheckAt = 0;

let ui = {
  /** @type {(text: string, tone?: 'good'|'warn') => void} */
  onStatus: () => {},
  /** @type {(available: boolean, version?: string) => void} */
  onUpdateReady: () => {},
};

/** Wire the module to the shell's UI callbacks. */
export function configure(handlers) {
  ui = { ...ui, ...handlers };
}

/** Fetch the published version manifest, bypassing every cache layer. */
async function fetchPublished() {
  const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`version.json ${res.status}`);
  return res.json();
}

/**
 * Look for a new release.
 * @param {{manual?: boolean}} [opts]
 * @returns {Promise<'current'|'ready'|'stuck'|'offline'>}
 */
export async function checkForUpdate({ manual = false } = {}) {
  const now = Date.now();
  if (!manual && now - lastCheckAt < CHECK_THROTTLE_MS) return 'current';
  lastCheckAt = now;

  if (manual) ui.onStatus('Checking\u2026');

  let published;
  try {
    published = await fetchPublished();
    publishedVersion = published.version;
  } catch {
    if (manual) ui.onStatus('Could not reach the server. Check your connection.', 'warn');
    return 'offline';
  }

  const isNewer = Boolean(published.version) && published.version !== APP.version;

  if (registration) {
    try { await registration.update(); } catch { /* transient network failure */ }
  }

  if (registration && registration.waiting) {
    waitingWorker = registration.waiting;
    ui.onUpdateReady(true, published.version);
    ui.onStatus(`Version ${published.version} is downloaded and ready.`, 'good');
    return 'ready';
  }

  if (isNewer) {
    ui.onStatus(
      `Version ${published.version} is available (you have ${APP.version}). `
      + 'It may still be downloading - reopen the app shortly. If this keeps '
      + 'showing, use Force reinstall.',
      'warn',
    );
    return 'stuck';
  }

  if (manual) ui.onStatus(`You're on the latest version (${APP.version}).`, 'good');
  return 'current';
}

/** Activate a downloaded update. Falls back to a reload if none is waiting. */
export function applyUpdate() {
  if (waitingWorker) {
    waitingWorker.postMessage('SKIP_WAITING');
  } else {
    location.reload();
  }
}

/** Re-download the app from the network; caches dropped, data untouched. */
export async function forceReinstall() {
  const ok = confirm(
    'Reinstall the app from scratch?\n\n'
    + 'This re-downloads the app files. Your houses, tasks, photos and history '
    + 'are NOT affected.',
  );
  if (!ok) return;

  ui.onStatus('Reinstalling\u2026');
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch { /* reload regardless */ }

  location.replace(`${location.pathname}?fresh=${Date.now()}`);
}

/** Register the service worker and start watching for updates. */
export async function start() {
  if ('serviceWorker' in navigator) {
    try {
      registration = await navigator.serviceWorker.register('./sw.js', {
        updateViaCache: 'none',
      });

      if (registration.waiting) {
        waitingWorker = registration.waiting;
        ui.onUpdateReady(true, publishedVersion);
      }

      registration.addEventListener('updatefound', () => {
        const incoming = registration.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
          if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = incoming;
            ui.onUpdateReady(true, publishedVersion);
          }
        });
      });

      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    } catch { /* offline first load, or unsupported */ }
  }

  checkForUpdate();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('focus', () => checkForUpdate());
}
