/* Bingkai — service worker.
 * Precaches the app shell so the PWA works offline after one online load.
 * The JSZip CDN URL is precached best-effort (opaque, cross-origin); if the
 * network blocks it, install still succeeds and the app falls back to per-file
 * downloads for carousel export.
 */
'use strict';

const CACHE = 'bingkai-v1';
const SHELL = ['./', './index.html'];
const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Best-effort: don't fail install if the CDN is unreachable.
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigation requests: cache-first on the shell, fall back to network, then
  // to the cached index (SPA-style offline).
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('./index.html');
      if (cached) return cached;
      try { return await fetch(req); } catch (_) { return caches.match('./'); }
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
