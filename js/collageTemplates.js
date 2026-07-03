/* Asymmetric collage layouts (fractional cells in the inner area). These are
 * the non-uniform "magazine" arrangements beyond a plain rows×cols grid. */
export const COLLAGE_TEMPLATES = [
  { id: "big-2r", n: 3, label: "1+2", cells: [
    { x: 0, y: 0, w: 0.62, h: 1 }, { x: 0.62, y: 0, w: 0.38, h: 0.5 }, { x: 0.62, y: 0.5, w: 0.38, h: 0.5 } ] },
  { id: "2-big", n: 3, label: "2+1", cells: [
    { x: 0, y: 0, w: 0.5, h: 0.4 }, { x: 0.5, y: 0, w: 0.5, h: 0.4 }, { x: 0, y: 0.4, w: 1, h: 0.6 } ] },
  { id: "big-3r", n: 4, label: "1+3", cells: [
    { x: 0, y: 0, w: 0.6, h: 1 },
    { x: 0.6, y: 0, w: 0.4, h: 1 / 3 }, { x: 0.6, y: 1 / 3, w: 0.4, h: 1 / 3 }, { x: 0.6, y: 2 / 3, w: 0.4, h: 1 / 3 } ] },
  { id: "wide-narrow", n: 2, label: "2:1", cells: [
    { x: 0, y: 0, w: 0.64, h: 1 }, { x: 0.64, y: 0, w: 0.36, h: 1 } ] },
  { id: "tri-121", n: 3, label: "1·2·1", cells: [
    { x: 0, y: 0, w: 0.25, h: 1 }, { x: 0.25, y: 0, w: 0.5, h: 1 }, { x: 0.75, y: 0, w: 0.25, h: 1 } ] },
  { id: "feat-3", n: 4, label: "Atas+3", cells: [
    { x: 0, y: 0, w: 1, h: 0.6 },
    { x: 0, y: 0.6, w: 1 / 3, h: 0.4 }, { x: 1 / 3, y: 0.6, w: 1 / 3, h: 0.4 }, { x: 2 / 3, y: 0.6, w: 1 / 3, h: 0.4 } ] },
];
export function templateById(id) { return COLLAGE_TEMPLATES.find((t) => t.id === id) || null; }
