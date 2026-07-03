import { carouselMode } from './carouselMode.js';
import { collageMode } from './collageMode.js';
import { COLLAGE_TEMPLATES } from './collageTemplates.js';
import { compositor } from './compositor.js';
import { cropMode } from './cropMode.js';
import { exporter } from './exporter.js';
import { geometryCore } from './geometryCore.js';
import { historyStore } from './historyStore.js';
import { importer } from './importer.js';
import { layoutPicker } from './layoutPicker.js';
import { persistence } from './persistence.js';
import { postModel } from './postModel.js';
import { postView } from './postView.js';
import { renderer } from './renderer.js';
import { sessionStore } from './sessionStore.js';
import { cloneCarousel, cloneCollage, cloneFrame, state } from './state.js';
import { LANG, setLang, STRINGS } from './strings.js';
import { undo } from './undo.js';

export const ui = (function () {
  const empty = document.getElementById("empty");
  const filmstrip = document.getElementById("filmstrip");
  const picker = document.getElementById("filePicker");
  const busy = document.getElementById("busy");
  const workspace = document.getElementById("workspace");
  let refreshFills = () => {}; // set in bind(); repaints slider fill on programmatic change

  function applyStrings() {
    document.getElementById("appTitle").textContent = STRINGS.appTitle;
    document.getElementById("postTitle").textContent = STRINGS.postTitle;
    { const pe = document.getElementById("postExport"); if (pe) pe.textContent = STRINGS.exportPost;
      const ps = document.getElementById("postSave"); if (ps) ps.textContent = STRINGS.save; }
    document.getElementById("layoutTitle").textContent = STRINGS.layoutTitle;
    document.getElementById("lblChooseLayout").textContent = STRINGS.chooseLayout;
    document.getElementById("lpGridTitle").textContent = STRINGS.lpGrid;
    document.getElementById("lpTplTitle").textContent = STRINGS.lpLayouts;
    document.getElementById("labCellFill").textContent = STRINGS.cellFill;
    document.getElementById("emptyHint").innerHTML = STRINGS.emptyTitle + "<br>" + STRINGS.emptySub;
    document.getElementById("btnImport").textContent = STRINGS.addFirstSlide;
    document.getElementById("dropHint").textContent = STRINGS.dropHint;
    document.getElementById("btnAddTop").setAttribute("aria-label", STRINGS.addPhoto);
    document.getElementById("lblFrame").textContent = STRINGS.modes.frame;
    document.getElementById("lblCrop").textContent = STRINGS.modes.crop;
    document.getElementById("lblCollage").textContent = STRINGS.modes.collage;
    document.getElementById("lblCarousel").textContent = STRINGS.modes.carousel;
    document.getElementById("labRatio").textContent = STRINGS.ratio;
    document.getElementById("chipOriginal").textContent = STRINGS.original;
    document.getElementById("labMargin").textContent = STRINGS.margin;
    document.getElementById("labBg").textContent = STRINGS.background;
    document.getElementById("bgSolid").textContent = STRINGS.bgSolid;
    document.getElementById("bgBlur").textContent = STRINGS.bgBlur;
    document.getElementById("labFrameColor").textContent = STRINGS.frameColor;
    document.getElementById("labExportSize").textContent = STRINGS.exportSize;
    document.getElementById("sizeIG").textContent = STRINGS.sizeIG;
    document.getElementById("sizeHi").textContent = STRINGS.sizeHi;
    document.getElementById("labQuality").textContent = STRINGS.quality;
    document.getElementById("labFormat").textContent = STRINGS.format;
    document.getElementById("fmtJpeg").textContent = STRINGS.fmtJpeg;
    document.getElementById("fmtPng").textContent = STRINGS.fmtPng;
    document.getElementById("btnExport").textContent = STRINGS.exportBtn;
    document.getElementById("labCropRatio").textContent = STRINGS.ratio;
    document.getElementById("cropHint").textContent = STRINGS.cropHint;
    document.getElementById("cropChipOriginal").textContent = STRINGS.original;
    document.getElementById("btnCropReset").textContent = STRINGS.reset;
    document.getElementById("btnCropExport").textContent = STRINGS.exportBtn;
    document.getElementById("cropExportNote").textContent = STRINGS.cropExportNote;
    document.getElementById("labColRatio").textContent = STRINGS.ratio;
    document.getElementById("labGutter").textContent = STRINGS.gutter;
    document.getElementById("labColMargin").textContent = STRINGS.outerMargin;
    document.getElementById("labGutterColor").textContent = STRINGS.gutterColor;
    document.getElementById("collageHint").textContent = STRINGS.collageHint;
    document.getElementById("btnCollageExport").textContent = STRINGS.exportBtn;
    document.getElementById("labTiles").textContent = STRINGS.tiles;
    document.getElementById("labTileRatio").textContent = STRINGS.tileRatio;
    document.getElementById("labFill").textContent = STRINGS.fill;
    document.getElementById("fillCover").textContent = STRINGS.fillCover;
    document.getElementById("fillFit").textContent = STRINGS.fillFit;
    document.getElementById("carouselHint").textContent =
      (state.carousel.adjust === "browse") ? STRINGS.carouselHintBrowse : STRINGS.carouselHintMove;
    document.getElementById("carouselNote").textContent = STRINGS.carouselNote;
    document.getElementById("btnCarouselExport").textContent = STRINGS.exportBtn;
    document.getElementById("tilesMinus").textContent = "\u2212";
    document.getElementById("labBlur").textContent = STRINGS.blurStrength;
    document.getElementById("labPresets").textContent = STRINGS.presets;
    document.getElementById("btnSavePreset").textContent = STRINGS.savePreset;
    document.getElementById("btnInstall").setAttribute("aria-label", STRINGS.install);
    // newer controls (naming, preview, history, rotate, carousel interaction)
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setTxt("btnSave", STRINGS.save); setTxt("btnExportAll", STRINGS.all);
    setTxt("btnCropSave", STRINGS.save); setTxt("btnCollageSave", STRINGS.save);
    setTxt("btnCarouselSave", STRINGS.save); setTxt("btnCarouselPreview", STRINGS.preview);
    setTxt("lblCropRotate", STRINGS.rotate90); setTxt("labTemplate", STRINGS.layout);
    setTxt("labAdjust", STRINGS.interaction); setTxt("adjMove", STRINGS.adjMove); setTxt("adjBrowse", STRINGS.adjBrowse);
    setTxt("settingsTitle", STRINGS.settingsTitle); setTxt("lblNamePrefix", STRINGS.namePrefixLabel);
    setTxt("lblNameMode", STRINGS.numberingLabel); setTxt("nameModeDate", STRINGS.numberDate); setTxt("nameModeSeq", STRINGS.numberSeq);
    setTxt("lblLanguage", STRINGS.language);
    setTxt("historyTitle", STRINGS.historyTitle); setTxt("histEmpty", STRINGS.historyEmpty); setTxt("histClear", STRINGS.clearAll);
    setTxt("previewTitle", STRINGS.previewTitle); setTxt("pvShare", STRINGS.exportBtn); setTxt("pvSave", STRINGS.save);
    const np = document.getElementById("namePrefix"); if (np) np.placeholder = "bingkai";
    document.documentElement.lang = LANG;
    document.title = STRINGS.docTitle;
    updateExportNote();
  }

  function applyLang(lang) {
    setLang(lang);   // strings.js owns the mutation; LANG/STRINGS are live-binding reads here
    try { localStorage.setItem("bingkai-lang", LANG); } catch (_) {}
    applyStrings();
    pressGroup("#langSeg button", "lang", LANG);
  }

  // ----- frame control panel -------------------------------------------------

  // Compose the contextual export note (size profile, format, upscale warning).
  function updateExportNote() {
    const opt = state.exportOpt, f = state.frame, note = document.getElementById("exportNote");
    if (!note) return;
    let txt = opt.ig ? STRINGS.igNote : STRINGS.hiNote;
    if (opt.format === "png") txt += " " + STRINGS.pngNote;
    note.className = "note";
    // Upscale warning: IG target width 1080 but source narrower than the frame inner area.
    const src = renderer.activeSource && renderer.activeSource();
    if (src && opt.ig) {
      const r = geometryCore.parseRatio(f.ratio, src.w, src.h);
      const dims = compositor.exportDims(r.w, r.h, true);
      const innerW = dims.Cw * (1 - 2 * (f.marginPct / 100));
      if (src.w < innerW - 1) { txt = STRINGS.upscaleWarn + " " + txt; note.className = "note warn"; }
    }
    note.textContent = txt;
  }

  function pressGroup(selector, attr, value) {
    document.querySelectorAll(selector).forEach((el) =>
      el.setAttribute("aria-pressed", String(el.dataset[attr] === String(value))));
  }

  function syncFrameRows() {
    // Frame-color row only for solid bg; blur row only for blur bg; quality only for JPEG.
    document.getElementById("frameColorRow").style.display = state.frame.bg === "solid" ? "" : "none";
    document.getElementById("blurRow").style.display = state.frame.bg === "blur" ? "" : "none";
    document.getElementById("qualityRow").style.display = state.exportOpt.format === "jpeg" ? "" : "none";
    // Orientation toggle only for non-square, non-original ratios.
    const f = state.frame;
    const canFlip = f.ratio !== "original" && f.ratio !== "1:1";
    document.getElementById("frameOrientRow").style.display = canFlip ? "" : "none";
    if (canFlip) {
      const r = compositor.frameRatio(f, 1000, 1000); // dims irrelevant for preset ratios
      document.getElementById("frameOrientLabel").textContent = r.w < r.h ? STRINGS.portrait : STRINGS.landscape;
    }
  }

  // Push current state into the frame-sheet controls (after preset/restore).
  function syncFrameControlsFromState() {
    const f = state.frame, o = state.exportOpt;
    pressGroup("#ratioChips .chip", "ratio", f.ratio);
    document.getElementById("marginRange").value = f.marginPct;
    document.getElementById("marginVal").textContent = f.marginPct + "%";
    pressGroup("#bgSeg button", "bg", f.bg);
    document.getElementById("blurRange").value = Math.round(f.blurStrength * 100);
    document.getElementById("blurVal").textContent = Math.round(f.blurStrength * 100) + "%";
    const swatches = document.querySelectorAll("#frameSwatches .sw");
    let matched = false;
    swatches.forEach((s) => {
      const on = s.dataset.color && s.dataset.color.toUpperCase() === f.frameColor.toUpperCase();
      s.setAttribute("aria-pressed", String(!!on)); if (on) matched = true;
    });
    if (!matched) document.getElementById("customSw").setAttribute("aria-pressed", "true");
    pressGroup("#sizeSeg button", "ig", o.ig ? "1" : "0");
    document.getElementById("qualityRange").value = Math.round(o.quality * 100);
    document.getElementById("qualityVal").textContent = Math.round(o.quality * 100);
    pressGroup("#formatSeg button", "fmt", o.format);
    syncFrameRows();
    refreshFills();
  }

  function renderPresets() {
    const wrap = document.getElementById("presetChips");
    wrap.innerHTML = "";
    persistence.listPresets().forEach((p) => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = p.name;
      chip.addEventListener("click", () => {
        if (persistence.applyPreset(p.name)) { syncFrameControlsFromState(); updateExportNote(); renderer.draw(); persistence.scheduleSave(); }
      });
      const x = document.createElement("span");
      x.textContent = " \u00d7"; x.style.opacity = ".6"; x.style.marginLeft = "2px";
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (confirm(STRINGS.deletePreset)) { persistence.deletePreset(p.name); renderPresets(); }
      });
      chip.appendChild(x);
      wrap.appendChild(chip);
    });
  }

  function bindFrameControls() {
    // Ratio chips
    document.querySelectorAll("#ratioChips .chip").forEach((c) =>
      c.addEventListener("click", () => {
        undo.begin();
        state.frame.ratio = c.dataset.ratio;
        state.frame.flip = false; // new ratio starts in its natural orientation
        pressGroup("#ratioChips .chip", "ratio", c.dataset.ratio);
        syncFrameRows();
        renderer.draw(); updateExportNote();
        undo.commit();
      }));
    document.getElementById("btnFrameOrient").addEventListener("click", () => {
      const f = state.frame;
      if (f.ratio === "original" || f.ratio === "1:1") return;
      undo.begin();
      f.flip = !f.flip;
      syncFrameRows();
      renderer.draw(); updateExportNote();
      persistence.scheduleSave();
      undo.commit();
    });
    // Margin
    const mr = document.getElementById("marginRange");
    mr.addEventListener("input", () => {
      state.frame.marginPct = +mr.value;
      document.getElementById("marginVal").textContent = mr.value + "%";
      renderer.draw(); updateExportNote();
    });
    // Background mode
    document.querySelectorAll("#bgSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        state.frame.bg = b.dataset.bg;
        pressGroup("#bgSeg button", "bg", b.dataset.bg);
        syncFrameRows(); renderer.draw();
      }));
    // Frame color swatches
    document.querySelectorAll("#frameSwatches .sw[data-color]").forEach((s) =>
      s.addEventListener("click", () => {
        state.frame.frameColor = s.dataset.color;
        document.querySelectorAll("#frameSwatches .sw").forEach((x) => x.setAttribute("aria-pressed", "false"));
        s.setAttribute("aria-pressed", "true");
        renderer.draw();
      }));
    const cc = document.getElementById("customColor");
    cc.addEventListener("input", () => {
      state.frame.frameColor = cc.value;
      document.querySelectorAll("#frameSwatches .sw").forEach((x) => x.setAttribute("aria-pressed", "false"));
      document.getElementById("customSw").setAttribute("aria-pressed", "true");
      renderer.draw();
    });
    // Export size profile
    document.querySelectorAll("#sizeSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        state.exportOpt.ig = b.dataset.ig === "1";
        pressGroup("#sizeSeg button", "ig", b.dataset.ig);
        updateExportNote();
      }));
    // Quality
    const qr = document.getElementById("qualityRange");
    qr.addEventListener("input", () => {
      state.exportOpt.quality = +qr.value / 100;
      document.getElementById("qualityVal").textContent = qr.value;
    });
    // Format
    document.querySelectorAll("#formatSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        state.exportOpt.format = b.dataset.fmt;
        pressGroup("#formatSeg button", "fmt", b.dataset.fmt);
        syncFrameRows(); updateExportNote();
      }));
    // Export
    document.getElementById("btnUndo").addEventListener("click", () => undo.pop());
    document.getElementById("btnExport").addEventListener("click", () => exporter.run());
    document.getElementById("btnSave").addEventListener("click", () => exporter.save());
    // Blur strength
    const br = document.getElementById("blurRange");
    br.addEventListener("input", () => {
      state.frame.blurStrength = +br.value / 100;
      document.getElementById("blurVal").textContent = br.value + "%";
      renderer.draw();
    });
    // Save preset
    document.getElementById("btnSavePreset").addEventListener("click", () => {
      const name = (prompt(STRINGS.promptName) || "").trim();
      if (!name) return;
      persistence.savePreset(name);
      renderPresets();
      toast(STRINGS.presetSaved);
    });
    renderPresets();
    syncFrameRows();
  }

  function syncCropControls() {
    const src = renderer.activeSource();
    const cr = src && src.crop ? src.crop : null;
    const ratio = cr ? cr.ratio : "original";
    pressGroup("#cropRatioChips .chip", "ratio", ratio);
    const btn = document.getElementById("btnCropOrient");
    const can = cropMode.canFlip();
    btn.style.display = can ? "inline-flex" : "none";
    if (can) {
      const n = cropMode.ratioNums();
      document.getElementById("cropOrientLabel").textContent = n.w < n.h ? STRINGS.portrait : STRINGS.landscape;
    }
  }

  function bindCropControls() {
    document.querySelectorAll("#cropRatioChips .chip").forEach((c) =>
      c.addEventListener("click", () => {
        const cr = cropMode.cur();
        if (!cr) return;
        undo.begin();
        cr.ratio = c.dataset.ratio;
        cr.zoom = 1; cr.cx = 0.5; cr.cy = 0.5; cr.flip = false;
        pressGroup("#cropRatioChips .chip", "ratio", c.dataset.ratio);
        cropMode.applyChange();
        syncCropControls();
        undo.commit();
      }));
    document.getElementById("btnCropOrient").addEventListener("click", () => {
      const cr = cropMode.cur();
      if (!cr || !cropMode.canFlip()) return;
      undo.begin();
      cr.flip = !cr.flip;
      cr.cx = 0.5; cr.cy = 0.5; // re-centre after the aspect swaps
      cropMode.applyChange();
      syncCropControls();
      undo.commit();
    });
    document.getElementById("btnCropRotate").addEventListener("click", async () => {
      undo.begin();
      await cropMode.rotate90();
      syncCropControls();
      undo.commit();
    });
    document.getElementById("btnCropReset").addEventListener("click", () => { undo.begin(); cropMode.reset(); syncCropControls(); undo.commit(); });
    document.getElementById("btnCropExport").addEventListener("click", () => exporter.run());
    document.getElementById("btnCropSave").addEventListener("click", () => exporter.save());
  }

  function syncCollageControls() {
    const co = state.collage;
    document.querySelectorAll("#gridChips .chip").forEach((x) =>
      x.setAttribute("aria-pressed", String(!co.template && +x.dataset.rows === co.rows && +x.dataset.cols === co.cols)));
    document.querySelectorAll("#templateChips .chip").forEach((x) =>
      x.setAttribute("aria-pressed", String(co.template === x.dataset.tpl)));
    pressGroup("#collageRatioChips .chip", "ratio", co.ratio);
  }

  function bindCollageControls() {
    // NOTE: state.collage is repointed per-slide, so every handler must read it
    // FRESH at click time — never capture it in the binder's closure.
    document.querySelectorAll("#gridChips .chip").forEach((c) =>
      c.addEventListener("click", () => {
        const co = state.collage;
        undo.begin();
        co.template = null;
        co.rows = +c.dataset.rows; co.cols = +c.dataset.cols;
        document.querySelectorAll("#gridChips .chip").forEach((x) =>
          x.setAttribute("aria-pressed", String(x === c)));
        document.querySelectorAll("#templateChips .chip").forEach((x) => x.setAttribute("aria-pressed", "false"));
        collageMode.assignSources(); renderer.draw();
        sessionStore.scheduleMeta();
        undo.commit();
      }));
    // Build asymmetric layout templates.
    const tWrap = document.getElementById("templateChips");
    tWrap.innerHTML = "";
    COLLAGE_TEMPLATES.forEach((t) => {
      const b = document.createElement("button");
      b.className = "chip ghost"; b.dataset.tpl = t.id; b.textContent = t.label;
      b.addEventListener("click", () => {
        const co = state.collage;
        undo.begin();
        co.template = t.id;
        document.querySelectorAll("#templateChips .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        document.querySelectorAll("#gridChips .chip").forEach((x) => x.setAttribute("aria-pressed", "false"));
        collageMode.assignSources(); renderer.draw();
        sessionStore.scheduleMeta();
        undo.commit();
      });
      tWrap.appendChild(b);
    });
    document.querySelectorAll("#collageRatioChips .chip").forEach((c) =>
      c.addEventListener("click", () => {
        state.collage.ratio = c.dataset.ratio;
        pressGroup("#collageRatioChips .chip", "ratio", c.dataset.ratio);
        renderer.draw();
      }));
    const gr = document.getElementById("gutterRange");
    gr.addEventListener("input", () => {
      state.collage.gutterPct = +gr.value;
      document.getElementById("gutterVal").textContent = gr.value + "%";
      renderer.draw();
    });
    const cm = document.getElementById("colMarginRange");
    cm.addEventListener("input", () => {
      state.collage.marginPct = +cm.value;
      document.getElementById("colMarginVal").textContent = cm.value + "%";
      renderer.draw();
    });
    document.querySelectorAll("#gutterSwatches .sw[data-color]").forEach((s) =>
      s.addEventListener("click", () => {
        state.collage.gutterColor = s.dataset.color;
        document.querySelectorAll("#gutterSwatches .sw").forEach((x) => x.setAttribute("aria-pressed", "false"));
        s.setAttribute("aria-pressed", "true");
        renderer.draw();
      }));
    const gcc = document.getElementById("gutterCustomColor");
    gcc.addEventListener("input", () => {
      state.collage.gutterColor = gcc.value;
      document.querySelectorAll("#gutterSwatches .sw").forEach((x) => x.setAttribute("aria-pressed", "false"));
      document.getElementById("gutterCustomSw").setAttribute("aria-pressed", "true");
      renderer.draw();
    });
    document.getElementById("btnCollageExport").addEventListener("click", () => exporter.run());
    document.getElementById("btnCollageSave").addEventListener("click", () => exporter.save());
  }

  function bindCarouselControls() {
    // state.carousel is repointed per-slide → read it FRESH in every handler.
    const setTiles = (n) => {
      const c = state.carousel;
      c.n = geometryCore.clamp(n, 2, 10);
      document.getElementById("tilesVal").textContent = String(c.n);
      c.pos = geometryCore.clamp(c.pos, 0, c.n - 1);
      renderer.draw();
    };
    document.getElementById("tilesMinus").addEventListener("click", () => setTiles(state.carousel.n - 1));
    document.getElementById("tilesPlus").addEventListener("click", () => setTiles(state.carousel.n + 1));
    document.querySelectorAll("#tileRatioChips .chip").forEach((b) =>
      b.addEventListener("click", () => {
        state.carousel.tileRatio = b.dataset.ratio;
        pressGroup("#tileRatioChips .chip", "ratio", b.dataset.ratio);
        renderer.draw();
      }));
    document.querySelectorAll("#fillSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        state.carousel.fill = b.dataset.fill;
        pressGroup("#fillSeg button", "fill", b.dataset.fill);
        document.getElementById("adjustSeg").style.display = state.carousel.fill === "cover" ? "" : "none";
        renderer.draw();
      }));
    document.querySelectorAll("#adjustSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        state.carousel.adjust = b.dataset.adj;
        pressGroup("#adjustSeg button", "adj", b.dataset.adj);
        document.getElementById("carouselHint").textContent =
          state.carousel.adjust === "browse" ? STRINGS.carouselHintBrowse : STRINGS.carouselHintMove;
        sessionStore.scheduleMeta();
      }));
    document.getElementById("btnCarouselExport").addEventListener("click", () => carouselMode.exportTiles());
    document.getElementById("btnCarouselSave").addEventListener("click", () => exporter.withDownload(() => carouselMode.exportTiles()));
  }

  function setBusy(on) { busy.classList.toggle("show", !!on); }

  // Minimal non-blocking toast (no dependency).
  let toastEl = null, toastT = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      Object.assign(toastEl.style, {
        position: "fixed", left: "50%", bottom: "calc(var(--toolbar-h) + 18px)",
        transform: "translateX(-50%)", background: "#000", color: "#fff",
        padding: "9px 14px", borderRadius: "10px", fontSize: "13px", maxWidth: "82%",
        textAlign: "center", zIndex: "50", opacity: "0", transition: "opacity .18s",
        pointerEvents: "none",
      });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.style.opacity = "0"; }, 2200);
  }

  function refreshEmpty() {
    const has = state.sources.length > 0;
    empty.classList.toggle("hidden", has);
    document.getElementById("stage").style.display = has ? "block" : "none";
    postView.sync(); // owns dock/toolbar/overview/actions/done visibility per view
  }

  function updateBatchBtn() {
    const el = document.getElementById("btnExportAll");
    if (el) el.style.display = (state.mode === "frame" && state.sources.length > 1) ? "" : "none";
  }

  function refreshFilmstrip() {
    // Filmstrip shows SLIDES in order (photos consumed by a collage are hidden).
    const slides = postModel.deriveFrameSlides(state.sources);
    const has = slides.length > 0;
    filmstrip.classList.toggle("hidden", !has);
    filmstrip.innerHTML = "";
    slides.forEach((sl, i) => {
      const s = state.sources.find((x) => x.id === sl.srcId);
      if (!s) return;
      const t = document.createElement("div");
      t.className = "thumb" + (s.id === state.activeId ? " active" : "");
      const img = document.createElement("img");
      img.src = s.thumbUrl; img.alt = s.name;
      t.appendChild(img);
      const nb = document.createElement("div");
      nb.className = "num-badge"; nb.textContent = String(i + 1);
      t.appendChild(nb);
      if (sl.kind && sl.kind !== "frame") {
        const kb = document.createElement("div");
        kb.className = "kind-badge";
        kb.textContent = sl.kind === "carousel" ? ("\u00d7" + postModel.slideOutputCount(sl)) : "\u25A6";
        t.appendChild(kb);
      }
      if (s.croppedBitmap) {
        const b = document.createElement("div");
        b.className = "crop-badge"; b.title = "Sudah dipotong";
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/></svg>';
        t.appendChild(b);
      }
      const x = document.createElement("div");
      x.className = "x"; x.textContent = "\u00d7";
      x.addEventListener("click", (ev) => { ev.stopPropagation(); removeSource(s.id); });
      t.appendChild(x);
      t.addEventListener("click", () => setActive(s.id));
      filmstrip.appendChild(t);
    });
    const add = document.createElement("div");
    add.className = "thumb add"; add.textContent = "+";
    add.addEventListener("click", openPicker);
    filmstrip.appendChild(add);
    updateSlideContext();
    updateBatchBtn();
  }

  // Show the user exactly which slide (and its type) their edits apply to.
  function updateSlideContext() {
    const el = document.getElementById("slideContext");
    if (!el) return;
    const slides = postModel.deriveFrameSlides(state.sources);
    const idx = slides.findIndex((s) => s.srcId === state.activeId);
    if (idx < 0 || !state.sources.length) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const kind = slides[idx].kind || "frame";
    const pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    document.getElementById("scPos").innerHTML = pencil + STRINGS.slideWord + " <b>" + (idx + 1) + "</b>&thinsp;/&thinsp;" + slides.length;
    document.getElementById("scType").textContent = (STRINGS.modes && STRINGS.modes[kind]) || kind;
  }

  async function setActive(id) {
    if (state.activeId === id) return;
    state.activeId = id;
    await renderer.useActive();
    refreshFilmstrip();
    updateExportNote();
    const a = renderer.activeSource();
    if (a && (state.mode === "frame" || state.mode === "carousel" || state.mode === "collage")) {
      setMode(a.kind || "frame"); // adopt this slide's treatment + sync its controls
    } else if (state.mode === "crop") {
      syncCropControls();
    }
    sessionStore.scheduleMeta();
  }

  function removeSource(id) {
    const idx = state.sources.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const [src] = state.sources.splice(idx, 1);
    importer.disposeSource(src);
    sessionStore.delSource(id);
    if (state.activeId === id) {
      state.activeId = state.sources.length ? state.sources[Math.max(0, idx - 1)].id : null;
    }
    if (!state.sources.length) sessionStore.clearAll(); else sessionStore.scheduleMeta();
    renderer.useActive().then(() => {
      refreshFilmstrip(); refreshEmpty();
      if (state.mode === "collage") { collageMode.assignSources(); renderer.draw(); }
    });
  }

  function openPicker() { picker.value = ""; picker.click(); }

  // Import an image directly into a collage cell (consumed source, not a new slide).
  let pendingCellIdx = null;
  function importIntoCell(idx) { pendingCellIdx = idx; picker.value = ""; picker.click(); }

  // Duplicate a slide: re-decode from its blob (own bitmaps) then copy its settings.
  async function duplicateSlide(id) {
    const src = state.sources.find((s) => s.id === id);
    if (!src || !src.blob) { toast(STRINGS.dupFail || "Cannot duplicate"); return; }
    setBusy(true);
    try {
      await importer.importFiles([src.blob]);
      const dup = state.sources[state.sources.length - 1];
      if (!dup) return;
      dup.frame = cloneFrame(src.frame);
      dup.carousel = cloneCarousel(src.carousel);
      dup.collage = cloneCollage(src.collage);
      dup.kind = src.kind;
      dup.crop = src.crop ? Object.assign({}, src.crop) : null;
      // place the duplicate immediately after the original
      const from = state.sources.indexOf(dup);
      let to = state.sources.indexOf(src) + 1;
      if (from > -1 && to > -1 && to <= from) { state.sources.splice(to, 0, state.sources.splice(from, 1)[0]); }
      if (dup.crop && !isIdentityCropSafe(dup.crop)) { try { await renderer.bakeCrop(dup); } catch (_) {} }
      state.activeId = dup.id;
      await renderer.useActive();
      refreshFilmstrip();
      sessionStore.scheduleMeta();
    } finally { setBusy(false); }
  }
  function isIdentityCropSafe(c) {
    return !c || (c.ratio === "original" && (c.zoom || 1) === 1 && (c.cx ?? 0.5) === 0.5 && (c.cy ?? 0.5) === 0.5 && !c.flip && !c.rotate);
  }

  function setMode(mode) {
    state.mode = mode;
    // Phase C2: frame/carousel are per-slide treatments — remember this slide's kind.
    if (mode === "frame" || mode === "carousel" || mode === "collage") { const a = renderer.activeSource(); if (a) a.kind = mode; }
    document.querySelectorAll(".mode").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
    document.getElementById("sheetFrame").classList.toggle("hidden", mode !== "frame");
    document.getElementById("sheetCrop").classList.toggle("hidden", mode !== "crop");
    document.getElementById("sheetCollage").classList.toggle("hidden", mode !== "collage");
    document.getElementById("sheetCarousel").classList.toggle("hidden", mode !== "carousel");
    if (mode === "frame") { syncFrameControlsFromState(); updateExportNote(); renderer.draw(); }
    else if (mode === "crop") { syncCropControls(); renderer.draw(); }
    else if (mode === "collage") {
      const a = renderer.activeSource();
      collageMode.ensureCells();
      if (a && state.collage.cells.length && !state.collage.cells.some((c) => c.srcId)) state.collage.cells[0].srcId = a.id;
      syncCollageControls(); renderer.draw(); layoutPicker.refreshCellFill();
    }
    else if (mode === "carousel") {
      state.carousel.pos = 0;
      pressGroup("#adjustSeg button", "adj", state.carousel.adjust);
      pressGroup("#fillSeg button", "fill", state.carousel.fill);
      document.getElementById("adjustSeg").style.display = state.carousel.fill === "cover" ? "" : "none";
      document.getElementById("carouselHint").textContent =
        (state.carousel.adjust === "browse") ? STRINGS.carouselHintBrowse : STRINGS.carouselHintMove;
      renderer.draw();
    }
    else toast(STRINGS.modeSoon);
    updateBatchBtn();
    updateSlideContext();
    sessionStore.scheduleMeta();
  }

  function bind() {
    document.getElementById("btnImport").addEventListener("click", openPicker);
    document.getElementById("btnAddTop").addEventListener("click", openPicker);
    picker.addEventListener("change", async (e) => {
      const files = e.target.files;
      if (pendingCellIdx != null && files && files.length) {
        const idx = pendingCellIdx; pendingCellIdx = null;
        const collageSlideId = state.activeId;
        const before = state.sources.length;
        await importer.importFiles([files[0]]);
        if (state.sources.length > before) {
          const dup = state.sources[state.sources.length - 1];
          const cs = state.sources.find((s) => s.id === collageSlideId);
          if (cs && cs.collage && cs.collage.cells[idx]) cs.collage.cells[idx].srcId = dup.id;
          state.activeId = collageSlideId; // stay on the collage slide; the new image is a consumed cell
          await renderer.useActive();
          renderer.draw();
          layoutPicker.refreshCellFill();
          refreshFilmstrip();
          sessionStore.scheduleMeta();
        }
        return;
      }
      importer.importFiles(files);
    });
    collageMode.setOnCellImport(importIntoCell);

    document.querySelectorAll(".mode").forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.mode)));

    bindFrameControls();
    bindCropControls();
    bindCollageControls();
    bindCarouselControls();

    // Collapsible panel: hide the controls to enlarge the photo preview.
    document.getElementById("sheetHandle").addEventListener("click", () => {
      document.body.classList.toggle("sheets-collapsed");
      // re-fit the canvas across the height animation
      const t0 = performance.now();
      (function loop() {
        renderer.draw();
        if (performance.now() - t0 < 320) requestAnimationFrame(loop);
      })();
    });
    cropMode.bind();
    collageMode.bind();
    carouselMode.bind();
    bindExtras();

    // Keep the canvas crisp whenever the stage area actually changes size
    // (import layout settle, URL-bar show/hide, rotation) — fixes the "first
    // import looks compressed until you touch a control" issue at the source.
    if (typeof ResizeObserver !== "undefined") {
      let raf = 0;
      const ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => renderer.draw());
      });
      ro.observe(document.getElementById("workspace"));
    }

    // Slider fill: paint the filled portion of the track (WebKit needs --fill).
    function setFill(el) {
      const min = +el.min || 0, max = +el.max || 100, v = +el.value;
      el.style.setProperty("--fill", ((v - min) / (max - min)) * 100 + "%");
    }
    document.addEventListener("input", (e) => {
      if (e.target && e.target.matches && e.target.matches('input[type="range"]')) setFill(e.target);
    }, true);
    refreshFills = () => document.querySelectorAll('input[type="range"]').forEach(setFill);
    refreshFills();

    // Persist last-used settings on any control interaction (debounced).
    ["sheetFrame", "sheetCollage", "sheetCarousel"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener("input", () => { persistence.scheduleSave(); sessionStore.scheduleMeta(); });
      el.addEventListener("click", () => { persistence.scheduleSave(); sessionStore.scheduleMeta(); });
    });

    // Drag & drop (desktop / Android with file DnD).
    ["dragenter", "dragover"].forEach((ev) =>
      workspace.addEventListener(ev, (e) => { e.preventDefault(); empty.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) =>
      workspace.addEventListener(ev, (e) => { e.preventDefault(); empty.classList.remove("drag"); }));
    workspace.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length)
        importer.importFiles(e.dataTransfer.files);
    });

    // Re-fit preview on viewport / orientation change (debounced).
    let rt = null;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => renderer.draw(), 80); });
  }

  function updateUndo() {
    const b = document.getElementById("btnUndo");
    if (b) b.disabled = !undo.canUndo();
  }

  // Re-sync all controls + canvas to the current state (used after an undo).
  async function applyRestoredState() {
    await renderer.useActive();
    refreshFilmstrip();
    syncFrameControlsFromState();
    syncCropControls();
    syncCollageControls();
    setMode(state.mode);
    updateExportNote();
  }

  // ---- settings + export preview modals -------------------------------------
  function sampleName() {
    const en = state.exportName || {};
    const token = en.mode === "seq" ? String((state.exportSeq || 0) + 1).padStart(3, "0") : "20260630_2110";
    return exporter.exportPrefix() + "_4x5_" + token + ".jpg";
  }
  function refreshNamePreview() {
    const el = document.getElementById("namePreview");
    if (el) el.innerHTML = STRINGS.example + "<b>" + sampleName() + "</b>";
  }
  function openSettings() {
    document.getElementById("namePrefix").value = state.exportName.prefix || "";
    pressGroup("#nameModeSeg button", "m", state.exportName.mode || "date");
    refreshNamePreview();
    document.getElementById("settingsModal").classList.add("show");
  }
  function closeSettings() { document.getElementById("settingsModal").classList.remove("show"); }

  let pvFiles = [], pvUrls = [], pvMeta = null;
  function clearPvUrls() { pvUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} }); pvUrls = []; }
  async function openPreview(filesPromise, title, meta) {
    let files = [];
    try { setBusy(true); files = await filesPromise; } finally { setBusy(false); }
    if (!files || !files.length) { toast(STRINGS.exportFail); return; }
    pvFiles = files; pvMeta = meta || null; clearPvUrls();
    const grid = document.getElementById("pvGrid"); grid.innerHTML = "";
    document.getElementById("previewTitle").textContent = title || STRINGS.previewTitle;
    files.forEach((f, i) => {
      const u = URL.createObjectURL(f); pvUrls.push(u);
      const cell = document.createElement("div"); cell.className = "pv-item";
      const img = document.createElement("img"); img.src = u; img.alt = f.name;
      const no = document.createElement("div"); no.className = "pv-no"; no.textContent = String(i + 1);
      cell.appendChild(img); cell.appendChild(no); grid.appendChild(cell);
    });
    document.getElementById("previewModal").classList.add("show");
  }
  function closePreview() { document.getElementById("previewModal").classList.remove("show"); clearPvUrls(); pvFiles = []; pvMeta = null; }

  // ---- export history (recents) ----
  let histUrls = [];
  function clearHistUrls() { histUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} }); histUrls = []; }
  function timeAgo(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + " dtk lalu";
    const m = Math.floor(s / 60); if (m < 60) return m + " mnt lalu";
    const h = Math.floor(m / 60); if (h < 24) return h + " jam lalu";
    return Math.floor(h / 24) + " hari lalu";
  }
  function modeLabel(mode) { return (STRINGS.modes && STRINGS.modes[mode]) || mode; }
  const SVG_SHARE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';
  const SVG_SAVE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';
  const SVG_TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
  function filesFromRec(rec) { return rec.files.map((f) => new File([f.blob], f.name, { type: f.blob.type })); }
  async function renderHistory() {
    const list = document.getElementById("histList");
    clearHistUrls();
    let items = []; try { items = await historyStore.list(); } catch (_) {}
    list.innerHTML = "";
    document.getElementById("histEmpty").style.display = items.length ? "none" : "block";
    document.getElementById("histClear").style.display = items.length ? "" : "none";
    for (const it of items) {
      const row = document.createElement("div"); row.className = "hist-row";
      const thumb = document.createElement("div"); thumb.className = "hist-thumb";
      const u = URL.createObjectURL(it.files[0].blob); histUrls.push(u);
      const img = document.createElement("img"); img.src = u; thumb.appendChild(img);
      if (it.count > 1) { const c = document.createElement("div"); c.className = "cnt"; c.textContent = "\u00d7" + it.count; thumb.appendChild(c); }
      const meta = document.createElement("div"); meta.className = "hist-meta";
      const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = it.files[0].name;
      const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = modeLabel(it.mode) + " \u00b7 " + timeAgo(it.ts);
      meta.appendChild(ttl); meta.appendChild(sub);
      const acts = document.createElement("div"); acts.className = "hist-acts";
      const share = document.createElement("button"); share.innerHTML = SVG_SHARE; share.setAttribute("aria-label", "Bagikan");
      const save = document.createElement("button"); save.innerHTML = SVG_SAVE; save.setAttribute("aria-label", "Simpan");
      const del = document.createElement("button"); del.className = "danger"; del.innerHTML = SVG_TRASH; del.setAttribute("aria-label", "Hapus");
      share.addEventListener("click", () => exporter.deliverMany(filesFromRec(it)));
      save.addEventListener("click", () => exporter.withDownload(() => exporter.deliverMany(filesFromRec(it))));
      del.addEventListener("click", async () => { try { await historyStore.remove(it.id); } catch (_) {} renderHistory(); });
      acts.appendChild(share); acts.appendChild(save); acts.appendChild(del);
      row.appendChild(thumb); row.appendChild(meta); row.appendChild(acts);
      list.appendChild(row);
    }
  }
  function openHistory() { document.getElementById("historyModal").classList.add("show"); renderHistory(); }
  function closeHistory() { document.getElementById("historyModal").classList.remove("show"); clearHistUrls(); }
  function onHistoryChanged() { if (document.getElementById("historyModal").classList.contains("show")) renderHistory(); }

  function bindExtras() {
    // Settings
    document.getElementById("btnSettings").addEventListener("click", openSettings);
    document.getElementById("settingsClose").addEventListener("click", closeSettings);
    document.getElementById("settingsModal").addEventListener("click", (e) => { if (e.target.id === "settingsModal") closeSettings(); });
    document.getElementById("namePrefix").addEventListener("input", (e) => {
      state.exportName.prefix = e.target.value;
      persistence.scheduleSave(); refreshNamePreview();
    });
    document.querySelectorAll("#nameModeSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        state.exportName.mode = b.dataset.m;
        pressGroup("#nameModeSeg button", "m", b.dataset.m);
        persistence.scheduleSave(); refreshNamePreview();
      }));
    document.querySelectorAll("#langSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        applyLang(b.dataset.lang);
        try { setMode(state.mode); } catch (_) {}  // refresh dynamic per-mode labels
        refreshNamePreview();
      }));
    // Preview
    document.getElementById("previewClose").addEventListener("click", closePreview);
    document.getElementById("previewModal").addEventListener("click", (e) => { if (e.target.id === "previewModal") closePreview(); });
    document.getElementById("pvShare").addEventListener("click", async () => {
      const files = pvFiles.slice(), meta = pvMeta; closePreview();
      await exporter.deliverMany(files, meta);
    });
    document.getElementById("pvSave").addEventListener("click", async () => {
      const files = pvFiles.slice(), meta = pvMeta; closePreview();
      await exporter.withDownload(() => exporter.deliverMany(files, meta));
    });
    document.getElementById("btnCarouselPreview").addEventListener("click", () =>
      openPreview(carouselMode.carouselFiles(), STRINGS.previewCarousel, { mode: "carousel", label: state.carousel.n + " tile" }));
    document.getElementById("btnExportAll").addEventListener("click", () =>
      openPreview(exporter.batchFiles(), STRINGS.previewBatch, { mode: "frame", label: "batch " + state.sources.length }));
    // History
    document.getElementById("btnHistory").addEventListener("click", openHistory);
    document.getElementById("historyClose").addEventListener("click", closeHistory);
    document.getElementById("historyModal").addEventListener("click", (e) => { if (e.target.id === "historyModal") closeHistory(); });
    document.getElementById("histClear").addEventListener("click", async () => { try { await historyStore.clear(); } catch (_) {} renderHistory(); });
  }

  return { applyStrings, applyLang, bind, setBusy, toast, refreshEmpty, refreshFilmstrip, setActive, setMode, updateExportNote, syncFrameControlsFromState, renderPresets, updateUndo, applyRestoredState, onHistoryChanged, syncCollageControls, removeSource, openPicker, duplicateSlide };
})();
