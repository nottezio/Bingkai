import { state } from './state.js';

export const persistence = (function () {
  const SETTINGS = "bingkai.settings.v1";
  const PRESETS = "bingkai.presets.v1";
  function safeGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }

  function snapshot() {
    const f = state.frame, o = state.exportOpt, co = state.collage, c = state.carousel;
    return {
      frame: { ratio: f.ratio, flip: !!f.flip, marginPct: f.marginPct, frameColor: f.frameColor, bg: f.bg, blurStrength: f.blurStrength },
      exportOpt: { ig: o.ig, quality: o.quality, format: o.format },
      collage: { rows: co.rows, cols: co.cols, ratio: co.ratio, gutterPct: co.gutterPct, marginPct: co.marginPct, gutterColor: co.gutterColor },
      carousel: { n: c.n, tileRatio: c.tileRatio, fill: c.fill },
      exportName: { prefix: state.exportName.prefix, mode: state.exportName.mode },
    };
  }
  function applySnapshot(s) {
    if (!s) return;
    Object.assign(state.frame, s.frame || {});
    // Migration: sessions saved before the enable toggle have no `enabled` field.
    // Preserve intent — if they'd configured a real frame, keep it on.
    if (s.frame && s.frame.enabled === undefined) {
      state.frame.enabled = (s.frame.ratio && s.frame.ratio !== "original") || (+s.frame.marginPct || 0) > 0;
    }
    Object.assign(state.exportOpt, s.exportOpt || {});
    Object.assign(state.collage, s.collage || {});
    Object.assign(state.carousel, s.carousel || {});
    if (s.exportName) Object.assign(state.exportName, s.exportName);
  }

  let saveT = null;
  function scheduleSave() {
    clearTimeout(saveT);
    saveT = setTimeout(() => safeSet(SETTINGS, JSON.stringify(snapshot())), 400);
  }
  function loadSettings() {
    const r = safeGet(SETTINGS);
    if (r) { try { applySnapshot(JSON.parse(r)); } catch (_) {} }
  }

  function listPresets() {
    const r = safeGet(PRESETS);
    if (!r) return [];
    try { return JSON.parse(r) || []; } catch (_) { return []; }
  }
  function savePreset(name) {
    const ps = listPresets(), snap = snapshot();
    const entry = { name, frame: snap.frame, exportOpt: snap.exportOpt };
    const i = ps.findIndex((p) => p.name === name);
    if (i >= 0) ps[i] = entry; else ps.push(entry);
    safeSet(PRESETS, JSON.stringify(ps));
    return ps;
  }
  function deletePreset(name) {
    const ps = listPresets().filter((p) => p.name !== name);
    safeSet(PRESETS, JSON.stringify(ps));
    return ps;
  }
  function applyPreset(name) {
    const p = listPresets().find((x) => x.name === name);
    if (!p) return false;
    Object.assign(state.frame, p.frame || {});
    if (p.frame && p.frame.enabled === undefined) {
      state.frame.enabled = (p.frame.ratio && p.frame.ratio !== "original") || (+p.frame.marginPct || 0) > 0;
    }
    Object.assign(state.exportOpt, p.exportOpt || {});
    return true;
  }

  return { safeGet, safeSet, scheduleSave, loadSettings, snapshot, listPresets, savePreset, deletePreset, applyPreset };
})();
