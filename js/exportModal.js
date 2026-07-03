import { exporter } from './exporter.js';
import { state } from './state.js';

export const exportModal = (function () {
  const backdrop = document.getElementById("exportModal");
  let dest = "instagram", pack = "zip";
  const press = (sel, key, val) =>
    document.querySelectorAll(sel + " .exp-opt").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[key] === val)));

  function syncPackVisibility() {
    // ZIP-vs-separate only matters for device saves (sharing uses the OS share sheet).
    const sec = document.getElementById("expPackSection");
    if (sec) sec.style.display = dest === "device" ? "" : "none";
  }

  // The size / quality / format controls live in this dialog now (moved off the
  // Frame tab). They write state.exportOpt via their own handlers in ui.js; here
  // we just reflect the current profile when the dialog opens.
  function syncProfile() {
    const o = state.exportOpt;
    const ig = o.ig !== false;
    document.querySelectorAll("#sizeSeg button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.ig === "1") === ig)));
    const fmt = o.format || "jpeg";
    document.querySelectorAll("#formatSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fmt === fmt)));
    const qr = document.getElementById("qualityRange");
    if (qr) { qr.value = Math.round((o.quality || 0.92) * 100); const v = document.getElementById("qualityVal"); if (v) v.textContent = qr.value; }
    const qrow = document.getElementById("qualityRow");
    if (qrow) qrow.style.display = fmt === "jpeg" ? "" : "none"; // quality only applies to JPEG
  }

  function open() {
    if (!state.sources.length) return;
    press("#expDest", "dest", dest); press("#expPack", "pack", pack);
    syncProfile();
    syncPackVisibility();
    backdrop.classList.add("show");
  }
  function close() { backdrop.classList.remove("show"); }

  async function go() {
    // No applyQuality() override — export honours state.exportOpt exactly as the
    // size/quality/format controls set it (so PNG and custom quality are kept).
    close();
    if (dest === "device") await exporter.savePost(pack);
    else await exporter.runPost();
  }

  function bind() {
    document.querySelectorAll("#expDest .exp-opt").forEach((b) =>
      b.addEventListener("click", () => { dest = b.dataset.dest; press("#expDest", "dest", dest); syncPackVisibility(); }));
    document.querySelectorAll("#expPack .exp-opt").forEach((b) =>
      b.addEventListener("click", () => { pack = b.dataset.pack; press("#expPack", "pack", pack); }));
    // Format toggle also shows/hides the JPEG-only quality row live in the dialog.
    // (The state write + pressed-state are handled by ui.js bindFrameControls.)
    document.querySelectorAll("#formatSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        const qrow = document.getElementById("qualityRow");
        if (qrow) qrow.style.display = (b.dataset.fmt === "jpeg") ? "" : "none";
      }));
    document.getElementById("exportGo").addEventListener("click", go);
    document.getElementById("exportCancel").addEventListener("click", close);
    document.getElementById("exportClose").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  }

  return { open, close, bind };
})();
