import { collageMode } from './collageMode.js';
import { compositor } from './compositor.js';
import { cropDebug } from './cropDebug.js';
import { exporter } from './exporter.js';
import { geometryCore } from './geometryCore.js';
import { postModel } from './postModel.js';
import { renderer } from './renderer.js';
import { sessionStore } from './sessionStore.js';
import { state } from './state.js';
import { STRINGS } from './strings.js';
import { ui } from './ui.js';
import { undo } from './undo.js';

export const postPreview = (function () {
  const backdrop = document.getElementById("postModal");
  const strip = document.getElementById("postStrip");
  const sub = document.getElementById("postSub");
  let slides = [];

  // Render one slide to a real composite thumbnail (reuses compositor).
  function renderThumb(slide, targetH) {
    const src = state.sources.find((s) => s.id === slide.srcId);
    if (!src) return null;
    const eff = renderer.effective(src);
    if (slide.kind === "collage") {
      const d = collageMode.collageDims(src, 1000);
      const H = targetH, W = Math.max(1, Math.round(H * (d.W / d.H)));
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      collageMode.compositeInto(cv, src, W, H);
      return cv;
    }
    if (slide.kind === "carousel") {
      const c = src.carousel || state.carousel;
      const r = geometryCore.parseRatio(c.tileRatio, eff.w, eff.h);
      const H = targetH, W = Math.max(1, Math.round(H * (r.w / r.h)));
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      compositor.coverDraw(cv.getContext("2d"), eff.bitmap, eff.w, eff.h, W, H, 1);
      return cv;
    }
    const f = src.frame || state.frame;
    if (src._bakedRegion) cropDebug.exportRegion(src, src._bakedRegion, "thumb");
    const r = compositor.frameRatio(f, eff.w, eff.h);
    const H = targetH, W = Math.max(1, Math.round(H * (r.w / r.h)));
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    compositor.composeFrame(cv.getContext("2d"), eff.bitmap, eff.w, eff.h, W, H, f);
    return cv;
  }

  function summary() {
    const n = slides.length, imgs = postModel.totalOutputs(slides);
    if (!n) return "";
    const sW = n === 1 ? STRINGS.postSlide1 : STRINGS.postSlides;
    const iW = imgs === 1 ? STRINGS.postImage1 : STRINGS.postImages;
    return "<b>" + n + "</b> " + sW + " \u00b7 <b>" + imgs + "</b> " + iW + " \u00b7 " + STRINGS.postReorderHint;
  }

  function render() {
    slides = postModel.deriveFrameSlides(state.sources);
    strip.innerHTML = "";
    const actions = document.getElementById("postActions");
    if (!slides.length) {
      sub.innerHTML = "";
      if (actions) actions.style.display = "none";
      const e = document.createElement("div"); e.className = "post-empty"; e.textContent = STRINGS.postEmpty;
      strip.appendChild(e); return;
    }
    if (actions) actions.style.display = "";
    sub.innerHTML = summary();
    slides.forEach((sl, i) => {
      const card = document.createElement("div");
      card.className = "post-card"; card.dataset.idx = i;
      const cv = renderThumb(sl, 200); if (cv) card.appendChild(cv);
      const no = document.createElement("div"); no.className = "pc-no";
      no.textContent = postModel.positionLabel(slides, i); card.appendChild(no);
      const kind = document.createElement("div"); kind.className = "pc-kind";
      kind.textContent = (STRINGS.modes && STRINGS.modes[sl.kind]) || sl.kind; card.appendChild(kind);
      const h = document.createElement("div"); h.className = "pc-handle";
      h.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
      h.addEventListener("pointerdown", (ev) => startDrag(ev, i, card));
      card.appendChild(h);
      strip.appendChild(card);
    });
  }

  // ---- drag reorder (handle-initiated; window listeners so it never drops the
  // pointer; a caret marks the drop slot; commit on release) ----
  let drag = null;
  function startDrag(ev, idx, card) {
    ev.preventDefault(); ev.stopPropagation();
    const step = card.getBoundingClientRect().width + 12; // card width + strip gap
    drag = { idx, card, startX: ev.clientX, target: idx, step };
    card.classList.add("dragging");
    window.addEventListener("pointermove", onDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }
  function onDrag(ev) {
    if (!drag) return;
    const dx = ev.clientX - drag.startX;
    drag.card.style.transform = "translateX(" + dx + "px)";
    let t = drag.idx + Math.round(dx / drag.step);
    t = Math.max(0, Math.min(slides.length - 1, t));
    if (t !== drag.target) { drag.target = t; placeCaret(t); }
  }
  function placeCaret(t) {
    let caret = strip.querySelector(".pc-caret");
    if (t === drag.idx) { if (caret) caret.remove(); return; }
    if (!caret) { caret = document.createElement("div"); caret.className = "pc-caret"; }
    const cards = [...strip.querySelectorAll(".post-card")];
    if (t > drag.idx) {
      const after = cards[t];
      if (after && after.nextSibling) strip.insertBefore(caret, after.nextSibling);
      else strip.appendChild(caret);
    } else {
      strip.insertBefore(caret, cards[t]);
    }
  }
  function endDrag() {
    if (!drag) return;
    window.removeEventListener("pointermove", onDrag);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    const from = drag.idx, to = drag.target;
    const caret = strip.querySelector(".pc-caret"); if (caret) caret.remove();
    drag.card.classList.remove("dragging"); drag.card.style.transform = "";
    drag = null;
    if (to !== from) commitReorder(from, to);
  }
  function commitReorder(from, to) {
    undo.begin();
    state.sources = postModel.reorder(state.sources, from, to);
    ui.refreshFilmstrip();
    sessionStore.scheduleMeta();
    undo.commit();
    render();
  }

  function open() { render(); backdrop.classList.add("show"); }
  function close() { backdrop.classList.remove("show"); }
  function bind() {
    const b = document.getElementById("btnPost");
    if (b) b.addEventListener("click", open);
    document.getElementById("postClose").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    const ex = document.getElementById("postExport");
    if (ex) ex.addEventListener("click", () => exporter.runPost());
    const sv = document.getElementById("postSave");
    if (sv) sv.addEventListener("click", () => exporter.savePost());
  }
  return { open, close, bind, render, renderThumb };
})();
