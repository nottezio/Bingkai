/* Bingkai — service worker.
 * Precaches the app shell so the PWA works offline after one online load.
 *
 * IMPORTANT: navigation is NETWORK-FIRST. When online, the latest index.html is
 * always served (so a new deploy shows up immediately); the cache is only used
 * as an offline fallback. Bump CACHE on every deploy to purge the old shell.
 *
 * The JSZip CDN URL is precached best-effort (opaque, cross-origin); if the
 * network blocks it, install still succeeds and the app falls back to per-file
 * downloads for carousel export.
 */
'use strict';

const CACHE = 'bingkai-v4';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/main.js', './js/carouselMode.js', './js/collageMode.js',
  './js/collageTemplates.js', './js/compositor.js', './js/config.js',
  './js/cropMode.js', './js/exportModal.js', './js/exporter.js',
  './js/geometryCore.js', './js/historyStore.js', './js/importer.js',
  './js/layoutPicker.js', './js/persistence.js', './js/postModel.js',
  './js/postPreview.js', './js/postView.js', './js/pwa.js',
  './js/renderer.js', './js/sessionStore.js', './js/state.js',
  './js/strings.js', './js/ui.js', './js/undo.js',
];
const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    try { await cache.add(new Request(JSZIP, { mode: 'no-cors' })); } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigation: NETWORK-FIRST so a new deploy is seen immediately when online.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put('./index.html', res.clone());
        return res;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Other GETs: cache-first, then network, caching same-origin successes.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque') && new URL(req.url).origin === location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
