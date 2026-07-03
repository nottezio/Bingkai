import { importer } from './importer.js';
import { renderer } from './renderer.js';
import { sessionStore } from './sessionStore.js';
import { state } from './state.js';
import { ui } from './ui.js';

export const undo = (function () {
  const MAX = 25;
  const stack = [];
  let pending = null;

  function snap() {
    return JSON.stringify({
      mode: state.mode, activeId: state.activeId,
      frame: state.frame, exportOpt: state.exportOpt,
      collage: state.collage, carousel: state.carousel,
      crops: state.sources.map((s) => ({ id: s.id, crop: s.crop })),
    });
  }
  function begin() { pending = snap(); }
  function commit() {
    if (pending && pending !== snap()) {
      stack.push(pending);
      if (stack.length > MAX) stack.shift();
      ui.updateUndo();
    }
    pending = null;
  }
  function canUndo() { return stack.length > 0; }

  async function pop() {
    if (!stack.length) return;
    const s = JSON.parse(stack.pop());
    state.mode = s.mode;
    if (state.sources.some((x) => x.id === s.activeId)) state.activeId = s.activeId;
    Object.assign(state.frame, s.frame);
    Object.assign(state.exportOpt, s.exportOpt);
    Object.assign(state.collage, s.collage);
    Object.assign(state.carousel, s.carousel);
    const byId = {}; s.crops.forEach((c) => { byId[c.id] = c.crop; });
    for (const src of state.sources) {
      src.crop = Object.prototype.hasOwnProperty.call(byId, src.id) ? byId[src.id] : src.crop;
      try { await importer.applyRotation(src, (src.crop && src.crop.rotate) || 0); } catch (_) {}
      try { await renderer.bakeCrop(src); } catch (_) {}
    }
    await ui.applyRestoredState();
    ui.updateUndo();
    sessionStore.scheduleMeta();
  }

  return { begin, commit, pop, canUndo };
})();
