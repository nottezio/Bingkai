import { collageMode } from './collageMode.js';
import { COLLAGE_TEMPLATES } from './collageTemplates.js';
import { state } from './state.js';
import { ui } from './ui.js';

export const layoutPicker = (function () {
  const GRIDS = [
    { rows: 1, cols: 2 }, { rows: 2, cols: 1 }, { rows: 2, cols: 2 },
    { rows: 1, cols: 3 }, { rows: 3, cols: 1 }, { rows: 2, cols: 3 }, { rows: 3, cols: 2 },
  ];
  const backdrop = document.getElementById("layoutModal");
  const fillWrap = document.getElementById("cellFillThumbs");

  function gridRects(g) {
    const out = [];
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++)
      out.push({ x: c / g.cols, y: r / g.rows, w: 1 / g.cols, h: 1 / g.rows });
    return out;
  }
  function svgFor(rects) {
    const gap = 5;
    const cells = rects.map((rc) => {
      const x = rc.x * 100 + gap / 2, y = rc.y * 100 + gap / 2, w = rc.w * 100 - gap, h = rc.h * 100 - gap;
      return '<rect class="lp-cell" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"/>';
    }).join("");
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + cells + "</svg>";
  }
  function build() {
    const co = state.collage;
    const gWrap = document.getElementById("lpGrid"); gWrap.innerHTML = "";
    GRIDS.forEach((g) => {
      const b = document.createElement("button"); b.className = "lp-tile";
      b.innerHTML = svgFor(gridRects(g));
      b.setAttribute("aria-pressed", String(!co.template && co.rows === g.rows && co.cols === g.cols));
      b.addEventListener("click", () => { collageMode.setLayout({ rows: g.rows, cols: g.cols }); ui.syncCollageControls(); refreshCellFill(); close(); });
      gWrap.appendChild(b);
    });
    const tWrap = document.getElementById("lpTemplates"); tWrap.innerHTML = "";
    COLLAGE_TEMPLATES.forEach((t) => {
      const b = document.createElement("button"); b.className = "lp-tile";
      b.innerHTML = svgFor(t.cells);
      b.setAttribute("aria-pressed", String(co.template === t.id));
      b.addEventListener("click", () => { collageMode.setLayout({ template: t.id }); ui.syncCollageControls(); refreshCellFill(); close(); });
      tWrap.appendChild(b);
    });
  }
  // Thumbnails of every source; tap one to drop it into the selected cell.
  function refreshCellFill() {
    if (!fillWrap) return;
    fillWrap.innerHTML = "";
    const inCell = collageMode.selectedSrcId();
    state.sources.forEach((s) => {
      const b = document.createElement("button");
      b.className = "cell-fill-thumb" + (s.id === inCell ? " in-cell" : "");
      const img = document.createElement("img"); img.src = s.thumbUrl; img.alt = "";
      b.appendChild(img);
      b.addEventListener("click", () => { collageMode.assignToCell(s.id); refreshCellFill(); });
      fillWrap.appendChild(b);
    });
  }
  function open() { build(); backdrop.classList.add("show"); }
  function close() { backdrop.classList.remove("show"); }
  function bind() {
    const b = document.getElementById("btnLayoutPicker");
    if (b) b.addEventListener("click", open);
    document.getElementById("layoutClose").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    collageMode.setOnSelect(() => refreshCellFill());
  }
  return { open, close, bind, build, refreshCellFill };
})();
