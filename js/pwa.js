export const pwa = (function () {
  const ICON = "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>" +
    "<rect width='512' height='512' rx='96' fill='#1C1C1C'/>" +
    "<rect x='120' y='120' width='272' height='272' rx='28' fill='none' stroke='#4A9EFF' stroke-width='30'/>" +
    "<rect x='196' y='196' width='120' height='120' rx='14' fill='#C8A96E'/></svg>");

  function installManifest() {
    const manifest = {
      name: "Bingkai", short_name: "Bingkai",
      start_url: ".", scope: ".", display: "standalone",
      background_color: "#1C1C1C", theme_color: "#2A2A2A", lang: "id",
      icons: [
        { src: ICON, sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
        { src: ICON, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" },
      ],
    };
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "data:application/manifest+json," + encodeURIComponent(JSON.stringify(manifest));
    document.head.appendChild(link);
    const al = document.createElement("link");
    al.rel = "apple-touch-icon"; al.href = ICON; document.head.appendChild(al);
    const fav = document.createElement("link");
    fav.rel = "icon"; fav.type = "image/svg+xml"; fav.href = ICON; document.head.appendChild(fav);
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return; // SW needs http(s)/localhost
    // Reload once when an UPDATED worker takes control. Guarded so it never fires
    // on first install (no prior controller) or loops.
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      location.reload();
    });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
      // updateViaCache:'none' is the key fix: it tells the browser to bypass its
      // HTTP cache when checking sw.js, so a new deploy is detected immediately
      // instead of up to ~10 min later (GitHub Pages' default max-age on sw.js).
      // Without it, the browser kept re-reading a cached sw.js, never saw the
      // byte change, never fired updatefound, and kept the old worker (and old
      // cached JS) in control — which is why deploys "randomly" didn't appear.
      if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage("SKIP_WAITING");
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            nw.postMessage("SKIP_WAITING"); // activate the update immediately
          }
        });
      });
      // Actively check for a new SW on load and whenever the app regains focus.
      // An installed PWA otherwise checks rarely (sometimes only on full restart),
      // so this makes updates land on the next foreground without a manual reload.
      const poll = () => { reg.update().catch(() => {}); };
      poll();
      document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
    }).catch((e) => console.warn("SW register failed", e));
  }

  // Self-service SW/cache eviction, exposed in Settings as "Force Update Now".
  //
  // ROOT CAUSE this solves: Samsung Internet (and several other mobile browsers)
  // do not expose a chrome://serviceworker-internals equivalent. When a service
  // worker gets stuck on a stale cache generation — which can happen even with
  // updateViaCache:'none' if the CURRENTLY REGISTERED worker predates that fix —
  // there is no browser UI path to unregister it. "Clear site data" targets
  // storage APIs (cookies/IndexedDB) but does not reliably force-unregister an
  // active SW registration on every platform.
  //
  // FUNDAMENTAL FIX: the app must be able to evict its own stuck worker rather
  // than depend on platform tooling that may not exist. This does exactly what
  // DevTools → Application → Service Workers → Unregister does, from inside the
  // app, so it works identically regardless of what the browser exposes.
  async function forceUpdate() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn("forceUpdate cleanup failed", e);
    } finally {
      // Bust any remaining HTTP cache on the navigation itself.
      const url = new URL(location.href);
      url.searchParams.set("_fu", Date.now().toString(36));
      location.replace(url.toString());
    }
  }

  let deferred = null;
  function wireInstall() {
    const btn = document.getElementById("btnInstall");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault(); deferred = e; btn.style.display = "inline-flex";
    });
    btn.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt(); await deferred.userChoice; deferred = null; btn.style.display = "none";
    });
    window.addEventListener("appinstalled", () => { btn.style.display = "none"; });
  }

  return { installManifest, registerSW, wireInstall, forceUpdate };
})();
