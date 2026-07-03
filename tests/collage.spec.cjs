'use strict';
// Regression: collage. (6a) new sources start with empty cells (no cross-slide
// pollution). (6b) "+" affordance shows in preview, never in export. (6c) the
// "×" remove badge clears a cell.
const { fixtures, serve, counter, launch } = require('./_helpers.cjs');
const PORT = 8321;
(async () => {
  const fx = fixtures(); const srv = await serve(PORT); const { chk, st } = counter();
  const browser = await launch(); const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__app && window.__app.state, null, { timeout: 10000 });

  // [1] pollution: import p1 -> collage -> import p2 -> collage(p2) => cell0 is p2's own image
  await page.setInputFiles('#filePicker', fx.portrait);
  await page.waitForFunction(() => window.__app.state.sources.length === 1, null, { timeout: 8000 });
  await page.evaluate(() => window.__app.ui.setMode('collage'));
  await page.setInputFiles('#filePicker', fx.landscape);
  await page.waitForFunction(() => window.__app.state.sources.length === 2, null, { timeout: 8000 });
  const pol = await page.evaluate(async () => {
    const A = window.__app, s2 = A.state.sources[1];
    const cloned = s2.collage.cells.map(c => c.srcId);
    A.state.activeId = s2.id; await A.renderer.useActive(); A.ui.setMode('collage');
    return { s2: s2.id, cloned, first: A.state.collage.cells[0] && A.state.collage.cells[0].srcId };
  });
  chk('2nd photo collage cells start EMPTY', pol.cloned.every(x => !x), JSON.stringify(pol.cloned));
  chk('slide-2 first cell = its OWN image', pol.first === pol.s2, `cell0=${pol.first} own=${pol.s2}`);

  // [2] "+" only in preview, never in export composite (black gutter isolates affordance-white)
  const plus = await page.evaluate(() => {
    const A = window.__app, co = A.state.collage; co.template = null; co.rows = 1; co.cols = 2;
    co.gutterColor = '#000000'; co.gutterPct = 0; co.marginPct = 0; A.collageMode.ensureCells();
    co.cells[0].srcId = A.state.sources[1].id; co.cells[1].srcId = null;
    const cnt = (ctx) => { const d = ctx.getImageData(0, 0, 400, 200).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] > 180 && d[i + 2] > 180 && d[i + 3] > 120) n++; return n; };
    const pv = new OffscreenCanvas(400, 200), pc = pv.getContext('2d'); A.collageMode.drawPreview(pc, 400, 200);
    const ex = new OffscreenCanvas(400, 200), ec = ex.getContext('2d'); A.collageMode.drawComposite(ec, 400, 200);
    return { preview: cnt(pc), export: cnt(ec) };
  });
  chk('"+" drawn in preview editor', plus.preview > 15, `whitePx=${plus.preview}`);
  chk('no "+"/"×" leaks into export composite', plus.export === 0, `export=${plus.export} preview=${plus.preview}`);

  // [3] remove badge via real UI flow tap (reset in-page to a single fresh source)
  await page.evaluate(() => { const A = window.__app; A.state.sources.slice().forEach(s => A.ui.removeSource(s.id)); A.state.view = 'overview'; });
  await page.waitForFunction(() => window.__app.state.sources.length === 0, null, { timeout: 5000 });
  await page.setInputFiles('#filePicker', fx.portrait);
  await page.waitForFunction(() => window.__app.state.sources.length === 1, null, { timeout: 8000 });
  await page.click('#poStrip .po-card'); await page.waitForSelector('#slideActions.show', { timeout: 5000 });
  await page.click('#slideActions .sa-btn[data-act="collage"]');
  await page.waitForFunction(() => window.__app.state.view === 'edit' && window.__app.state.mode === 'collage', null, { timeout: 5000 });
  await page.evaluate(() => { const A = window.__app, co = A.state.collage; co.template = null; co.rows = 2; co.cols = 2; A.collageMode.ensureCells(); co.cells[0].srcId = A.state.sources[0].id; A.renderer.draw(); });
  await page.waitForTimeout(120);
  const badge = await page.evaluate(() => {
    const A = window.__app, g = A.geometryCore, ws = document.getElementById('workspace'), stage = document.getElementById('stage');
    const r = A.collageMode.ratioNums(), pad = 10; const shape = g.canvasDimsForRatio(r.w, r.h, 1000);
    const fit = g.computeContainRect(shape.Cw, shape.Ch, ws.clientWidth - 2 * pad, ws.clientHeight - 2 * pad);
    const vp = { x: pad + fit.x, y: pad + fit.y, w: fit.w }, scale = vp.w / shape.Cw;
    const lay = g.computeCollageLayout({ Cw: shape.Cw, Ch: shape.Ch, rows: 2, cols: 2, outerMargin: 0, gutter: 0 });
    const c0 = lay.cells[0], cell = { x: vp.x + c0.x * scale, y: vp.y + c0.y * scale, w: c0.w * scale, h: c0.h * scale };
    const rr = Math.max(11, Math.min(cell.w, cell.h) * 0.12); const bx = cell.x + cell.w - rr - rr * 0.35, by = cell.y + rr + rr * 0.35;
    const sr = stage.getBoundingClientRect(); return { x: sr.left + bx, y: sr.top + by, before: A.state.collage.cells[0].srcId };
  });
  await page.mouse.move(badge.x, badge.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(120);
  const after = await page.evaluate(() => window.__app.state.collage.cells[0].srcId);
  chk('remove-badge tap clears the cell', badge.before && after === null, `before=${badge.before} after=${after}`);

  chk('no console/page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
  console.log(`\n${st.pass} passed, ${st.fail} failed`);
  await browser.close(); srv.close(); process.exit(st.fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
