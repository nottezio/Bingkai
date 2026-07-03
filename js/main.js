import { carouselMode } from './carouselMode.js';
import { collageMode } from './collageMode.js';
import { compositor } from './compositor.js';
import { CONFIG } from './config.js';
import { cropMode } from './cropMode.js';
import { exportModal } from './exportModal.js';
import { exporter } from './exporter.js';
import { geometryCore } from './geometryCore.js';
import { importer } from './importer.js';
import { layoutPicker } from './layoutPicker.js';
import { persistence } from './persistence.js';
import { postModel } from './postModel.js';
import { postPreview } from './postPreview.js';
import { postView } from './postView.js';
import { pwa } from './pwa.js';
import { renderer } from './renderer.js';
import { sessionStore } from './sessionStore.js';
import { state } from './state.js';
import { ui } from './ui.js';
import { undo } from './undo.js';

function hardenRanges() {
  const HIT = 28; // px hit radius around the thumb centre
  const scrollParent = (el) => {
    let n = el.parentElement;
    while (n) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 2) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };
  document.querySelectorAll('input[type="range"]').forEach((r) => {
    if (r.dataset.hardened) return;
    r.dataset.hardened = "1";
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;";
    r.parentNode.insertBefore(wrap, r);
    wrap.appendChild(r);
    r.style.pointerEvents = "none"; // native range never processes touches now
    const ov = document.createElement("div");
    ov.style.cssText = "position:absolute;left:0;right:0;top:-10px;bottom:-10px;touch-action:none;z-index:2;";
    wrap.appendChild(ov);

    const nums = () => ({ min: parseFloat(r.min) || 0, max: parseFloat(r.max || "100"), step: parseFloat(r.step || "1") || 1 });
    const thumbX = () => {
      const rect = r.getBoundingClientRect(); const { min, max } = nums();
      const frac = max > min ? (parseFloat(r.value) - min) / (max - min) : 0;
      return rect.left + HIT / 2 + frac * (rect.width - HIT);
    };
    const setFromX = (clientX) => {
      const rect = r.getBoundingClientRect(); if (!rect.width) return;
      const { min, max, step } = nums();
      let frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      let v = Math.round((min + frac * (max - min)) / step) * step;
      v = Math.max(min, Math.min(max, v));
      if (String(v) !== r.value) { r.value = String(v); r.dispatchEvent(new Event("input", { bubbles: true })); }
    };

    let onBall = false, sy = 0, scroller = null, active = false;
    ov.addEventListener("pointerdown", (e) => {
      active = true; sy = e.clientY; scroller = scrollParent(wrap);
      onBall = Math.abs(e.clientX - thumbX()) <= HIT;
      try { ov.setPointerCapture(e.pointerId); } catch (_) {}
      if (onBall) setFromX(e.clientX);
    });
    ov.addEventListener("pointermove", (e) => {
      if (!active) return;
      if (onBall) setFromX(e.clientX);
      else if (scroller) { scroller.scrollTop -= (e.clientY - sy); sy = e.clientY; }
    });
    const end = () => { active = false; onBall = false; };
    ov.addEventListener("pointerup", end);
    ov.addEventListener("pointercancel", end);
  });
}

async function boot() {
  persistence.loadSettings();   // restore last-used global settings before wiring UI
  let savedLang = "en";
  try { savedLang = localStorage.getItem("bingkai-lang") || "en"; } catch (_) {}
  ui.applyLang(savedLang);      // sets STRINGS + applies all UI text (default English)
  ui.bind();
  postPreview.bind();
  postView.bind();
  exportModal.bind();
  hardenRanges();
  layoutPicker.bind();
  ui.syncFrameControlsFromState();
  ui.renderPresets();
  pwa.installManifest();
  pwa.wireInstall();
  pwa.registerSW();

  // Restore the previous working session (photos + crops + edits), if any.
  let restored = false;
  try { restored = await sessionStore.restore(); } catch (_) {}
  if (restored) {
    await renderer.useActive();
    ui.refreshFilmstrip();
    ui.refreshEmpty();
    ui.setMode(state.mode || "frame");
    ui.updateExportNote();
  } else {
    ui.setMode("frame");
    ui.refreshEmpty();
    renderer.clear();
  }
}
document.addEventListener("DOMContentLoaded", boot);

// Expose a tiny hook so Playwright can drive imports without a real file dialog.
window.__app = { state, importer, renderer, ui, exporter, compositor, cropMode, collageMode, carouselMode, persistence, sessionStore, undo, geometryCore, CONFIG, postModel, postPreview, layoutPicker };
