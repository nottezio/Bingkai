import { geometryCore } from './geometryCore.js';
import { CONFIG } from './config.js';

export const compositor = (function () {
  // Cover-draw a bitmap over Cw×Ch, centered, with optional overscan (>1).
  function coverDraw(ctx, bmp, bw, bh, Cw, Ch, overscan) {
    const s = Math.max(Cw / bw, Ch / bh) * (overscan || 1);
    const dw = bw * s, dh = bh * s;
    ctx.drawImage(bmp, (Cw - dw) / 2, (Ch - dh) / 2, dw, dh);
  }

  // Returns the geometryCore layout it used (so callers/tests can verify).
  function composeFrame(ctx, bmp, bw, bh, Cw, Ch, f) {
    if (f.bg === "blur") {
      const r = Math.max(1, Math.round(Math.min(Cw, Ch) * (f.blurStrength || 0.05)));
      ctx.save();
      ctx.filter = "blur(" + r + "px)";
      coverDraw(ctx, bmp, bw, bh, Cw, Ch, 1.12); // overscan hides blur bleed at edges
      ctx.restore();
    } else {
      ctx.fillStyle = f.frameColor;
      ctx.fillRect(0, 0, Cw, Ch);
    }
    const L = geometryCore.computeFrameLayout({ sw: bw, sh: bh, Cw, Ch, marginPct: f.marginPct });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, L.draw.x, L.draw.y, L.draw.w, L.draw.h);
    return L;
  }

  // Target canvas pixel dims for a ratio under the current export profile.
  function exportDims(ratioW, ratioH, ig) {
    if (ig) {
      const Cw = CONFIG.IG_WIDTH;
      const Ch = Math.round(Cw * (ratioH / ratioW));
      return { Cw, Ch };
    }
    return geometryCore.canvasDimsForRatio(ratioW, ratioH, CONFIG.EXPORT_MAX);
  }

  // Frame output ratio, honoring the orientation flip for non-square ratios.
  function frameRatio(f, w, h) {
    const r = geometryCore.parseRatio(f.ratio, w, h);
    if (f.flip && f.ratio !== "original" && r.w !== r.h) return { w: r.h, h: r.w };
    return r;
  }

  return { composeFrame, coverDraw, exportDims, frameRatio };
})();
