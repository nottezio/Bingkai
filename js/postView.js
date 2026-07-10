import { exportModal } from './exportModal.js';
import { postModel } from './postModel.js';
import { postPreview } from './postPreview.js';
import { renderer } from './renderer.js';
import { state } from './state.js';
import { ui } from './ui.js';

export const postView = (function () {
  let selectedId = null;

  function slidesList() { return postModel.deriveFrameSlides(state.sources); }

  function renderOverview() {
    const strip = document.getElementById("poStrip");
    if (!strip) return;
    const slides = slidesList();
    strip.innerHTML = "";
    // Render cards at device pixel density so they're crisp (not upscaled/blurry).
    const H = Math.round(Math.min(1280, 560 * Math.max(2, Math.min(3, window.devicePixelRatio || 2))));
    slides.forEach((sl, i) => {
      const card = document.createElement("div");
      card.className = "po-card" + (sl.srcId === selectedId ? " selected" : "");
      card.dataset.id = sl.srcId;
      let cv = null;
      try { cv = postPreview.renderThumb(sl, H); } catch (_) {}
      if (cv) card.appendChild(cv);
      const num = document.createElement("div");
      num.className = "po-num"; num.textContent = String(i + 1);
      card.appendChild(num);
      if (sl.kind === "collage" || sl.kind === "carousel") {
        const k = document.createElement("div");
        k.className = "po-kind";
        k.textContent = sl.kind === "carousel" ? ("Carousel \u00d7" + postModel.slideOutputCount(sl)) : "Collage";
        card.appendChild(k);
      }
      strip.appendChild(card);
    });
    const add = document.createElement("div");
    add.className = "po-add"; add.textContent = "+";
    add.addEventListener("click", () => ui.openPicker());
    strip.appendChild(add);
    const total = postModel.totalOutputs(slides);
    const right = document.getElementById("poHeadRight");
    if (right) right.textContent = slides.length + (slides.length === 1 ? " slide" : " slides") + " \u00b7 " + total + " image" + (total === 1 ? "" : "s");
    // Set --po-h from the strip's REAL height (getBoundingClientRect accounts for
    // the mobile browser's URL bar; 100vh would overshoot). Cards/add-tile read
    // this so previews fill the actual visible area, not a phantom taller one.
    requestAnimationFrame(() => sizeStrip());
  }

  function sizeStrip() {
    const strip = document.getElementById("poStrip");
    if (!strip) return;
    // subtract the strip's own vertical padding so the card doesn't overflow it
    const cs = getComputedStyle(strip);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    // The slide-actions bar is position:absolute and overlays the bottom of the
    // strip; subtract its height so the preview centres in the VISIBLE area
    // (was overflowing under the bar with empty space at the top). The 0.92
    // factor leaves symmetric breathing room, matching the reference apps.
    const sa = document.getElementById("slideActions");
    const saH = (sa && sa.classList.contains("show")) ? sa.getBoundingClientRect().height : 0;
    const avail = strip.clientHeight - padY - saH;
    const h = Math.max(80, Math.round(avail * 0.92));
    strip.style.setProperty("--po-h", h + "px");
  }

  async function selectCard(id) {
    selectedId = id;
    await ui.setActive(id);
    document.getElementById("slideActions").classList.add("show");
    renderOverview();
    const el = document.querySelector('#poStrip .po-card[data-id="' + id + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function enterEdit(mode) {
    if (!selectedId) return;
    state.view = "edit";
    document.body.classList.remove("sheets-collapsed"); // expand the tool sheet
    ui.setMode(mode); // sets kind (frame/collage/carousel), shows that sheet, draws the slide
    sync();
  }

  async function exitEdit() {
    state.view = "overview";
    // WYSIWYG guarantee: ensure the active slide's crop is baked before the
    // overview renders, so the card can never show a stale croppedBitmap.
    try { if (renderer.bakeCropActive) await renderer.bakeCropActive(); } catch (_) {}
    sync();
  }

  function doDelete() {
    if (!selectedId) return;
    const id = selectedId; selectedId = null;
    ui.removeSource(id);
    sync();
  }

  async function doDup() {
    if (!selectedId) return;
    await ui.duplicateSlide(selectedId);
    selectedId = state.activeId;
    sync();
  }
  function doRevert() {
    if (!selectedId) return;
    ui.revertSlide(selectedId);
    sync();
  }

  function sync() {
    if (!state.view) state.view = "overview";
    const has = state.sources.length > 0;
    const editing = state.view === "edit";
    const ov = has && !editing;
    if (selectedId && !state.sources.some((s) => s.id === selectedId)) selectedId = null;
    document.getElementById("postOverview").classList.toggle("show", ov);
    document.getElementById("dock").classList.toggle("hidden", !(has && editing));
    document.getElementById("toolbar").classList.toggle("hidden", !(has && editing));
    document.getElementById("sheetHandle").classList.toggle("hidden", !(has && editing));
    document.getElementById("btnDone").classList.toggle("show", has && editing);
    document.getElementById("btnExportPost").classList.toggle("show", ov);
    // Declutter the header: reorder + history are overview concerns
    document.getElementById("btnPost").style.display = editing ? "none" : "";
    document.getElementById("btnHistory").style.display = editing ? "none" : "";
    document.getElementById("slideActions").classList.toggle("show", ov && !!selectedId);
    // #6: revert only makes sense for an applied collage/carousel.
    const selKind = selectedId ? (state.sources.find((s) => s.id === selectedId) || {}).kind : null;
    const rv = document.getElementById("saRevert");
    if (rv) rv.style.display = (selKind === "collage" || selKind === "carousel") ? "" : "none";
    // #5: overview shows all mode tabs again (edit view re-hides via setMode).
    if (ov) document.querySelectorAll(".mode.mode-hidden").forEach((b) => b.classList.remove("mode-hidden"));
    if (ov) renderOverview();
  }

  function bind() {
    document.getElementById("slideActions").addEventListener("click", (e) => {
      const b = e.target.closest(".sa-btn"); if (!b) return;
      const act = b.dataset.act;
      if (act === "crop" || act === "frame" || act === "collage" || act === "carousel") enterEdit(act);
      else if (act === "delete") doDelete();
      else if (act === "dup") doDup();
      else if (act === "revert") doRevert();
    });
    document.getElementById("btnDone").addEventListener("click", exitEdit);
    const ep = document.getElementById("btnExportPost");
    if (ep) ep.addEventListener("click", () => exportModal.open());
    document.getElementById("poStrip").addEventListener("click", (e) => {
      const card = e.target.closest(".po-card");
      if (card) selectCard(card.dataset.id);
    });
    // The mobile URL bar shows/hides on scroll, changing the visible height;
    // re-measure so previews always fill the actual available space.
    let rt = null;
    const reflow = () => { clearTimeout(rt); rt = setTimeout(sizeStrip, 100); };
    window.addEventListener("resize", reflow);
    window.addEventListener("orientationchange", reflow);
  }

  return { bind, sync, renderOverview, exitEdit };
})();
