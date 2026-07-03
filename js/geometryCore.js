export const geometryCore = (function () {
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function splitInteger(total, n) {
    if (!Number.isInteger(total)) throw new RangeError('splitInteger: total must be integer');
    if (n <= 0) throw new RangeError('splitInteger: n must be > 0');
    const base = Math.floor(total / n);
    const rem = total - base * n;
    const parts = new Array(n);
    for (let i = 0; i < n; i++) parts[i] = base + (i < rem ? 1 : 0);
    return parts;
  }

  const RATIO_PRESETS = {
    '1:1': [1, 1], '4:5': [4, 5], '3:4': [3, 4],
    '9:16': [9, 16], '16:9': [16, 9], '3:2': [3, 2],
  };

  function parseRatio(preset, sourceW, sourceH) {
    if (preset === 'original') {
      if (!(sourceW > 0 && sourceH > 0)) throw new RangeError('parseRatio: "original" needs positive source dims');
      return { w: sourceW, h: sourceH };
    }
    const p = RATIO_PRESETS[preset];
    if (!p) throw new RangeError('parseRatio: unknown preset "' + preset + '"');
    return { w: p[0], h: p[1] };
  }

  function canvasDimsForRatio(ratioW, ratioH, exportShortEdge) {
    if (ratioW <= 0 || ratioH <= 0) throw new RangeError('canvasDimsForRatio: bad ratio');
    if (exportShortEdge <= 0) throw new RangeError('canvasDimsForRatio: bad short edge');
    let Cw, Ch;
    if (ratioW <= ratioH) { Cw = exportShortEdge; Ch = Math.round(exportShortEdge * (ratioH / ratioW)); }
    else { Ch = exportShortEdge; Cw = Math.round(exportShortEdge * (ratioW / ratioH)); }
    return { Cw, Ch };
  }

  function computeContainRect(sw, sh, dw, dh) {
    const scale = Math.min(dw / sw, dh / sh);
    const w = sw * scale, h = sh * scale;
    return { x: (dw - w) / 2, y: (dh - h) / 2, w, h, scale };
  }
  function computeCoverRect(sw, sh, dw, dh) {
    const scale = Math.max(dw / sw, dh / sh);
    const w = sw * scale, h = sh * scale;
    return { x: (dw - w) / 2, y: (dh - h) / 2, w, h, scale };
  }
  function computeFillRect(sw, sh, dw, dh, mode) {
    return mode === 'cover' ? computeCoverRect(sw, sh, dw, dh) : computeContainRect(sw, sh, dw, dh);
  }

  function computeFrameLayout({ sw, sh, Cw, Ch, marginPct }) {
    if (sw <= 0 || sh <= 0 || Cw <= 0 || Ch <= 0) throw new RangeError('computeFrameLayout: dims must be > 0');
    if (marginPct < 0 || marginPct > 25) throw new RangeError('computeFrameLayout: marginPct out of [0,25]');
    const marginPx = (marginPct / 100) * Math.min(Cw, Ch);
    const inner = { x: marginPx, y: marginPx, w: Cw - 2 * marginPx, h: Ch - 2 * marginPx };
    const fit = computeContainRect(sw, sh, inner.w, inner.h);
    const draw = { x: inner.x + fit.x, y: inner.y + fit.y, w: fit.w, h: fit.h, scale: fit.scale };
    const frame = { top: draw.y, bottom: Ch - (draw.y + draw.h), left: draw.x, right: Cw - (draw.x + draw.w) };
    return { marginPx, inner, draw, frame };
  }

  function maxAspectBox(sw, sh, rw, rh) {
    const r = rw / rh;
    if (sw / sh > r) return { w: sh * r, h: sh };
    return { w: sw, h: sw / r };
  }
  function clampCropBox(box, sw, sh) {
    const w = clamp(box.w, 1, sw), h = clamp(box.h, 1, sh);
    const x = clamp(box.x, 0, sw - w), y = clamp(box.y, 0, sh - h);
    return { x, y, w, h };
  }
  function computeCropBoxLocked({ sourceW, sourceH, ratioW, ratioH, zoom, centerX, centerY }) {
    if (sourceW <= 0 || sourceH <= 0) throw new RangeError('crop: source dims > 0');
    const max = maxAspectBox(sourceW, sourceH, ratioW, ratioH);
    const z = Math.max(1, zoom);
    const w = max.w / z, h = max.h / z;
    const cx = clamp(centerX, w / 2, sourceW - w / 2);
    const cy = clamp(centerY, h / 2, sourceH - h / 2);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  function cropZoomAboutPoint({ sourceW, sourceH, ratioW, ratioH, zoom, centerX, centerY, factor, fx, fy, maxZoom = 64 }) {
    const max = maxAspectBox(sourceW, sourceH, ratioW, ratioH);
    const oldZ = Math.max(1, zoom);
    const oldW = max.w / oldZ, oldH = max.h / oldZ;
    const oldX = clamp(centerX, oldW / 2, sourceW - oldW / 2) - oldW / 2;
    const oldY = clamp(centerY, oldH / 2, sourceH - oldH / 2) - oldH / 2;
    const srcX = oldX + fx * oldW, srcY = oldY + fy * oldH;
    const newZ = clamp(oldZ * factor, 1, maxZoom);
    const newW = max.w / newZ, newH = max.h / newZ;
    let ncx = srcX + newW * (0.5 - fx), ncy = srcY + newH * (0.5 - fy);
    ncx = clamp(ncx, newW / 2, sourceW - newW / 2);
    ncy = clamp(ncy, newH / 2, sourceH - newH / 2);
    return { zoom: newZ, centerX: ncx, centerY: ncy };
  }

  function computeCarouselComposite({ Hc, N, tileRatioW, tileRatioH }) {
    if (Hc <= 0) throw new RangeError('carousel: Hc must be > 0');
    if (!(Number.isInteger(N) && N >= 2 && N <= 10)) throw new RangeError('carousel: N must be an integer in 2..10');
    const tileWNominal = Hc * (tileRatioW / tileRatioH);
    const Wc = Math.round(N * tileWNominal);
    if (Wc < N) throw new RangeError('carousel: Wc < N (degenerate composite)');
    return { Wc, Hc, tileWNominal };
  }
  function computeCarouselBoundaries(Wc, N) {
    if (!(Number.isInteger(Wc) && Wc >= N)) throw new RangeError('carousel: need integer Wc >= N');
    const b = new Array(N + 1);
    for (let k = 0; k <= N; k++) b[k] = Math.round((k * Wc) / N);
    return b;
  }
  function carouselTiles(Wc, Hc, N) {
    const b = computeCarouselBoundaries(Wc, N);
    const tiles = new Array(N);
    for (let k = 0; k < N; k++) tiles[k] = { index: k, x: b[k], y: 0, w: b[k + 1] - b[k], h: Hc };
    return tiles;
  }
  function carouselFilenames(N, prefix = 'seamless', ext = 'jpg') {
    const out = new Array(N);
    for (let k = 1; k <= N; k++) out[k - 1] = `${prefix}_${String(k).padStart(2, '0')}.${ext}`;
    return out;
  }

  function computeCollageLayout({ Cw, Ch, rows, cols, outerMargin = 0, gutter = 0 }) {
    if (!(Number.isInteger(rows) && rows > 0)) throw new RangeError('collage: rows > 0 int');
    if (!(Number.isInteger(cols) && cols > 0)) throw new RangeError('collage: cols > 0 int');
    const M = outerMargin, G = gutter;
    const aw = Cw - 2 * M, ah = Ch - 2 * M;
    const colTotal = aw - (cols - 1) * G, rowTotal = ah - (rows - 1) * G;
    if (colTotal < cols || rowTotal < rows) throw new RangeError('collage: not enough space for cells (>=1px each)');
    const colW = splitInteger(colTotal, cols), rowH = splitInteger(rowTotal, rows);
    const lefts = new Array(cols); let x = M;
    for (let c = 0; c < cols; c++) { lefts[c] = x; x += colW[c] + G; }
    const tops = new Array(rows); let y = M;
    for (let r = 0; r < rows; r++) { tops[r] = y; y += rowH[r] + G; }
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ r, c, x: lefts[c], y: tops[r], w: colW[c], h: rowH[r] });
    return { cells, colW, rowH, outerMargin: M, gutter: G };
  }

  function rotatedDims(w, h, deg) {
    const d = ((deg % 360) + 360) % 360;
    return (d === 90 || d === 270) ? { w: h, h: w } : { w, h };
  }

  function templateRects({ Cw, Ch, cells, outerMargin = 0, gutter = 0 }) {
    if (!Array.isArray(cells) || !cells.length) throw new RangeError('template: cells required');
    const M = outerMargin, half = gutter / 2, eps = 1e-4;
    const aw = Cw - 2 * M, ah = Ch - 2 * M;
    if (aw < cells.length || ah < 1) throw new RangeError('template: area too small');
    return cells.map((c) => {
      const hasL = c.x > eps, hasT = c.y > eps;
      const hasR = c.x + c.w < 1 - eps, hasB = c.y + c.h < 1 - eps;
      const x0 = M + c.x * aw + (hasL ? half : 0);
      const y0 = M + c.y * ah + (hasT ? half : 0);
      const x1 = M + (c.x + c.w) * aw - (hasR ? half : 0);
      const y1 = M + (c.y + c.h) * ah - (hasB ? half : 0);
      const x = Math.round(x0), y = Math.round(y0);
      return { x, y, w: Math.max(1, Math.round(x1) - x), h: Math.max(1, Math.round(y1) - y) };
    });
  }

  return {
    clamp, splitInteger, RATIO_PRESETS, parseRatio, canvasDimsForRatio,
    computeContainRect, computeCoverRect, computeFillRect, computeFrameLayout,
    maxAspectBox, clampCropBox, computeCropBoxLocked, cropZoomAboutPoint,
    computeCarouselComposite, computeCarouselBoundaries, carouselTiles, carouselFilenames,
    computeCollageLayout, templateRects, rotatedDims,
  };
})();
