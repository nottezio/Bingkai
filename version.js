/* Bingkai — SINGLE SOURCE OF TRUTH for version + cache name.
 * Consumed two ways so the version is never hardcoded twice:
 *   - App: <script src="version.js"> in index.html sets window.APP_VERSION,
 *          read by config.js (CONFIG.BUILD) and shown in the status marquee.
 *   - SW:  importScripts('./version.js') in sw.js sets self.CACHE_NAME.
 * No `export` keyword on purpose — a CLASSIC service worker's importScripts()
 * cannot parse ES module syntax. Consumers read the globals below.
 * Format: YYYY-MM-DD.N  (N = same-day build counter). Bump on every ship.
 */
(function (g) {
  g.APP_VERSION = "2026-07-10.3";
  g.CACHE_NAME = "bingkai-" + g.APP_VERSION;
})(typeof self !== "undefined" ? self : this);
