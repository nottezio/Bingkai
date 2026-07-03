import { collageMode } from './collageMode.js';
import { CONFIG } from './config.js';
import { geometryCore } from './geometryCore.js';
import { layoutPicker } from './layoutPicker.js';
import { renderer } from './renderer.js';
import { sessionStore } from './sessionStore.js';
import { bumpIdSeq, cloneCarousel, cloneCollage, cloneFrame, nextId, state } from './state.js';
import { STRINGS } from './strings.js';
import { ui } from './ui.js';

export const importer = (function () {

  // Decode a File/Blob into an orientation-corrected ImageBitmap.
  // `imageOrientation:'from-image'` makes the decoder apply the EXIF transform,
  // so intrinsic w/h are the *visual* dimensions — no manual EXIF parsing.
  async function decodeOriented(blob) {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch (e) {
      // Fallback path: some engines reject the options bag. Decode raw, then
      // the rotation may be wrong — acceptable degraded mode, flagged to user.
      return await createImageBitmap(blob);
    }
  }

  // Downscale a full-res bitmap to <= WORK_MAX on its long edge for the preview
  // pipeline. Returns a NEW ImageBitmap; caller owns its lifecycle.
  async function makeWorkingBitmap(srcBitmap, w, h) {
    const long = Math.max(w, h);
    if (long <= CONFIG.WORK_MAX) {
      // Already small enough — clone so working/source lifecycles stay separate.
      return await createImageBitmap(srcBitmap);
    }
    const scale = CONFIG.WORK_MAX / long;
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));
    const off = new OffscreenCanvas(dw, dh);
    const ctx = off.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(srcBitmap, 0, 0, dw, dh);
    return await createImageBitmap(off);
  }

  // Small JPEG thumbnail (object URL) for the filmstrip. Cheap, cover-cropped.
  async function makeThumbUrl(srcBitmap, w, h, size = 104) {
    const fit = geometryCore.computeCoverRect(w, h, size, size);
    const off = new OffscreenCanvas(size, size);
    const ctx = off.getContext("2d");
    ctx.drawImage(srcBitmap, fit.x, fit.y, fit.w, fit.h);
    const blob = await off.convertToBlob({ type: "image/jpeg", quality: 0.7 });
    return URL.createObjectURL(blob);
  }

  // Import a list of File objects → push sources, return how many succeeded.
  async function importFiles(fileList) {
    const files = Array.from(fileList).filter((f) => /^image\//.test(f.type));
    if (!files.length) { ui.toast(STRINGS.errNoImages); return 0; }
    ui.setBusy(true);
    let ok = 0;
    try {
      for (const f of files) {
        try {
          const bitmap = await decodeOriented(f);
          const w = bitmap.width, h = bitmap.height; // already orientation-corrected
          const thumbUrl = await makeThumbUrl(bitmap, w, h);
          const id = nextId();
          state.sources.push({ id, name: f.name || (id + ".jpg"), bitmap, w, h, thumbUrl, blob: f, crop: null, croppedBitmap: null, cropDims: null, frame: cloneFrame(state.frame), kind: "frame", carousel: cloneCarousel(state.carousel), collage: cloneCollage(state.collage) });
          sessionStore.putSource({ id, name: f.name || (id + ".jpg"), blob: f });
          if (!state.activeId) state.activeId = id;
          ok++;
        } catch (e) {
          console.error("decode failed", f && f.name, e);
          ui.toast(STRINGS.errDecode + (f && f.name ? f.name : ""));
        }
      }
    } finally {
      ui.setBusy(false);
    }
    if (ok) { await renderer.useActive(); ui.refreshFilmstrip(); ui.refreshEmpty(); ui.updateExportNote(); if (state.mode === "collage") { collageMode.assignSources(); renderer.draw(); layoutPicker.refreshCellFill(); } sessionStore.scheduleMeta(); }
    return ok;
  }

  // Release everything tied to a source (GPU bitmap + object URL).
  function disposeSource(src) {
    try { src.bitmap && src.bitmap.close && src.bitmap.close(); } catch (_) {}
    try { src.croppedBitmap && src.croppedBitmap.close && src.croppedBitmap.close(); } catch (_) {}
    try { src.thumbUrl && URL.revokeObjectURL(src.thumbUrl); } catch (_) {}
  }

  // Recreate a source from a persisted record (keeps its original id + crop).
  async function restoreSource(rec, crop) {
    const bitmap = await decodeOriented(rec.blob);
    const w = bitmap.width, h = bitmap.height;
    const thumbUrl = await makeThumbUrl(bitmap, w, h);
    state.sources.push({
      id: rec.id, name: rec.name || (rec.id + ".jpg"), bitmap, w, h, thumbUrl,
      blob: rec.blob, crop: crop || null, croppedBitmap: null, cropDims: null, frame: cloneFrame(state.frame), kind: "frame", carousel: cloneCarousel(state.carousel), collage: cloneCollage(state.collage),
    });
    const n = parseInt(String(rec.id).replace(/^src_/, ""), 10);
    bumpIdSeq(n);
  }

  // Rotate the working bitmap to an absolute 90° step (0/90/180/270), keeping
  // the original around so rotation stays lossless and reversible. All modes
  // read src.bitmap/src.w/src.h, so they pick up the new orientation for free.
  async function applyRotation(src, deg) {
    if (!src) return;
    const d = (((deg | 0) % 360) + 360) % 360;
    if (!src.origBitmap) { src.origBitmap = src.bitmap; src.origW = src.w; src.origH = src.h; }
    const closeCur = () => { if (src.bitmap && src.bitmap !== src.origBitmap) { try { src.bitmap.close(); } catch (_) {} } };
    if (d === 0) {
      closeCur();
      src.bitmap = src.origBitmap; src.w = src.origW; src.h = src.origH;
    } else {
      const dims = geometryCore.rotatedDims(src.origW, src.origH, d);
      const cv = document.createElement("canvas");
      cv.width = dims.w; cv.height = dims.h;
      const ctx = cv.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.translate(dims.w / 2, dims.h / 2);
      ctx.rotate((d * Math.PI) / 180);
      ctx.drawImage(src.origBitmap, -src.origW / 2, -src.origH / 2, src.origW, src.origH);
      const rb = await createImageBitmap(cv);
      closeCur();
      src.bitmap = rb; src.w = dims.w; src.h = dims.h;
    }
    try { if (src.thumbUrl) URL.revokeObjectURL(src.thumbUrl); } catch (_) {}
    src.thumbUrl = await makeThumbUrl(src.bitmap, src.w, src.h);
  }

  return { importFiles, makeWorkingBitmap, disposeSource, restoreSource, applyRotation };
})();
