/* Bingkai — service worker.
 * The app shell is precached so the PWA still works offline after one online load.
 *
 * STRATEGY: NETWORK-FIRST for every same-origin request (navigation AND the
 * js/css modules). When online, the newest files are always served, so a new
 * deploy shows up immediately — you never have to remember to bump CACHE to
 * avoid shipping stale JavaScript. The cache is a pure offline fallback.
 *
 * The old build served js/css CACHE-FIRST, which meant a cached module was
 * returned forever until CACHE changed by hand; forgetting to bump it shipped a
 * new index.html on top of old modules (new buttons, old logic). This version
 * removes that footgun.
 *
 * The JSZip CDN URL is versioned/immutable, so it stays cache-first. The
 * Archivo Black webfont (Google Fonts, added for the 90s UI) is also
 * cross-origin/cache-first; if blocked, the CSS font-stack falls back to
 * Impact/Arial Black/system sans, so the app still renders.
 */
'use strict';

const CACHE = 'bingkai-v11';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/main.js', './js/carouselMode.js', './js/collageMode.js',
  './js/collageTemplates.js', './js/compositor.js', './js/config.js',
  './js/cropMode.js', './js/cropDebug.js', './js/exportModal.js', './js/exporter.js',
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
    // cache:'reload' bypasses the browser HTTP cache so the precache is truly fresh.
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
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

  const sameOrigin = new URL(req.url).origin === location.origin;

  // Same-origin (navigation + js/css/icons): NETWORK-FIRST.
  // Always try the network so a new deploy is picked up right away; the cache is
  // only used when offline. This is what makes deploys reliably "take".
  if (sameOrigin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res && res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
          if (req.mode === 'navigate') cache.put('./index.html', res.clone());
        }
        return res;
      } catch (_) {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
        }
        return Response.error();
      }
    })());
    return;
  }

  // Cross-origin immutable assets (JSZip CDN, Google Fonts): cache-first is safe.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
