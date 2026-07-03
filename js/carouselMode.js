import { CONFIG } from './config.js';
import { exporter } from './exporter.js';
import { geometryCore } from './geometryCore.js';
import { renderer } from './renderer.js';
import { sessionStore } from './sessionStore.js';
import { state } from './state.js';
import { STRINGS } from './strings.js';
import { ui } from './ui.js';
import { undo } from './undo.js';

export const carouselMode = (function () {
  const stage = document.getElementById("stage");
  let drag = null; // { lastX }

  // tileW: 1080 for IG (equal tiles → perfect seam), 1440 for hi-res.
  function composite(c) {
    c = c || state.carousel; const N = c.n;
    const r = geometryCore.parseRatio(c.tileRatio, 1, 1);
    const tileW = state.exportOpt.ig ? CONFIG.IG_WIDTH : 1440;
    const Hc = Math.round(tileW * (r.h / r.w));
    const Wc = N * tileW;                                   // exact equal tiles
    const b = geometryCore.computeCarouselBoundaries(Wc, N); // = k*tileW
    return { N, tileW, Hc, Wc, b };
  }

  // How the source maps onto the Wc×Hc composite.
  //  cover → a crop box (computeCropBoxLocked) with the composite's aspect, so
  //          zoom/cx/cy choose what's framed. fit → contained + letterboxed.
  //  `eff` is the effective drawable ({bitmap,w,h}) — cropped if a crop exists.
  function mapping(eff, Wc, Hc, c) {
    c = c || state.carousel;
    if (c.fill === "fit") {
      return { mode: "fit", comp: geometryCore.computeFillRect(eff.w, eff.h, Wc, Hc, "fit") };
    }
    const box = geometryCore.computeCropBoxLocked({
      sourceW: eff.w, sourceH: eff.h, ratioW: Wc, ratioH: Hc,
      zoom: c.zoom, centerX: c.cx * eff.w, centerY: c.cy * eff.h,
    });
    return { mode: "cover", box };
  }

  // Re-clamp cx/cy after pan/zoom so the framed box stays inside the source.
  function syncPosition(eff, Wc, Hc) {
    const box = geometryCore.computeCropBoxLocked({
      sourceW: eff.w, sourceH: eff.h, ratioW: Wc, ratioH: Hc,
      zoom: state.carousel.zoom, centerX: state.carousel.cx * eff.w, centerY: state.carousel.cy * eff.h,
    });
    state.carousel.cx = (box.x + box.w / 2) / eff.w;
    state.carousel.cy = (box.y + box.h / 2) / eff.h;
  }

  // Draw tile k (composite columns [b[k],b[k+1])) into dest rect, using mapping.
  function drawTile(ctx, k, eff, map, b, Wc, Hc, dest) {
    const tileW = b[k + 1] - b[k];
    ctx.save();
    ctx.beginPath(); ctx.rect(dest.x, dest.y, dest.w, dest.h); ctx.clip();
    ctx.imageSmoothingQuality = "high";
    if (map.mode === "fit") {
      ctx.fillStyle = "#000"; ctx.fillRect(dest.x, dest.y, dest.w, dest.h);
      ctx.translate(dest.x, dest.y);
      ctx.scale(dest.w / tileW, dest.h / Hc);
      ctx.drawImage(eff.bitmap, map.comp.x - b[k], map.comp.y, map.comp.w, map.comp.h);
    } else {
      // cover: this tile is the horizontal slice [b[k],b[k+1]) of the framed box
      const box = map.box;
      const sx = box.x + (b[k] / Wc) * box.w;
      const sw = (tileW / Wc) * box.w;
      ctx.drawImage(eff.bitmap, sx, box.y, sw, box.h, dest.x, dest.y, dest.w, dest.h);
    }
    ctx.restore();
  }

  // Preview metrics (tile display size + horizontal pitch).
  function metrics(wsW, wsH) {
    const { tileW, Hc } = composite();
    const dispH = wsH * 0.78;
    const dispW = dispH * (tileW / Hc);
    const gut = Math.max(6, wsW * 0.025);
    return { dispW, dispH, pitch: dispW + gut };
  }

  function drawPreview(ctx, wsW, wsH) {
    const src = renderer.activeSource();
    if (!src) return;
    const eff = renderer.effective(src);
    const { N, Hc, Wc, b } = composite();
    const map = mapping(eff, Wc, Hc);
    const m = metrics(wsW, wsH);
    const c = state.carousel;
    c.pos = geometryCore.clamp(c.pos, 0, N - 1);
    const cx = wsW / 2, midY = wsH / 2;

    for (let k = 0; k < N; k++) {
      const x = cx + (k - c.pos) * m.pitch - m.dispW / 2;
      if (x + m.dispW < 0 || x > wsW) continue;
      const dest = { x, y: midY - m.dispH / 2, w: m.dispW, h: m.dispH };
      drawTile(ctx, k, eff, map, b, Wc, Hc, dest);
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1;
      ctx.strokeRect(dest.x + 0.5, dest.y + 0.5, dest.w - 1, dest.h - 1);
    }
    // page dots
    const dotsY = midY + m.dispH / 2 + 22, dotR = 3.5, gap = 16;
    const totalW = (N - 1) * gap;
    for (let k = 0; k < N; k++) {
      const dx = cx - totalW / 2 + k * gap;
      ctx.beginPath(); ctx.arc(dx, dotsY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = Math.round(c.pos) === k ? "#4A9EFF" : "rgba(255,255,255,.3)";
      ctx.fill();
    }
  }

  // ----- gestures: horizontal swipe = browse; vertical drag = position; pinch = zoom -----
  const pointers = new Map();
  let pinchPrev = 0;

  function onDown(e) {
    if (state.mode !== "carousel" || !renderer.activeSource()) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) undo.begin();
    if (pointers.size === 2) pinchPrev = pdist();
    else drag = { lastX: e.clientX, lastY: e.clientY, axis: null };
  }
  function pdist() { const p = [...pointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }

  function onMove(e) {
    if (state.mode !== "carousel" || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ws = document.getElementById("workspace");
    const m = metrics(ws.clientWidth, ws.clientHeight);
    const { N, Hc, Wc } = composite();
    const src = renderer.activeSource();
    const eff = src ? renderer.effective(src) : null;
    const c = state.carousel;

    if (pointers.size >= 2) {
      // pinch zoom about the image centre (cover only)
      const d = pdist();
      if (pinchPrev > 0 && d > 0 && c.fill === "cover" && eff) {
        const z = geometryCore.cropZoomAboutPoint({
          sourceW: eff.w, sourceH: eff.h, ratioW: Wc, ratioH: Hc,
          zoom: c.zoom, centerX: c.cx * eff.w, centerY: c.cy * eff.h, factor: d / pinchPrev, fx: 0.5, fy: 0.5,
        });
        c.zoom = z.zoom; c.cx = z.centerX / eff.w; c.cy = z.centerY / eff.h;
        syncPosition(eff, Wc, Hc);
      }
      pinchPrev = d;
      renderer.draw();
      return;
    }
    if (!drag) return;
    if (c.adjust !== "browse" && c.fill === "cover" && eff) {
      // free reposition: the image follows the finger in both axes
      const box = mapping(eff, Wc, Hc).box;
      c.cx -= (dx * ((box.w / N) / m.dispW)) / eff.w;
      c.cy -= (dy * (box.h / m.dispH)) / eff.h;
      syncPosition(eff, Wc, Hc);
    } else {
      // browse mode: lock axis — horizontal scrolls tiles, vertical repositions
      if (!drag.axis) {
        if (Math.abs(dx) > Math.abs(dy) + 2) drag.axis = "browse";
        else if (Math.abs(dy) > Math.abs(dx) + 2) drag.axis = "position";
      }
      if (drag.axis === "position" && c.fill === "cover" && eff) {
        const box = mapping(eff, Wc, Hc).box;
        c.cy -= (dy * (box.h / m.dispH)) / eff.h;
        syncPosition(eff, Wc, Hc);
      } else {
        c.pos = geometryCore.clamp(c.pos - dx / m.pitch, 0, N - 1);
      }
    }
    renderer.draw();
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchPrev = 0;
    // #2: no snap-to-tile — leave pos wherever the finger released it (free scroll).
    if (drag) { drag = null; renderer.draw(); }
    sessionStore.scheduleMeta();
    if (pointers.size === 0) undo.commit();
  }
  function bind() {
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
  }

  // ----- export N tiles in upload order, sequentially (flat memory) -----
  // Compose the N seamless tiles as File[] (no delivery) — used by export + preview.
  async function carouselFiles() {
    const src = renderer.activeSource();
    if (!src) return [];
    const eff = renderer.effective(src);
    const { N, Hc, Wc, b } = composite();
    const map = mapping(eff, Wc, Hc);
    const opt = state.exportOpt;
    const ext = opt.format === "png" ? "png" : "jpg";
    const type = opt.format === "png" ? "image/png" : "image/jpeg";
    const names = geometryCore.carouselFilenames(N, exporter.exportPrefix(), ext);
    const files = [];
    for (let k = 0; k < N; k++) {
      const w = b[k + 1] - b[k];
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = Hc;
      const ctx = cv.getContext("2d", { alpha: opt.format === "png" });
      drawTile(ctx, k, eff, map, b, Wc, Hc, { x: 0, y: 0, w, h: Hc }); // WYSIWYG
      const quality = opt.format === "png" ? undefined : opt.quality;
      const blob = await new Promise((res) => cv.toBlob(res, type, quality));
      files.push(new File([blob], names[k], { type: blob.type }));
      cv.width = 0; cv.height = 0; // release each tile before the next
    }
    return files;
  }

  async function exportTiles() {
    const src = renderer.activeSource();
    if (!src) return;
    ui.setBusy(true);
    try {
      await exporter.deliverMany(await carouselFiles(), { mode: "carousel", label: state.carousel.n + " tile" });
    } catch (e) {
      console.error("carousel export", e);
      ui.toast(STRINGS.exportFail);
    } finally {
      ui.setBusy(false);
    }
  }

  // Compose the N carousel tiles for ANY source + its own settings (not just the
  // active one). Returns raw {blob,w,h} in posting order — the flatten exporter
  // names them. Reuses the tested composite/mapping/drawTile path.
  async function tilesFor(src, c) {
    if (!src) return [];
    c = c || state.carousel;
    const eff = renderer.effective(src);
    const { N, Hc, Wc, b } = composite(c);
    const map = mapping(eff, Wc, Hc, c);
    const opt = state.exportOpt;
    const type = opt.format === "png" ? "image/png" : "image/jpeg";
    const quality = opt.format === "png" ? undefined : opt.quality;
    const out = [];
    for (let k = 0; k < N; k++) {
      const w = b[k + 1] - b[k];
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = Hc;
      const ctx = cv.getContext("2d", { alpha: opt.format === "png" });
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      drawTile(ctx, k, eff, map, b, Wc, Hc, { x: 0, y: 0, w, h: Hc });
      const blob = await new Promise((res) => cv.toBlob(res, type, quality));
      out.push({ blob, w, h: Hc });
      cv.width = 0; cv.height = 0; // release each before the next
    }
    return out;
  }

  return { bind, drawPreview, exportTiles, carouselFiles, composite, mapping, drawTile, syncPosition, tilesFor };
})();
