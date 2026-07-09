/* Bingkai — crop WYSIWYG diagnostic (TEMPORARY).
 *
 * v2 rationale (why the previous version never caught the real bug):
 *   The old check compared the box the PREVIEW computed vs the box the BAKE
 *   computed. BOTH are derived from the same src.crop via the same pure
 *   computeCropBoxLocked(). So if cx/cy is ever corrupted to a wrong-but-
 *   consistent value, both sides read the SAME wrong value and the check logs
 *   Δ(0,0,0,0) — green — while the export is wrong. It was structurally blind to
 *   the "right size, wrong region" failure. It also never called render() from
 *   previewBox(), so the "last preview box" readout was frozen one bake behind
 *   (the phantom [0,0 WxH] that derailed every debugging session).
 *
 * v2 measures the axis that actually matters — WYSIWYG:
 *   previewBox()  = the region the user LAST SAW under the crop frame.
 *   exportRegion()= the region actually written to the exported/baked image,
 *                   measured from the bake's captured sub-rect (NOT re-derived
 *                   from src.crop). If these disagree, the export ≠ what the user
 *                   positioned => WYSIWYG-BREAK, logged with the export path name.
 *   Sig-gated bakeCommit stops the ratio-change false positive: a bake is only
 *   compared to a preview recorded for the SAME crop signature.
 *
 * Activation: ?debug=crop. REMOVAL: delete this file + its import in index.html
 * + the cropDebug.* call sites (grep cropDebug).
 */
'use strict';

