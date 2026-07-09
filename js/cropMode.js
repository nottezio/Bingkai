import { cropDebug } from './cropDebug.js';
import { geometryCore } from './geometryCore.js';
import { importer } from './importer.js';
import { renderer } from './renderer.js';
import { sessionStore } from './sessionStore.js';
import { state } from './state.js';
import { ui } from './ui.js';
import { undo } from './undo.js';

export const cropMode = (function () {
  const stage = document.getElementById("stage");
  const pointers = new Map(); // pointerId -> {x,y}
  let pinchPrev = 0;

  // The crop transform lives ON the active source (per-image, non-destructive).
  // Default is identity (original ratio, zoom 1) so visiting Crop changes nothing
  // until the user picks a ratio or zooms.
  function cur() {
    const src = renderer.activeSource();
    if (!src) return null;
    if (!src.crop) src.crop = { ratio: "original", zoom: 1, cx: 0.5, cy: 0.5, flip: false, rotate: 0 };
    if (src.crop.flip === undefined) src.crop.flip = false;
    if (src.crop.rotate === undefined) src.crop.rotate = 0;
    return src.crop;
  }

  function ratioNums() {
    const src = renderer.activeSource();
    const c = cur();
    const base = geometryCore.parseRatio(c ? c.ratio : "original", src ? src.w : 1, src ? src.h : 1);
    // orientation flip: swap the aspect for non-square, non-original ratios
    if (c && c.flip && c.ratio !== "original" && base.w !== base.h) {
      return { w: base.h, h: base.w };
    }
    return base;
  }

  // true when the active ratio has a meaningful orientation (not square/original)
  function canFlip() {
    const c = cur();
    return !!c && c.ratio !== "original" && c.ratio !== "1:1";
  }

  async function applyChange() {
    // Keep the slide's display ratio locked to the crop: the overview/frame must
    // follow the cropped aspect, otherwise a 3:2 crop shows inside a 4:5 card.
    if (state.frame) state.frame.ratio = "original";
    await renderer.bakeCropActive();
    renderer.draw();
    ui.refreshFilmstrip();
    sessionStore.scheduleMeta();
  }

  // The crop FRAME is fixed: the chosen aspect ratio, contained in the stage.
  // The image pans/zooms underneath it (Instagram-style).
  function frameRect(wsW, wsH) {
    const r = ratioNums(), pad = 16;
    const shape = geometryCore.canvasDimsForRatio(r.w, r.h, 1000);
    const fit = geometryCore.computeContainRect(shape.Cw, shape.Ch, wsW - 2 * pad, wsH - 2 * pad);
    return { x: pad + fit.x, y: pad + fit.y, w: fit.w, h: fit.h };
  }

  // On-screen scale that maps the source crop box onto the fixed frame.
  function frameScale(fr, box) { return fr.w / box.w; }

  function boxFor(W, H) {
    const r = ratioNums(), c = cur();
    return geometryCore.computeCropBoxLocked({
      sourceW: W, sourceH: H, ratioW: r.w, ratioH: r.h,
      zoom: c.zoom, centerX: c.cx * W, centerY: c.cy * H,
    });
  }

  // Snap cx/cy to the clamped centre so state never drifts out of bounds.
  function syncCenterFrom(box, W, H) {
    const c = cur();
    c.cx = (box.x + box.w / 2) / W;
    c.cy = (box.y + box.h / 2) / H;
  }

  async function rotate90() {
    const src = renderer.activeSource(); const c = cur();
    if (!src || !c) return;
    c.rotate = ((c.rotate || 0) + 90) % 360;
    c.zoom = 1; c.cx = 0.5; c.cy = 0.5; // re-frame after the orientation change
    await importer.applyRotation(src, c.rotate);
    await applyChange();
  }

  async function reset() {
    const src = renderer.activeSource(); const c = cur();
    c.ratio = "original"; c.zoom = 1; c.cx = 0.5; c.cy = 0.5; c.flip = false;
    if (c.rotate) { c.rotate = 0; await importer.applyRotation(src, 0); }
    await applyChange();
  }

  function onDown(e) {
    if (state.mode !== "crop" || !renderer.activeSource()) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) undo.begin();
    if (pointers.size === 2) pinchPrev = pinchDist();
  }
  function pinchDist() {
    const p = [...pointers.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
  function pinchMid() {
    const p = [...pointers.values()];
    return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  }

  function onMove(e) {
    if (state.mode !== "crop" || !pointers.has(e.pointerId)) return;
    const src = renderer.activeSource();
    if (!src) return;
    const prev = pointers.get(e.pointerId);
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const ws = document.getElementById("workspace");
    const fr = frameRect(ws.clientWidth, ws.clientHeight);
    const box = boxFor(src.w, src.h);
    const scale = frameScale(fr, box);

    if (pointers.size >= 2) {
      const d = pinchDist();
      if (pinchPrev > 0 && d > 0) {
        const mid = pinchMid();
        const sr = stage.getBoundingClientRect();
        // focal point as a fraction of the fixed frame
        const fx = geometryCore.clamp((mid.x - sr.left - fr.x) / fr.w, 0, 1);
        const fy = geometryCore.clamp((mid.y - sr.top - fr.y) / fr.h, 0, 1);
        const r = ratioNums(); const c = cur();
        const z = geometryCore.cropZoomAboutPoint({
          sourceW: src.w, sourceH: src.h, ratioW: r.w, ratioH: r.h,
          zoom: c.zoom, centerX: c.cx * src.w, centerY: c.cy * src.h,
          // Fixed frame: spreading fingers zooms the IMAGE in (smaller box ⇒ higher zoom).
          factor: d / pinchPrev, fx, fy,
        });
        c.zoom = z.zoom;
        // Atomic clamp (same rationale as the pan path): derive the clamped
        // center from the post-zoom box and assign in one step, never leaving an
        // unclamped cx/cy for a concurrent bake to observe.
        const zbox = geometryCore.computeCropBoxLocked({
          sourceW: src.w, sourceH: src.h, ratioW: r.w, ratioH: r.h,
          zoom: z.zoom, centerX: z.centerX, centerY: z.centerY,
        });
        c.cx = (zbox.x + zbox.w / 2) / src.w;
        c.cy = (zbox.y + zbox.h / 2) / src.h;
      }
      pinchPrev = d;
    } else {
      // Pan: the IMAGE follows the finger, so the source point under the frame
      // centre moves opposite to the drag.
      //
      // ATOMIC CLAMP: compute the desired raw center, run it through the box
      // clamp, and write the CLAMPED center back to c in one synchronous step.
      // Previously c.cx/c.cy were set to raw (possibly out-of-range) values and
      // only reconciled by a following syncCenterFrom() call — leaving a window
      // where c held an unclamped center. A bake firing in that window baked the
      // wrong region AND stamped a matching _cropSig, producing the intermittent
      // "export shows an area N px off from the box" desync (diagnostic caught it
      // as BOX-MISMATCH Δ(0,495,0,0) with no dims change).
      const c = cur();
      const rawCx = c.cx - dx / (scale * src.w);
      const rawCy = c.cy - dy / (scale * src.h);
      const r = ratioNums();
      const clampedBox = geometryCore.computeCropBoxLocked({
        sourceW: src.w, sourceH: src.h, ratioW: r.w, ratioH: r.h,
        zoom: c.zoom, centerX: rawCx * src.w, centerY: rawCy * src.h,
      });
      c.cx = (clampedBox.x + clampedBox.w / 2) / src.w;
      c.cy = (clampedBox.y + clampedBox.h / 2) / src.h;
    }
    renderer.draw();
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchPrev = 0;
    // bake the (possibly changed) crop so other modes see it
    if (state.mode === "crop") { renderer.bakeCropActive().then(() => ui.refreshFilmstrip()); sessionStore.scheduleMeta(); }
    if (pointers.size === 0) undo.commit();
  }

  function bind() {
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
  }

  // Fixed crop frame; the image is scaled/positioned so the export box maps onto
  // the frame, with the surrounding image dimmed. Image moves/zooms under the frame.
  function drawPreview(ctx, wsW, wsH) {
    const src = renderer.activeSource();
    if (!src) return;
    const fr = frameRect(wsW, wsH);
    const box = boxFor(src.w, src.h);
    cropDebug.previewBox(src, box, renderer.cropSig(src.crop));
    const scale = frameScale(fr, box);
    const ix = fr.x - box.x * scale, iy = fr.y - box.y * scale;
    const iw = src.w * scale, ih = src.h * scale;

    ctx.imageSmoothingQuality = "high";
    // whole image, then a dim veil over everything, then the frame re-lit
    ctx.drawImage(src.bitmap, ix, iy, iw, ih);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, 0, wsW, wsH);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
    ctx.drawImage(src.bitmap, ix, iy, iw, ih);
    ctx.restore();
    // frame border + rule-of-thirds (on the fixed frame)
    ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2;
    ctx.strokeRect(fr.x + 1, fr.y + 1, fr.w - 2, fr.h - 2);
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const gx = fr.x + (fr.w * i) / 3, gy = fr.y + (fr.h * i) / 3;
      ctx.beginPath(); ctx.moveTo(gx, fr.y); ctx.lineTo(gx, fr.y + fr.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fr.x, gy); ctx.lineTo(fr.x + fr.w, gy); ctx.stroke();
    }
  }

  function exportBox() {
    const src = renderer.activeSource();
    return { box: boxFor(src.w, src.h), ratio: ratioNums() };
  }

  return { bind, reset, drawPreview, exportBox, ratioNums, cur, applyChange, canFlip, rotate90 };
})();
