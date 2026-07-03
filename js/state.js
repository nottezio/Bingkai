export const state = {
  sources: [],        // { id, name, bitmap(full-res), w, h, thumbUrl }
  activeId: null,
  mode: "frame",
  work: null,         // { id, bitmap(downscaled), w, h } — current preview bitmap
  frame: {
    enabled: false,     // master switch — off = export the raw (cropped) image, no frame
    ratio: "original",
    flip: false,        // landscape orientation for the chosen ratio
    marginPct: 0,       // 0 = no frame by default; framing is opt-in via the Frame tab
    frameColor: "#FFFFFF",
    bg: "solid",        // 'solid' | 'blur'
    blurStrength: 0.05, // fraction of min(Cw,Ch) used as blur radius
  },
  exportOpt: {
    ig: true,           // pin width to IG 1080
    quality: 0.92,      // JPEG quality
    format: "jpeg",     // 'jpeg' | 'png'
  },
  exportName: {
    prefix: "bingkai",  // per-session filename prefix
    mode: "date",       // 'date' = timestamp · 'seq' = incrementing counter
  },
  exportSeq: 0,         // session counter for 'seq' naming
  collage: {
    rows: 2, cols: 2,
    template: null,      // null = uniform rows×cols grid; else a template id
    ratio: "1:1",        // output canvas ratio
    gutterPct: 2,        // % of min(canvas edge)
    marginPct: 0,        // outer margin, % of min(canvas edge)
    gutterColor: "#FFFFFF",
    cells: [],           // [{ srcId, zoom, cx, cy }] length rows*cols
    selected: 0,
  },
  carousel: {
    n: 3,                // number of tiles (2..10)
    tileRatio: "4:5",    // each posted tile's aspect
    fill: "cover",       // 'cover' | 'fit'
    adjust: "move",      // 'move' = drag repositions image (both axes); 'browse' = drag scrolls tiles
    pos: 0,              // preview scroll position in tile units
    zoom: 1,             // image zoom within the composite (cover only)
    cx: 0.5, cy: 0.5,    // image position within the composite (source fractions)
  },
};
let _idSeq = 0;
export const nextId = () => "src_" + (++_idSeq);
export const bumpIdSeq = (n) => { if (Number.isFinite(n) && n > _idSeq) _idSeq = n; };
// Per-slide frame settings snapshot (primitives only). Each source owns one;
// selecting a source repoints state.frame at it (Phase C).
export function cloneFrame(f) { return { enabled: !!f.enabled, ratio: f.ratio, flip: f.flip, marginPct: f.marginPct, frameColor: f.frameColor, bg: f.bg, blurStrength: f.blurStrength }; }
// Per-slide carousel settings snapshot. Selecting a source repoints state.carousel at it.
export function cloneCarousel(c) { return { n: c.n, tileRatio: c.tileRatio, fill: c.fill, adjust: c.adjust, pos: c.pos, zoom: c.zoom, cx: c.cx, cy: c.cy }; }
// Per-slide collage settings (a collage slide owns its own subset of photos via its cells).
// resetCells=true copies only the layout SETTINGS and starts with empty cells.
// A newly imported photo must never inherit another slide's cell srcIds — that
// is the root cause of "turning slide N into a collage shows slide 1's image".
// Undo/duplicate/session-restore keep the default (cells preserved).
export function cloneCollage(c, resetCells) {
  return {
    rows: c.rows, cols: c.cols, template: c.template, ratio: c.ratio,
    marginPct: c.marginPct, gutterPct: c.gutterPct, gutterColor: c.gutterColor, selected: 0,
    cells: resetCells ? [] : (c.cells || []).map((x) => ({ srcId: x.srcId, zoom: x.zoom, cx: x.cx, cy: x.cy })),
  };
}