export const cropDebug = (function () {
  const ON = (() => {
    try { return new URLSearchParams(location.search).get("debug") === "crop"; }
    catch (_) { return false; }
  })();

  const log = [];
  const MAX = 40;
  let rotationsInFlight = 0;
  let lastPreview = null;   // {id,sx,sy,sw,sh,w,h,sig,t}
  let panel = null;

  function push(kind, data) {
    if (!ON) return;
    const e = Object.assign({ kind, t: Math.round(performance.now()) }, data);
    log.push(e);
    if (log.length > MAX) log.shift();
    render();
  }

  function regionOf(box, w, h, sig) {
    return {
      sx: Math.round(box.x), sy: Math.round(box.y),
      sw: Math.round(box.w), sh: Math.round(box.h),
      w, h, sig: sig == null ? null : sig,
    };
  }

  // --- hooks (all no-op when OFF) ---------------------------------------------

  // The preview drew this crop region for src (what the user is looking at).
  function bmDims(src) {
    const b = src && src.bitmap;
    return b ? { bmW: b.width, bmH: b.height } : { bmW: null, bmH: null };
  }
  // src.w/src.h define the coordinate space the crop box lives in. src.bitmap is
  // the raster the preview draws AND the bake samples. If they disagree, the SAME
  // box maps to DIFFERENT pixels in preview vs export — same numbers, wrong area.
  function spaceMismatch(src) {
    const { bmW, bmH } = bmDims(src);
    return bmW != null && (bmW !== src.w || bmH !== src.h);
  }

  function previewBox(src, box, sig) {
    if (!ON || !src || !box) return;
    const { bmW, bmH } = bmDims(src);
    lastPreview = Object.assign({ id: src.id, t: Math.round(performance.now()), bmW, bmH, spaceBad: spaceMismatch(src) },
      regionOf(box, src.w, src.h, sig));
    if (lastPreview.spaceBad) push("space", { where: "preview", w: src.w, h: src.h, bmW, bmH, bad: true });
    else render();
  }

  function rotationStart() { if (ON) rotationsInFlight++; }
  function rotationEnd() { if (ON) rotationsInFlight = Math.max(0, rotationsInFlight - 1); }

  // A bake committed. Only a REAL divergence is one where the preview and the
  // bake share the same crop signature yet disagree on the box. Different sig =>
  // the preview simply hasn't redrawn for this state yet (e.g. applyChange bakes
  // before it draws) — that is not a desync, so we don't flag it.
  function bakeCommit(src, box, capturedW, capturedH, sig) {
    if (!ON || !src) return;
    const bakeBox = regionOf(box, capturedW, capturedH, sig);
    const { bmW, bmH } = bmDims(src);
    const spaceBad = (bmW != null && (bmW !== capturedW || bmH !== capturedH));
    const dimsChanged = (src.w !== capturedW || src.h !== capturedH);
    let boxMismatch = false, deltas = null, comparable = false;
    if (lastPreview && lastPreview.id === src.id && lastPreview.sig === sig) {
      comparable = true;
      const dx = Math.abs(lastPreview.sx - bakeBox.sx);
      const dy = Math.abs(lastPreview.sy - bakeBox.sy);
      const dw = Math.abs(lastPreview.sw - bakeBox.sw);
      const dh = Math.abs(lastPreview.sh - bakeBox.sh);
      const dimsAgree = (lastPreview.w === bakeBox.w && lastPreview.h === bakeBox.h);
      boxMismatch = !dimsAgree || dx > 2 || dy > 2 || dw > 2 || dh > 2;
      deltas = { dx, dy, dw, dh };
    }
    push("bake", { bakeBox, rot: rotationsInFlight, dimsChanged, boxMismatch, comparable, deltas,
      bmW, bmH, spaceBad, bad: dimsChanged || boxMismatch || spaceBad });
  }

  // The export actually drew THIS source region into the output. `path` names
  // the export route (post/batch/inCrop). This is the (b) detector: compare the
  // exported region to what the user last saw for this source.
  function exportRegion(src, region, path) {
    if (!ON || !src || !region) return;
    const r = { sx: region.sx, sy: region.sy, sw: region.sw, sh: region.sh, w: region.w, h: region.h };
    let wysiwygBreak = false, deltas = null, comparable = false;
    if (lastPreview && lastPreview.id === src.id) {
      comparable = true;
      const dx = Math.abs(lastPreview.sx - r.sx);
      const dy = Math.abs(lastPreview.sy - r.sy);
      const dw = Math.abs(lastPreview.sw - r.sw);
      const dh = Math.abs(lastPreview.sh - r.sh);
      const dimsAgree = (lastPreview.w === r.w && lastPreview.h === r.h);
      // tol 2px on position/size; dims must match exactly (rotation would change them)
      wysiwygBreak = !dimsAgree || dx > 2 || dy > 2 || dw > 2 || dh > 2;
      deltas = { dx, dy, dw, dh };
    }
    push("export", { path: path || "?", region: r, wysiwygBreak, comparable, deltas, bad: wysiwygBreak });
  }

  // --- readout ----------------------------------------------------------------

  function ensurePanel() {
    if (panel || !ON) return;
    panel = document.createElement("div");
    panel.id = "cropDebugPanel";
    panel.style.cssText = [
      "position:fixed", "left:0", "right:0", "top:76px", "z-index:9999",
      "max-height:34vh", "overflow:auto", "background:rgba(0,0,0,0.92)", "color:#0F0",
      "font:11px/1.35 'Courier New',monospace", "padding:6px 8px",
      "border-top:2px solid #0F0", "border-bottom:2px solid #0F0",
      "white-space:pre-wrap", "pointer-events:auto",
    ].join(";");
    document.body.appendChild(panel);
  }

  function fmtBox(b) { return b ? `[${b.sx},${b.sy} ${b.sw}x${b.sh} @${b.w}x${b.h}]` : "—"; }

  function render() {
    if (!ON) return;
    ensurePanel();
    const rows = log.slice(-14).map((e) => {
      if (e.kind === "bake") {
        const d = e.comparable ? ` Δ(${e.deltas.dx},${e.deltas.dy},${e.deltas.dw},${e.deltas.dh})` : " (sig≠preview — skipped)";
        const extras = [e.dimsChanged ? "DIMS-CHANGED" : "", e.boxMismatch ? "BOX-MISMATCH" : "",
          e.rot ? `rot:${e.rot}` : ""].filter(Boolean).join(" ");
        const sp = e.spaceBad ? `  bitmap ${e.bmW}x${e.bmH} <<< SPACE-MISMATCH` : "";
        return `${e.t}  bake ${fmtBox(e.bakeBox)}${d} ${extras}${sp}${e.bad && !e.spaceBad ? "  <<< DESYNC" : ""}`;
      }
      if (e.kind === "space") {
        return `${e.t}  SPACE-MISMATCH(${e.where}) box-space ${e.w}x${e.h} vs bitmap ${e.bmW}x${e.bmH}  <<< WRONG COORDINATE SPACE`;
      }
      if (e.kind === "export") {
        const d = e.comparable ? ` Δ(${e.deltas.dx},${e.deltas.dy},${e.deltas.dw},${e.deltas.dh})` : " (no preview for src)";
        return `${e.t}  EXPORT(${e.path}) ${fmtBox(e.region)}${d}${e.wysiwygBreak ? "  <<< WYSIWYG-BREAK" : ""}`;
      }
      return `${e.t}  ${e.kind}`;
    });
    const anyBad = log.some((e) => e.bad);
    panel.innerHTML =
      `CROP DEBUG v2${anyBad ? "  — MISMATCH DETECTED (screenshot this)" : "  — watching…"}\n` +
      `last preview: ${fmtBox(lastPreview)}\n` +
      "\u2500".repeat(40) + "\n" + rows.join("\n");
    panel.style.borderTopColor = anyBad ? "#F00" : "#0F0";
    panel.style.color = anyBad ? "#F88" : "#0F0";
  }

  return { on: ON, previewBox, bakeCommit, exportRegion, rotationStart, rotationEnd };
})();
