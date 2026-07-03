import { carouselMode } from './carouselMode.js';
import { collageMode } from './collageMode.js';
import { compositor } from './compositor.js';
import { CONFIG } from './config.js';
import { cropMode } from './cropMode.js';
import { historyStore } from './historyStore.js';
import { persistence } from './persistence.js';
import { postModel } from './postModel.js';
import { renderer } from './renderer.js';
import { sessionStore } from './sessionStore.js';
import { state } from './state.js';
import { STRINGS } from './strings.js';
import { ui } from './ui.js';

export const exporter = (function () {

  // Record a successful export to history (best-effort; never breaks export).
  async function record(files, meta) {
    if (!meta || !files || !files.length) return;
    try {
      const rec = {
        id: "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        ts: Date.now(),
        mode: meta.mode || state.mode,
        label: meta.label || "",
        count: files.length,
        files: files.map((f) => ({ name: f.name, blob: f })),
      };
      await historyStore.add(rec);
      if (ui.onHistoryChanged) ui.onHistoryChanged();
    } catch (e) { /* swallow — history is non-critical */ }
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function exportPrefix() {
    const en = state.exportName || {};
    const clean = String(en.prefix || "bingkai").trim().replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "");
    return clean || "bingkai";
  }
  // Filename for a single export. 'date' → timestamp; 'seq' → session counter.
  function nameFor(label, ext) {
    const en = state.exportName || {};
    let token;
    if (en.mode === "seq") { state.exportSeq = (state.exportSeq || 0) + 1; token = String(state.exportSeq).padStart(3, "0"); persistName(); }
    else token = stamp();
    return exportPrefix() + "_" + String(label).replace(":", "x") + "_" + token + "." + ext;
  }
  function persistName() { try { persistence.scheduleSave(); } catch (_) {} try { sessionStore.scheduleMeta(); } catch (_) {} }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob null"))), type, quality);
    });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  let _forceDownload = false; // when true, skip the share sheet and save to device

  async function deliver(blob, filename, meta) {
    const file = new File([blob], filename, { type: blob.type });
    // Prefer the native share sheet on Android (lets user pick IG directly)
    // unless the user explicitly chose "save to device".
    if (!_forceDownload && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); ui.toast(STRINGS.shared); await record([file], meta); return true; }
      catch (e) { if (e && e.name === "AbortError") return false; /* fall through to download */ }
    }
    triggerDownload(blob, filename);
    ui.toast(STRINGS.downloaded);
    await record([file], meta);
    return true;
  }

  // JSZip (the one CDN dependency) is loaded lazily on first carousel export so
  // it never blocks startup and never errors when offline. The P6 service worker
  // will precache this exact URL so it works offline after one online use.
  let _zipPromise = null;
  function ensureJSZip() {
    if (typeof JSZip !== "undefined") return Promise.resolve(true);
    if (_zipPromise) return _zipPromise;
    _zipPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
    return _zipPromise;
  }

  // Multi-file delivery. Sharing uses the OS share sheet (handles many files);
  // for device saves the caller's pack choice decides ZIP vs separate files.
  async function deliverMany(files, meta, opts) {
    const pack = (opts && opts.pack) || "auto";
    if (!_forceDownload && navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files }); ui.toast(STRINGS.sharedN); await record(files, meta); return true; }
      catch (e) { if (e && e.name === "AbortError") return false; }
    }
    // Explicit "separate" → download each file individually.
    if (pack === "separate") {
      for (const f of files) { triggerDownload(f, f.name); await new Promise((r) => setTimeout(r, 300)); }
      ui.toast(files.length + " " + STRINGS.downloadedN);
      await record(files, meta);
      return true;
    }
    // "zip" or "auto" → single ZIP (per-file only if JSZip can't load).
    await ensureJSZip();
    if (typeof JSZip !== "undefined") {
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.name, f));
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, exportPrefix() + "_" + files.length + "tile.zip");
      ui.toast(STRINGS.zipped);
      await record(files, meta);
      return true;
    }
    for (const f of files) { triggerDownload(f, f.name); await new Promise((r) => setTimeout(r, 300)); }
    ui.toast(files.length + " " + STRINGS.downloadedN);
    await record(files, meta);
    return true;
  }

  // Render the active source at full export resolution and deliver it.
  async function run() {
    const src = state.sources.find((s) => s.id === state.activeId);
    if (!src) return;
    await renderer.ensureCropAll(); // WYSIWYG: never composite from a stale crop cache
    const opt = state.exportOpt;
    const isCrop = state.mode === "crop";
    const isCollage = state.mode === "collage";

    // Resolve target dims + a draw routine per mode.
    let Cw, Ch, ratioLabel, draw;
    if (isCollage) {
      const r = collageMode.ratioNums();
      ({ Cw, Ch } = compositor.exportDims(r.w, r.h, opt.ig));
      ratioLabel = "kolase";
      draw = (ctx) => collageMode.drawComposite(ctx, Cw, Ch);
    } else if (isCrop) {
      const eb = cropMode.exportBox();                 // box in full-res source px
      const r = eb.ratio;                              // crop ratio numbers
      ({ Cw, Ch } = compositor.exportDims(r.w, r.h, opt.ig));
      ratioLabel = (src.crop && src.crop.ratio && src.crop.ratio !== "original") ? src.crop.ratio : "potong";
      draw = (ctx) => ctx.drawImage(src.bitmap, eb.box.x, eb.box.y, eb.box.w, eb.box.h, 0, 0, Cw, Ch);
    } else {
      const f = state.frame;
      const eff = renderer.effective(src);
      const r = compositor.frameRatio(f, eff.w, eff.h);
      ({ Cw, Ch } = compositor.exportDims(r.w, r.h, opt.ig));
      ratioLabel = f.ratio;
      draw = (ctx) => compositor.composeFrame(ctx, eff.bitmap, eff.w, eff.h, Cw, Ch, f);
    }

    ui.setBusy(true);
    let canvas = null;
    try {
      canvas = document.createElement("canvas");
      canvas.width = Cw; canvas.height = Ch;
      const ctx = canvas.getContext("2d", { alpha: opt.format === "png" });
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      draw(ctx); // same geometry as the live preview

      const type = opt.format === "png" ? "image/png" : "image/jpeg";
      const quality = opt.format === "png" ? undefined : opt.quality;
      const blob = await canvasToBlob(canvas, type, quality);
      const ext = opt.format === "png" ? "png" : "jpg";
      await deliver(blob, nameFor(ratioLabel, ext), { mode: state.mode, label: ratioLabel });
    } catch (e) {
      console.error("export failed", e);
      ui.toast(STRINGS.exportFail);
    } finally {
      // Release the export canvas immediately (memory discipline).
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      ui.setBusy(false);
    }
  }

  // Build one framed File per photo (used by runBatch; exposed for testing).
  async function batchFiles() {
    await renderer.ensureCropAll(); // WYSIWYG: fresh crops for every framed photo
    const opt = state.exportOpt;
    const type = opt.format === "png" ? "image/png" : "image/jpeg";
    const quality = opt.format === "png" ? undefined : opt.quality;
    const ext = opt.format === "png" ? "png" : "jpg";
    const files = [];
    let i = 0;
    for (const src of state.sources) {
      i++;
      const f = src.frame || state.frame; // per-slide frame settings
      const eff = renderer.effective(src);
      const r = compositor.frameRatio(f, eff.w, eff.h);
      const { Cw, Ch } = compositor.exportDims(r.w, r.h, opt.ig);
      const cv = document.createElement("canvas");
      cv.width = Cw; cv.height = Ch;
      const ctx = cv.getContext("2d", { alpha: opt.format === "png" });
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      compositor.composeFrame(ctx, eff.bitmap, eff.w, eff.h, Cw, Ch, f);
      const blob = await canvasToBlob(cv, type, quality);
      const num = String(i).padStart(2, "0");
      files.push(new File([blob], exportPrefix() + "_" + f.ratio.replace(":", "x") + "_" + num + "." + ext, { type: blob.type }));
      cv.width = 0; cv.height = 0; // release each before the next
    }
    return files;
  }

  // Frame mode: export EVERY photo with the current frame settings, delivered
  // together (share sheet → ZIP → per-file). Falls back to single export when
  // there's only one photo.
  async function runBatch() {
    if (state.sources.length < 2) return run();
    ui.setBusy(true);
    try {
      await deliverMany(await batchFiles(), { mode: "frame", label: "batch " + state.sources.length });
    } catch (e) {
      console.error("batch export failed", e);
      ui.toast(STRINGS.exportFail);
    } finally {
      ui.setBusy(false);
    }
  }

  // Run any export action with the share sheet suppressed (save to device).
  async function withDownload(fn) { _forceDownload = true; try { return await fn(); } finally { _forceDownload = false; } }
  async function save() { return withDownload(run); }
  async function saveBatch() { return withDownload(runBatch); }

  // ---- Phase C3: flatten the whole post → ordered IG images ----
  function seqName(i, ext) { return exportPrefix() + "_" + String(i).padStart(2, "0") + "." + ext; }
  async function frameBlobFor(src) {
    const opt = state.exportOpt;
    const f = src.frame || state.frame;
    const eff = renderer.effective(src);
    const r = compositor.frameRatio(f, eff.w, eff.h);
    const { Cw, Ch } = compositor.exportDims(r.w, r.h, opt.ig);
    const cv = document.createElement("canvas");
    cv.width = Cw; cv.height = Ch;
    const ctx = cv.getContext("2d", { alpha: opt.format === "png" });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    compositor.composeFrame(ctx, eff.bitmap, eff.w, eff.h, Cw, Ch, f);
    const type = opt.format === "png" ? "image/png" : "image/jpeg";
    const quality = opt.format === "png" ? undefined : opt.quality;
    const blob = await canvasToBlob(cv, type, quality);
    cv.width = 0; cv.height = 0;
    return blob;
  }
  // Build every IG image for the post, in slide order (carousel → its N tiles).
  async function collageBlobFor(src) {
    const opt = state.exportOpt;
    const d = collageMode.collageDims(src, opt.ig ? CONFIG.IG_WIDTH : 1440);
    const cv = document.createElement("canvas");
    cv.width = d.W; cv.height = d.H;
    collageMode.compositeInto(cv, src, d.W, d.H);
    const type = opt.format === "png" ? "image/png" : "image/jpeg";
    const quality = opt.format === "png" ? undefined : opt.quality;
    const blob = await canvasToBlob(cv, type, quality);
    cv.width = 0; cv.height = 0;
    return blob;
  }
  async function postFiles() {
    await renderer.ensureCropAll(); // WYSIWYG: fresh crops across the whole post
    const opt = state.exportOpt;
    const ext = opt.format === "png" ? "png" : "jpg";
    const slides = postModel.deriveFrameSlides(state.sources);
    const files = [];
    let i = 0;
    for (const slide of slides) {
      const src = state.sources.find((s) => s.id === slide.srcId);
      if (!src) continue;
      if (slide.kind === "carousel") {
        const tiles = await carouselMode.tilesFor(src, src.carousel);
        for (const t of tiles) { i++; files.push(new File([t.blob], seqName(i, ext), { type: t.blob.type })); }
      } else if (slide.kind === "collage") {
        i++;
        const blob = await collageBlobFor(src);
        files.push(new File([blob], seqName(i, ext), { type: blob.type }));
      } else {
        i++;
        const blob = await frameBlobFor(src);
        files.push(new File([blob], seqName(i, ext), { type: blob.type }));
      }
    }
    return files;
  }
  async function runPost(pack) {
    if (!state.sources.length) return false;
    ui.setBusy(true);
    try {
      const files = await postFiles();
      if (!files.length) return false;
      return await deliverMany(files, { mode: "post", label: files.length + " image post" }, { pack });
    } catch (e) {
      console.error("post export", e); ui.toast(STRINGS.exportFail); return false;
    } finally { ui.setBusy(false); }
  }
  async function savePost(pack) { return withDownload(() => runPost(pack)); }

  return { run, runBatch, batchFiles, save, saveBatch, withDownload, deliverMany, triggerDownload, exportPrefix, nameFor, postFiles, runPost, savePost };
})();
