export const postModel = (function () {
  function slideOutputCount(s) { return s.kind === "carousel" ? Math.max(1, (s.carousel && s.carousel.n) || 1) : 1; }
  function totalOutputs(slides) { return slides.reduce((n, s) => n + slideOutputCount(s), 0); }
  function flatten(slides) {
    const out = [];
    for (const s of slides) { const n = slideOutputCount(s); for (let k = 0; k < n; k++) out.push({ slideId: s.id, kind: s.kind, sub: k, of: n }); }
    return out;
  }
  function reorder(slides, from, to) {
    const a = slides.slice();
    if (from < 0 || from >= a.length) return a;
    to = Math.max(0, Math.min(a.length - 1, to));
    const [it] = a.splice(from, 1); a.splice(to, 0, it); return a;
  }
  function positionLabel(slides, idx) {
    let start = 1;
    for (let i = 0; i < idx; i++) start += slideOutputCount(slides[i]);
    const n = slideOutputCount(slides[idx]);
    return n === 1 ? String(start) : (start + "\u2013" + (start + n - 1));
  }
  // Phase C: read each source's own kind + settings (frame default). A collage
  // slide consumes its non-primary cell photos, which are hidden from the list.
  function deriveFrameSlides(sources) {
    const consumed = new Set();
    sources.forEach((s) => {
      if (s.kind === "collage" && s.collage && s.collage.cells) {
        s.collage.cells.forEach((c) => { if (c.srcId && c.srcId !== s.id) consumed.add(c.srcId); });
      }
    });
    return sources.filter((s) => !consumed.has(s.id))
      .map((s) => ({ id: s.id, kind: s.kind || "frame", srcId: s.id, carousel: s.carousel, collage: s.collage }));
  }
  return { slideOutputCount, totalOutputs, flatten, reorder, positionLabel, deriveFrameSlides };
})();
