import { importer } from './importer.js';
import { renderer } from './renderer.js';
import { cloneCarousel, cloneCollage, cloneFrame, state } from './state.js';

export const sessionStore = (function () {
  const DB = "bingkai-session", VER = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res) => {
      let r;
      try { r = indexedDB.open(DB, VER); } catch (_) { return res(null); }
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("sources")) db.createObjectStore("sources", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });
    return dbp;
  }
  async function putSource(rec) {
    const db = await open(); if (!db) return;
    try { db.transaction("sources", "readwrite").objectStore("sources").put(rec); } catch (_) {}
  }
  async function delSource(id) {
    const db = await open(); if (!db) return;
    try { db.transaction("sources", "readwrite").objectStore("sources").delete(id); } catch (_) {}
  }
  async function allSources() {
    const db = await open(); if (!db) return [];
    return new Promise((res) => {
      try {
        const rq = db.transaction("sources", "readonly").objectStore("sources").getAll();
        rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res([]);
      } catch (_) { res([]); }
    });
  }
  async function getMeta() {
    const db = await open(); if (!db) return null;
    return new Promise((res) => {
      try {
        const rq = db.transaction("meta", "readonly").objectStore("meta").get("session");
        rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null);
      } catch (_) { res(null); }
    });
  }
  async function putMeta(m) {
    const db = await open(); if (!db) return;
    try { db.transaction("meta", "readwrite").objectStore("meta").put(m, "session"); } catch (_) {}
  }
  async function clearAll() {
    const db = await open(); if (!db) return;
    try {
      db.transaction("sources", "readwrite").objectStore("sources").clear();
      db.transaction("meta", "readwrite").objectStore("meta").clear();
    } catch (_) {}
  }

  function buildMeta() {
    const co = state.collage, c = state.carousel;
    const crops = {};
    const frames = {};
    const carousels = {};
    const collages = {};
    const kinds = {};
    state.sources.forEach((s) => {
      if (s.crop) crops[s.id] = s.crop;
      if (s.frame) frames[s.id] = s.frame;
      if (s.carousel) carousels[s.id] = s.carousel;
      if (s.collage) collages[s.id] = s.collage;
      if (s.kind) kinds[s.id] = s.kind;
    });
    return {
      order: state.sources.map((s) => s.id),
      activeId: state.activeId,
      mode: state.mode,
      crops, frames, carousels, collages, kinds,
      collage: { rows: co.rows, cols: co.cols, template: co.template, ratio: co.ratio, gutterPct: co.gutterPct, marginPct: co.marginPct, gutterColor: co.gutterColor, cells: co.cells, selected: co.selected },
      carousel: { n: c.n, tileRatio: c.tileRatio, fill: c.fill, adjust: c.adjust, pos: c.pos, zoom: c.zoom, cx: c.cx, cy: c.cy },
      exportSeq: state.exportSeq || 0,
    };
  }
  let mt = null;
  function scheduleMeta() {
    clearTimeout(mt);
    mt = setTimeout(() => { putMeta(buildMeta()); }, 350);
  }

  // Restore a previous session. Returns true if anything was restored.
  async function restore() {
    let recs = [];
    try { recs = await allSources(); } catch (_) { recs = []; }
    if (!recs.length) return false;
    const meta = (await getMeta()) || {};
    const order = meta.order && meta.order.length ? meta.order : recs.map((r) => r.id);
    const byId = {}; recs.forEach((r) => { byId[r.id] = r; });
    const crops = meta.crops || {};
    for (const id of order) {
      const rec = byId[id];
      if (!rec) continue;
      try { await importer.restoreSource(rec, crops[id] || null); } catch (e) { console.warn("restore source failed", id, e); }
    }
    if (!state.sources.length) return false;
    const frames = meta.frames || {}, carousels = meta.carousels || {}, kinds = meta.kinds || {}, collages = meta.collages || {};
    state.sources.forEach((s) => {
      if (frames[s.id]) s.frame = cloneFrame(frames[s.id]);
      if (carousels[s.id]) s.carousel = cloneCarousel(carousels[s.id]);
      if (collages[s.id]) s.collage = cloneCollage(collages[s.id]);
      if (kinds[s.id]) s.kind = kinds[s.id];
    });
    if (meta.collage) Object.assign(state.collage, meta.collage);
    if (meta.carousel) Object.assign(state.carousel, meta.carousel);
    if (typeof meta.exportSeq === "number") state.exportSeq = meta.exportSeq;
    state.activeId = (meta.activeId && state.sources.some((s) => s.id === meta.activeId)) ? meta.activeId : state.sources[0].id;
    state.mode = meta.mode || "frame";
    // bake any crops so every mode shows the cropped image immediately
    for (const s of state.sources) {
      if (s.crop && s.crop.rotate) { try { await importer.applyRotation(s, s.crop.rotate); } catch (_) {} }
      if (s.crop) { try { await renderer.bakeCrop(s); } catch (_) {} }
    }
    return true;
  }

  return { putSource, delSource, allSources, getMeta, putMeta, clearAll, scheduleMeta, restore };
})();
