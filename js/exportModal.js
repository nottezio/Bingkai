import { exporter } from './exporter.js';
import { state } from './state.js';

export const exportModal = (function () {
  const backdrop = document.getElementById("exportModal");
  let dest = "instagram", qual = "ig", pack = "zip";
  const press = (sel, key, val) =>
    document.querySelectorAll(sel + " .exp-opt").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[key] === val)));
  function syncPackVisibility() {
    // ZIP-vs-separate only matters for device saves (sharing uses the OS share sheet).
    const sec = document.getElementById("expPackSection");
    if (sec) sec.style.display = dest === "device" ? "" : "none";
  }
  function open() {
    if (!state.sources.length) return;
    press("#expDest", "dest", dest); press("#expQual", "q", qual); press("#expPack", "pack", pack);
    syncPackVisibility();
    backdrop.classList.add("show");
  }
  function close() { backdrop.classList.remove("show"); }
  function applyQuality() {
    const o = state.exportOpt;
    if (qual === "ig") { o.ig = true; o.quality = 0.90; }
    else if (qual === "high") { o.ig = true; o.quality = 0.95; }
    else { o.ig = false; o.quality = 1.0; }
    o.format = "jpeg";
  }
  async function go() {
    applyQuality();
    close();
    if (dest === "device") await exporter.savePost(pack);
    else await exporter.runPost();
  }
  function bind() {
    document.querySelectorAll("#expDest .exp-opt").forEach((b) =>
      b.addEventListener("click", () => { dest = b.dataset.dest; press("#expDest", "dest", dest); syncPackVisibility(); }));
    document.querySelectorAll("#expQual .exp-opt").forEach((b) =>
      b.addEventListener("click", () => { qual = b.dataset.q; press("#expQual", "q", qual); }));
    document.querySelectorAll("#expPack .exp-opt").forEach((b) =>
      b.addEventListener("click", () => { pack = b.dataset.pack; press("#expPack", "pack", pack); }));
    document.getElementById("exportGo").addEventListener("click", go);
    document.getElementById("exportCancel").addEventListener("click", close);
    document.getElementById("exportClose").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  }
  return { open, close, bind };
})();
