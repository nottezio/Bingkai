import { carouselMode } from './carouselMode.js';
import { collageMode } from './collageMode.js';
import { compositor } from './compositor.js';
import { CONFIG } from './config.js';
import { cropMode } from './cropMode.js';
import { geometryCore } from './geometryCore.js';
import { state } from './state.js';

export const renderer = (function () {
  const stage = document.getElementById("stage");
  const ctx = stage.getContext("2d");

  function activeSource() {
    return state.sources.find((s) => s.id === state.activeId) || null;
  }

  // The drawable a mode should use: the CROPPED image when a non-identity crop
  // exists, otherwise the full original. This is what makes crop a global,
  // non-destructive upstream transform (crop → frame/collage/carousel).
  function effective(src) {
    if (src && src.crop && src.croppedBitmap) {
      return { bitmap: src.croppedBitmap, w: src.cropDims.w, h: src.cropDims.h };
    }
    return { bitmap: src.bitmap, w: src.w, h: src.h };
  }

  // A crop that doesn't actually change anything (whole image).
  function isIdentityCrop(crop) {
    return !crop || (crop.ratio === "original" && Math.abs((crop.zoom || 1) - 1) < 1e-3);
  }

  // Bake the active/given source's crop into a cached cropped bitmap (GPU-side,
  // via createImageBitmap with a sub-rect). Closes the previous one.
  async function bakeCrop(src) {
    if (!src) return;
    if (isIdentityCrop(src.crop)) {
      if (src.croppedBitmap) { try { src.croppedBitmap.close(); } catch (_) {} }
      src.croppedBitmap = null; src.cropDims = null;
      return;
    }
    const r = geometryCore.parseRatio(src.crop.ratio, src.w, src.h);
    // honor the per-image orientation flip (landscape) for non-square ratios
    let rw = r.w, rh = r.h;
    if (src.crop.flip && src.crop.ratio !== "original" && r.w !== r.h) { rw = r.h; rh = r.w; }
    const box = geometryCore.computeCropBoxLocked({
      sourceW: src.w, sourceH: src.h, ratioW: rw, ratioH: rh,
      zoom: src.crop.zoom, centerX: src.crop.cx * src.w, centerY: src.crop.cy * src.h,
    });
    const sx = Math.max(0, Math.round(box.x)), sy = Math.max(0, Math.round(box.y));
    const sw = Math.min(src.w - sx, Math.round(box.w)), sh = Math.min(src.h - sy, Math.round(box.h));
    const prev = src.croppedBitmap;
    src.croppedBitmap = await createImageBitmap(src.bitmap, sx, sy, Math.max(1, sw), Math.max(1, sh));
    src.cropDims = { w: src.croppedBitmap.width, h: src.croppedBitmap.height };
    if (prev) { try { prev.close(); } catch (_) {} }
  }
  async function bakeCropActive() { await bakeCrop(activeSource()); }

  // Mark the active source and redraw. Previews now render from the full-res
  // bitmap directly (sharper), so no downscaled working bitmap is needed.
  async function useActive() {
    const src = activeSource();
    if (!src) { clear(); return; }
    if (src.frame) state.frame = src.frame; // Phase C: frame settings are per-slide
    if (src.carousel) state.carousel = src.carousel; // Phase C2: carousel settings per-slide
    if (src.collage) state.collage = src.collage; // Phase C4: collage settings per-slide
    state.work = { id: src.id };
    draw();
  }

  function clear() {
    const ws = document.getElementById("workspace");
    sizeStage(ws.clientWidth, ws.clientHeight);
    ctx.clearRect(0, 0, stage.width, stage.height);
  }

  // Size the backing store to the workspace box × capped DPR; CSS keeps layout px.
  function sizeStage(cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.DPR_CAP);
    stage.style.width = cssW + "px";
    stage.style.height = cssH + "px";
    stage.width = Math.max(1, Math.round(cssW * dpr));
    stage.height = Math.max(1, Math.round(cssH * dpr));
    return dpr;
  }

  // Mode-aware preview. Frame mode: render the actual output rectangle (at the
  // selected ratio) letterboxed on the gray stage, composed by `compositor`.
  function draw() {
    const ws = document.getElementById("workspace");
    const src = activeSource();
    if (!src) { clear(); return; }
    const dpr = sizeStage(ws.clientWidth, ws.clientHeight);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ws.clientWidth, ws.clientHeight);

    if (state.mode === "frame") {
      const f = state.frame;
      const eff = effective(src);
      const r = compositor.frameRatio(f, eff.w, eff.h);
      // Preview shape uses a stable nominal size; only the ratio matters here.
      const shape = geometryCore.canvasDimsForRatio(r.w, r.h, 1200);
      const fit = geometryCore.computeContainRect(shape.Cw, shape.Ch, ws.clientWidth, ws.clientHeight);
      ctx.save();
      ctx.translate(fit.x, fit.y);
      ctx.scale(fit.scale, fit.scale);
      // Draw the (possibly cropped) image at full resolution.
      compositor.composeFrame(ctx, eff.bitmap, eff.w, eff.h, shape.Cw, shape.Ch, f);
      ctx.restore();
      ctx.strokeStyle = "rgba(0,0,0,.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(fit.x + 0.5, fit.y + 0.5, fit.w - 1, fit.h - 1);
      return;
    }

    if (state.mode === "crop") {
      cropMode.drawPreview(ctx, ws.clientWidth, ws.clientHeight);
      return;
    }

    if (state.mode === "collage") {
      collageMode.drawPreview(ctx, ws.clientWidth, ws.clientHeight);
      return;
    }

    if (state.mode === "carousel") {
      carouselMode.drawPreview(ctx, ws.clientWidth, ws.clientHeight);
      return;
    }

    // Fallback: plain contain preview from full-res.
    const fit = geometryCore.computeContainRect(src.w, src.h, ws.clientWidth, ws.clientHeight);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src.bitmap, fit.x, fit.y, fit.w, fit.h);
  }

  return { useActive, draw, clear, activeSource, sizeStage, effective, bakeCrop, bakeCropActive };
})();
