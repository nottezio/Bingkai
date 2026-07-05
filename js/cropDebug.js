/* Bingkai — crop desync diagnostic (TEMPORARY).
 *
 * Purpose: the "crop shows a different area than the box, randomly" bug cannot
 * be reproduced in the headless test sandbox (its createImageBitmap timing is
 * too deterministic to expose the async interleave). This module instruments
 * the REAL app so that, on the device where the bug actually occurs, we capture
 * the exact numbers: the crop box the PREVIEW drew vs. the box the BAKE used,
 * plus whether a rotation was in flight.
 *
 * Activation: add ?debug=crop to the URL (e.g. nottezio.github.io/Bingkai/?debug=crop).
 * When off (normal use) this module does nothing measurable — all hooks no-op.
 *
 * REMOVAL: delete this file, its <script>/import in index.html, and the three
 * `cropDebug.*` call sites in renderer.js / importer.js / cropMode.js. Grep
 * `cropDebug` to find them all.
 */
'use strict';

export const cropDebug = (function () {
  const ON = (() => {
    try { return new URLSearchParams(location.search).get("debug") === "crop"; }
    catch (_) { return false; }
  })();

  // Ring buffer of recent events so a desync's lead-up is visible, not just the
  // final frame.
  const log = [];
  const MAX = 40;
  let rotationsInFlight = 0;
  let lastPreviewBox = null;   // {sx,sy,sw,sh,w,h,ratio,t}
  let panel = null;

  function push(kind, data) {
    if (!ON) return;
    const e = Object.assign({ kind, t: Math.round(performance.now()) }, data);
    log.push(e);
    if (log.length > MAX) log.shift();
    render();
  }

  // --- hooks called from the app (all no-op when OFF) --------------------------

  // Preview drew a crop box for this source at these dims.
  function previewBox(src, box) {
    if (!ON || !src || !box) return;
    lastPreviewBox = {
      sx: Math.round(box.x), sy: Math.round(box.y),
      sw: Math.round(box.w), sh: Math.round(box.h),
      w: src.w, h: src.h, t: Math.round(performance.now()),
    };
  }

  function rotationStart() { if (ON) rotationsInFlight++; }
  function rotationEnd() { if (ON) rotationsInFlight = Math.max(0, rotationsInFlight - 1); }

  // Bake committed a crop. Compare against what the preview last drew.
  function bakeCommit(src, box, capturedW, capturedH) {
    if (!ON || !src) return;
    const bakeBox = {
      sx: Math.round(box.x), sy: Math.round(box.y),
      sw: Math.round(box.w), sh: Math.round(box.h),
      w: capturedW, h: capturedH,
    };
    // Desync 1: dims changed between the synchronous capture and the commit
    //   (a rotation swapped src.w/src.h out from under the bake).
    const dimsChanged = (src.w !== capturedW || src.h !== capturedH);
    // Desync 2: the box the bake used disagrees with the box the preview drew,
    //   beyond a rounding tolerance.
    let boxMismatch = false, deltas = null;
    if (lastPreviewBox) {
      const dx = Math.abs(lastPreviewBox.sx - bakeBox.sx);
      const dy = Math.abs(lastPreviewBox.sy - bakeBox.sy);
      const dw = Math.abs(lastPreviewBox.sw - bakeBox.sw);
      const dh = Math.abs(lastPreviewBox.sh - bakeBox.sh);
      const dimsAgree = (lastPreviewBox.w === bakeBox.w && lastPreviewBox.h === bakeBox.h);
      boxMismatch = !dimsAgree || dx > 2 || dy > 2 || dw > 2 || dh > 2;
      deltas = { dx, dy, dw, dh, previewW: lastPreviewBox.w, previewH: lastPreviewBox.h };
    }
    push("bake", {
      bakeBox, rot: rotationsInFlight,
      dimsChanged, boxMismatch, deltas,
      bad: dimsChanged || boxMismatch,
    });
  }

  // --- visible readout ---------------------------------------------------------

  function ensurePanel() {
    if (panel || !ON) return;
    panel = document.createElement("div");
    panel.id = "cropDebugPanel";
    // Docked to the TOP, below the topbar + status marquee (~76px), NOT the
    // bottom — the bottom is where the CROP/FRAME/COLLAGE toolbar lives, and a
    // bottom-pinned panel covered it (untappable on mobile). The top strip below
    // the marquee has no interactive controls, so nothing is obstructed here.
    // Height is capped well short of the toolbar zone.
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
      if (e.kind !== "bake") return `${e.t}  ${e.kind}`;
      const flag = e.bad ? "  <<< DESYNC" : "";
      const d = e.deltas
        ? ` Δ(${e.deltas.dx},${e.deltas.dy},${e.deltas.dw},${e.deltas.dh}) prevDims ${e.deltas.previewW}x${e.deltas.previewH}`
        : " (no preview box yet)";
      const extras = [
        e.dimsChanged ? "DIMS-CHANGED" : "",
        e.boxMismatch ? "BOX-MISMATCH" : "",
        e.rot ? `rot-inflight:${e.rot}` : "",
      ].filter(Boolean).join(" ");
      return `${e.t}  bake ${fmtBox(e.bakeBox)}${d}  ${extras}${flag}`;
    });
    const anyBad = log.some((e) => e.bad);
    panel.innerHTML =
      `CROP DEBUG${anyBad ? "  — DESYNC DETECTED (screenshot this)" : "  — watching…"}\n` +
      `last preview box: ${fmtBox(lastPreviewBox)}\n` +
      "─".repeat(40) + "\n" +
      rows.join("\n");
    panel.style.borderTopColor = anyBad ? "#F00" : "#0F0";
    panel.style.color = anyBad ? "#F88" : "#0F0";
  }

  return { on: ON, previewBox, bakeCommit, rotationStart, rotationEnd };
})();
