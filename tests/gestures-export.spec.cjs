'use strict';
// Regression: (4) carousel browse = scroll-only, move = reposition. (5) undo
// coverage via centralized capture (margin slider). (3) export pack zip/separate.
const { fixtures, serve, counter, launch } = require('./_helpers.cjs');
const PORT = 8323;
(async () => {
  const fx = fixtures(); const srv = await serve(PORT); const { chk, st } = counter();
  const browser = await launch(); const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__app && window.__app.state, null, { timeout: 10000 });
  await page.setInputFiles('#filePicker', fx.landscape);
  await page.waitForFunction(() => window.__app.state.sources.length === 1, null, { timeout: 8000 });

  const drag = async (dx, dy) => page.evaluate(({ dx, dy }) => {
    const st = document.getElementById('stage'); const r = st.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (t, x, y) => st.dispatchEvent(new PointerEvent(t, { pointerId: 1, isPrimary: true, pointerType: 'touch', bubbles: true, clientX: x, clientY: y }));
    ev('pointerdown', cx, cy); ev('pointermove', cx + dx * 0.5, cy + dy * 0.5); ev('pointermove', cx + dx, cy + dy); ev('pointerup', cx + dx, cy + dy);
  }, { dx, dy });

  await page.evaluate(async () => { const A = window.__app; A.state.view = 'edit'; A.state.activeId = A.state.sources[0].id; await A.renderer.useActive(); A.ui.setMode('carousel');
    const c = A.state.carousel; c.fill = 'cover'; c.n = 3; c.adjust = 'browse'; c.zoom = 1.4; c.cx = 0.5; c.cy = 0.5; c.pos = 1; A.renderer.draw(); });
  const rd = () => page.evaluate(() => ({ cx: window.__app.state.carousel.cx, cy: window.__app.state.carousel.cy, pos: window.__app.state.carousel.pos }));
  let b = await rd(); await drag(0, 120); let a = await rd();
  chk('BROWSE: vertical drag does NOT reposition', Math.abs(a.cx - b.cx) < 1e-6 && Math.abs(a.cy - b.cy) < 1e-6, `cy ${b.cy.toFixed(4)}->${a.cy.toFixed(4)}`);
  b = a; await drag(-140, 0); a = await rd();
  chk('BROWSE: horizontal drag scrolls tiles', Math.abs(a.pos - b.pos) > 1e-3, `pos ${b.pos.toFixed(3)}->${a.pos.toFixed(3)}`);
  chk('BROWSE: horizontal drag still no reposition', Math.abs(a.cy - b.cy) < 1e-6);
  await page.evaluate(() => { window.__app.state.carousel.adjust = 'move'; });
  b = await rd(); await drag(0, 120); a = await rd();
  chk('MOVE: vertical drag repositions', Math.abs(a.cy - b.cy) > 1e-4, `cy ${b.cy.toFixed(4)}->${a.cy.toFixed(4)}`);

  // undo coverage: margin slider edit recorded + revertible
  await page.evaluate(async () => { const A = window.__app; A.ui.setMode('frame'); const on = document.getElementById('frameEnableOn'); if (on) on.click(); A.state.frame.marginPct = 0; A.ui.syncFrameControlsFromState && A.ui.syncFrameControlsFromState(); });
  await page.waitForTimeout(50);
  const u = await page.evaluate(async () => {
    const A = window.__app, sheet = document.getElementById('sheetFrame'), mr = document.getElementById('marginRange');
    const before = A.state.frame.marginPct;
    sheet.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
    mr.value = '16'; mr.dispatchEvent(new Event('input', { bubbles: true }));
    const edit = A.state.frame.marginPct; await new Promise(r => setTimeout(r, 450));
    const can = A.undo.canUndo(); await A.undo.pop();
    return { before, edit, can, after: A.state.frame.marginPct };
  });
  chk('UNDO: margin edit recorded', u.can === true, `before=${u.before} edit=${u.edit}`);
  chk('UNDO: pop reverts margin', u.after === u.before, `${u.edit} -> ${u.after}`);

  // export pack: separate -> N downloads; modal threads pack; visibility
  const packN = await page.evaluate(async () => {
    const A = window.__app; let clicks = 0; const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) { clicks++; return; } return orig.apply(this, arguments); };
    const mk = (n) => new File([new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })], n, { type: 'image/jpeg' });
    await A.exporter.deliverMany([mk('a.jpg'), mk('b.jpg'), mk('c.jpg')], { mode: 'test' }, { pack: 'separate' });
    HTMLAnchorElement.prototype.click = orig; return clicks;
  });
  chk('EXPORT: pack=separate -> one download per image', packN === 3, `clicks=${packN}`);
  const arg = await page.evaluate(async () => {
    const A = window.__app; let got = '__none__'; const real = A.exporter.savePost; A.exporter.savePost = (p) => { got = p === undefined ? 'undef' : p; return Promise.resolve(true); };
    document.querySelector('#expDest .exp-opt[data-dest="device"]').click();
    document.querySelector('#expPack .exp-opt[data-pack="separate"]').click();
    document.getElementById('exportGo').click(); await new Promise(r => setTimeout(r, 60)); A.exporter.savePost = real; return got;
  });
  chk('EXPORT: modal passes pack to savePost', arg === 'separate', `got=${arg}`);
  chk('EXPORT: pack row hidden for share dest', await page.evaluate(() => { document.querySelector('#expDest .exp-opt[data-dest="instagram"]').click(); return getComputedStyle(document.getElementById('expPackSection')).display === 'none'; }));

  chk('no console/page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
  console.log(`\n${st.pass} passed, ${st.fail} failed`);
  await browser.close(); srv.close(); process.exit(st.fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
