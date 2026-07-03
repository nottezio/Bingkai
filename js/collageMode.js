import { templateById } from './collageTemplates.js';
import { geometryCore } from './geometryCore.js';
import { renderer } from './renderer.js';
import { sessionStore } from './sessionStore.js';
import { state } from './state.js';
import { undo } from './undo.js';

export const collageMode = (function () {
  const stage = document.getElementById("stage");
  const pointers = new Map();
  let pinchPrev = 0;
  let gesture = null;     // { idx, snapshot, moved }
  let hoverTarget = -1;   // cell index a swap-drag is hovering
  let onSelect = null;    // optional callback(cellIdx) when the selected cell changes
  let onCellImport = null; // optional callback(cellIdx) to import an image into an empty cell

  function sourceFor(id) { return state.sources.find((s) => s.id === id) || null; }

  function activeTemplate() { return state.collage.template ? templateById(state.collage.template) : null; }
  // Number of cells: template length when a template is active, else rows×cols.
  function cellCount() { const t = activeTemplate(); return t ? t.cells.length : state.collage.rows * state.collage.cols; }

  // Rebuild the cell array to cellCount(), assigning sources in order (cycling),
  // preserving each cell's transform/source where still valid.
  function ensureCells() {
    const co = state.collage, n = cellCount(), srcs = state.sources, cur = co.cells;
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = cur[i];
      const stillValid = prev && prev.srcId && srcs.some((s) => s.id === prev.srcId);
      // Per-slide collage owns an explicit subset: keep valid cells, leave the
      // rest EMPTY (user fills via the cell picker) instead of grabbing pool photos.
      out.push(stillValid ? prev : { srcId: (prev && prev.srcId) || null, zoom: 1, cx: 0.5, cy: 0.5 });
    }
    co.cells = out;
    if (co.selected >= n) co.selected = 0;
  }

  // Re-distribute sources across cells in order (cycling), preserving per-cell
  // transforms by position. Called when the photo set or grid changes so that
  // newly added images actually appear (fixes "collage shows only first image").
  // Phase C4: collage cells are an explicit subset; preserve them (only ensure
  // the cell array matches the current grid). No cyclic pool redistribution.
  function assignSources() {
    ensureCells();
  }

  function ratioNums() {
    return geometryCore.parseRatio(state.collage.ratio, 1, 1); // presets only (no 'original')
  }

  // Integer-exact layout for a given canvas size, with a safe fallback if the
  // gutter/margin would starve the cells.
  function layoutFor(Cw, Ch) {
    const co = state.collage, mn = Math.min(Cw, Ch);
    const m = Math.round((co.marginPct / 100) * mn);
    const g = Math.round((co.gutterPct / 100) * mn);
    const t = activeTemplate();
    if (t) {
      try { return { cells: geometryCore.templateRects({ Cw, Ch, cells: t.cells, outerMargin: m, gutter: g }) }; }
      catch (_) { return { cells: geometryCore.templateRects({ Cw, Ch, cells: t.cells, outerMargin: 0, gutter: 0 }) }; }
    }
    try {
      return geometryCore.computeCollageLayout({ Cw, Ch, rows: co.rows, cols: co.cols, outerMargin: m, gutter: g });
    } catch (_) {
      return geometryCore.computeCollageLayout({ Cw, Ch, rows: co.rows, cols: co.cols, outerMargin: 0, gutter: 0 });
    }
  }

  // Preview placement: output rectangle (collage ratio) centered on the stage.
  function placement(wsW, wsH) {
    const r = ratioNums();
    const pad = 10;
    const shape = geometryCore.canvasDimsForRatio(r.w, r.h, 1000);
    const fit = geometryCore.computeContainRect(shape.Cw, shape.Ch, wsW - 2 * pad, wsH - 2 * pad);
    const vp = { x: pad + fit.x, y: pad + fit.y, w: fit.w, h: fit.h };
    return { vp, shape, scale: vp.w / shape.Cw };
  }

  // CSS cell rects for hit-testing & preview.
  function cellRectsCss(wsW, wsH) {
    const pl = placement(wsW, wsH);
    const lay = layoutFor(pl.shape.Cw, pl.shape.Ch);
    return lay.cells.map((c, i) => ({
      i,
      x: pl.vp.x + c.x * pl.scale, y: pl.vp.y + c.y * pl.scale,
      w: c.w * pl.scale, h: c.h * pl.scale,
    }));
  }

  function hit(rects, px, py) {
    for (const r of rects) if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.i;
    return -1;
  }

  // Draw one cell's covered source region into destRect (current ctx space).
  // Top-right "×" hotspot for clearing a filled cell (editor only). Draw + hit
  // test share this geometry so the target is always where it's shown.
  function removeBadge(r) {
    const rr = Math.max(11, Math.min(r.w, r.h) * 0.12);
    return { cx: r.x + r.w - rr - rr * 0.35, cy: r.y + rr + rr * 0.35, rr };
  }

  function drawCellInto(ctx, cell, destRect, editing) {
    const s = sourceFor(cell.srcId);
    ctx.save();
    ctx.beginPath(); ctx.rect(destRect.x, destRect.y, destRect.w, destRect.h); ctx.clip();
    if (!s) {
      ctx.fillStyle = "#2a2f37"; ctx.fillRect(destRect.x, destRect.y, destRect.w, destRect.h);
      // "+" affordance — driven by an explicit editing flag from drawPreview, NOT a
      // global (state.view was unreliable). Composites/cards pass editing=false.
      if (editing) {
        const cx = destRect.x + destRect.w / 2, cy = destRect.y + destRect.h / 2;
        const rr = Math.min(destRect.w, destRect.h) * 0.13;
        ctx.strokeStyle = "rgba(255,255,255,.5)";
        ctx.lineWidth = Math.max(2, rr * 0.2); ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx - rr, cy); ctx.lineTo(cx + rr, cy);
        ctx.moveTo(cx, cy - rr); ctx.lineTo(cx, cy + rr);
        ctx.stroke();
      }
      ctx.restore(); return;
    }
    {
      const eff = renderer.effective(s);
      const box = geometryCore.computeCropBoxLocked({
        sourceW: eff.w, sourceH: eff.h, ratioW: destRect.w, ratioH: destRect.h,
        zoom: cell.zoom, centerX: cell.cx * eff.w, centerY: cell.cy * eff.h,
      });
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(eff.bitmap, box.x, box.y, box.w, box.h, destRect.x, destRect.y, destRect.w, destRect.h);
      if (editing) {
        const b = removeBadge(destRect);
        ctx.beginPath(); ctx.arc(b.cx, b.cy, b.rr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fill();
        const k = b.rr * 0.45;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, b.rr * 0.18); ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.cx - k, b.cy - k); ctx.lineTo(b.cx + k, b.cy + k);
        ctx.moveTo(b.cx + k, b.cy - k); ctx.lineTo(b.cx - k, b.cy + k);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Re-clamp a cell's centre after pan/zoom so its image always covers the cell.
  function syncCell(cell, destRect) {
    const s = sourceFor(cell.srcId);
    if (!s) return;
    const eff = renderer.effective(s);
    const box = geometryCore.computeCropBoxLocked({
      sourceW: eff.w, sourceH: eff.h, ratioW: destRect.w, ratioH: destRect.h,
      zoom: cell.zoom, centerX: cell.cx * eff.w, centerY: cell.cy * eff.h,
    });
    cell.cx = (box.x + box.w / 2) / eff.w;
    cell.cy = (box.y + box.h / 2) / eff.h;
  }

  // ----- preview -----
  function drawPreview(ctx, wsW, wsH) {
    ensureCells();
    const co = state.collage;
    const pl = placement(wsW, wsH);
    const rects = cellRectsCss(wsW, wsH);
    // gutter color fills the whole output rect (gutters + outer margin show through)
    ctx.fillStyle = co.gutterColor;
    ctx.fillRect(pl.vp.x, pl.vp.y, pl.vp.w, pl.vp.h);
    rects.forEach((r) => drawCellInto(ctx, co.cells[r.i], r, true));
    // selection + swap-target overlays
    rects.forEach((r) => {
      if (r.i === hoverTarget) {
        ctx.strokeStyle = "#4A9EFF"; ctx.setLineDash([6, 4]); ctx.lineWidth = 3;
        ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); ctx.setLineDash([]);
      } else if (r.i === co.selected) {
        ctx.strokeStyle = "#4A9EFF"; ctx.lineWidth = 2.5;
        ctx.strokeRect(r.x + 1.25, r.y + 1.25, r.w - 2.5, r.h - 2.5);
      }
    });
  }

  // ----- export (full-res composite into ctx of size Cw×Ch) -----
  function drawComposite(ctx, Cw, Ch) {
    ensureCells();
    const co = state.collage;
    ctx.fillStyle = co.gutterColor;
    ctx.fillRect(0, 0, Cw, Ch);
    const lay = layoutFor(Cw, Ch);
    lay.cells.forEach((c, i) => drawCellInto(ctx, co.cells[i], { x: c.x, y: c.y, w: c.w, h: c.h }));
  }

  // ----- gestures -----
  function onDown(e) {
    if (state.mode !== "collage" || !state.sources.length) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) undo.begin();
    if (pointers.size === 2) { pinchPrev = pdist(); return; }
    const ws = document.getElementById("workspace");
    const sr = stage.getBoundingClientRect();
    const rects = cellRectsCss(ws.clientWidth, ws.clientHeight);
    const idx = hit(rects, e.clientX - sr.left, e.clientY - sr.top);
    if (idx < 0) return;
    state.collage.selected = idx;
    const cellTapped = state.collage.cells[idx];
    // Filled cell: tap on the "×" badge clears the photo from the cell.
    if (cellTapped && cellTapped.srcId) {
      const b = removeBadge(rects[idx]);
      if (Math.hypot((e.clientX - sr.left) - b.cx, (e.clientY - sr.top) - b.cy) <= b.rr * 1.3) {
        cellTapped.srcId = null; cellTapped.zoom = 1; cellTapped.cx = 0.5; cellTapped.cy = 0.5;
        try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
        pointers.delete(e.pointerId);
        renderer.draw();
        undo.commit();
        if (onSelect) onSelect(idx);
        return;
      }
    }
    if (!cellTapped || !cellTapped.srcId) {
      // Empty cell → import an image straight into it (no stray top-level slide).
      try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
      pointers.delete(e.pointerId);
      undo.commit();
      renderer.draw();
      if (onCellImport) onCellImport(idx);
      return;
    }
    gesture = { idx, moved: 0, snapshot: { ...state.collage.cells[idx] } };
    hoverTarget = -1;
    renderer.draw();
    if (onSelect) onSelect(idx);
  }
  function pdist() { const p = [...pointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  function pmid() { const p = [...pointers.values()]; return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; }

  function onMove(e) {
    if (state.mode !== "collage" || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ws = document.getElementById("workspace");
    const wsW = ws.clientWidth, wsH = ws.clientHeight;
    const sr = stage.getBoundingClientRect();
    const rects = cellRectsCss(wsW, wsH);

    if (pointers.size >= 2) {
      const d = pdist();
      if (pinchPrev > 0 && d > 0) {
        const sel = state.collage.selected, cell = state.collage.cells[sel];
        const rect = rects[sel]; const s = sourceFor(cell.srcId);
        if (rect && s) {
          const eff = renderer.effective(s);
          const mid = pmid();
          const fx = geometryCore.clamp((mid.x - sr.left - rect.x) / rect.w, 0, 1);
          const fy = geometryCore.clamp((mid.y - sr.top - rect.y) / rect.h, 0, 1);
          const z = geometryCore.cropZoomAboutPoint({
            sourceW: eff.w, sourceH: eff.h, ratioW: rect.w, ratioH: rect.h,
            zoom: cell.zoom, centerX: cell.cx * eff.w, centerY: cell.cy * eff.h, factor: d / pinchPrev, fx, fy,
          });
          cell.zoom = z.zoom; cell.cx = z.centerX / eff.w; cell.cy = z.centerY / eff.h;
          syncCell(cell, rect);
        }
      }
      pinchPrev = d;
      hoverTarget = -1;
      renderer.draw();
      return;
    }
    if (!gesture) return;
    gesture.moved += Math.hypot(dx, dy);
    const overIdx = hit(rects, e.clientX - sr.left, e.clientY - sr.top);
    if (gesture.moved > 10 && overIdx >= 0 && overIdx !== gesture.idx) {
      // swap intent: revert any pan, highlight target
      state.collage.cells[gesture.idx] = { ...gesture.snapshot };
      hoverTarget = overIdx;
    } else {
      // pan the active cell
      hoverTarget = -1;
      const cell = state.collage.cells[gesture.idx], rect = rects[gesture.idx], s = sourceFor(cell.srcId);
      if (rect && s) {
        const eff = renderer.effective(s);
        const box = geometryCore.computeCropBoxLocked({
          sourceW: eff.w, sourceH: eff.h, ratioW: rect.w, ratioH: rect.h,
          zoom: cell.zoom, centerX: cell.cx * eff.w, centerY: cell.cy * eff.h,
        });
        cell.cx += (-dx * (box.w / rect.w)) / eff.w;
        cell.cy += (-dy * (box.h / rect.h)) / eff.h;
        syncCell(cell, rect);
      }
    }
    renderer.draw();
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchPrev = 0;
    if (gesture && hoverTarget >= 0 && hoverTarget !== gesture.idx) {
      const cells = state.collage.cells;
      const t = cells[gesture.idx]; cells[gesture.idx] = cells[hoverTarget]; cells[hoverTarget] = t;
      state.collage.selected = hoverTarget;
      if (onSelect) onSelect(hoverTarget);
    }
    hoverTarget = -1; gesture = null;
    if (state.mode === "collage") renderer.draw();
    sessionStore.scheduleMeta();
    if (pointers.size === 0) undo.commit();
  }

  function bind() {
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
  }

  // Apply a grid or template from the visual picker (mirrors chip-click mutations).
  function setLayout(opt) {
    const co = state.collage;
    undo.begin();
    // These two layout modes are mutually exclusive (uniform grid vs. asymmetric
    // template) — clearing the other's fields whenever one is set means no
    // consumer can ever read stale rows/cols for a template (or a stale
    // template id for a grid). Previously only the grid branch cleared
    // `template`; the template branch left rows/cols untouched, so any code
    // trusting state.collage.rows/cols while a template was active (e.g. cell
    // hit-testing) silently computed against the wrong shape.
    if (opt && opt.template) { co.template = opt.template; co.rows = null; co.cols = null; }
    else { co.template = null; co.rows = opt.rows; co.cols = opt.cols; }
    assignSources(); renderer.draw();
    sessionStore.scheduleMeta();
    undo.commit();
  }
  // Assign a specific source into the currently-selected cell (SCRL tap-to-fill).
  function assignToCell(srcId) {
    const co = state.collage; ensureCells();
    const cell = co.cells[co.selected]; if (!cell) return;
    undo.begin();
    cell.srcId = srcId; cell.zoom = 1; cell.cx = 0.5; cell.cy = 0.5;
    renderer.draw();
    sessionStore.scheduleMeta();
    undo.commit();
  }
  function setOnSelect(fn) { onSelect = fn; }
  function setOnCellImport(fn) { onCellImport = fn; }
  function selectedSrcId() { const c = state.collage.cells[state.collage.selected]; return c ? c.srcId : null; }

  // Render a specific collage slide's composite into a canvas by temporarily
  // pointing state.collage at that slide's settings (drawComposite reads it).
  function compositeInto(cv, src, Cw, Ch) {
    const prev = state.collage;
    state.collage = src.collage;
    try { drawComposite(cv.getContext("2d"), Cw, Ch); }
    finally { state.collage = prev; }
  }
  function collageDims(src, wBase) {
    const r = geometryCore.parseRatio((src.collage && src.collage.ratio) || "1:1", 1, 1);
    const W = wBase, H = Math.round(W * (r.h / r.w));
    return { W, H };
  }

  return { bind, ensureCells, assignSources, drawPreview, drawComposite, ratioNums, setLayout, assignToCell, setOnSelect, setOnCellImport, selectedSrcId, compositeInto, collageDims };
})();
