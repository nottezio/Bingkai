'use strict';
// Regression: crop WYSIWYG. The crop cache (croppedBitmap) must never be stale
// at any export path. Reproduces the original preview≠export divergence.
const { fixtures, serve, counter, launch } = require('./_helpers.cjs');
const PORT = 8320;
const band = (a) => a[0] > 150 && a[1] < 110 ? 'RED' : a[1] > 140 && a[0] < 110 ? 'GREEN' : a[2] > 150 && a[0] < 110 ? 'BLUE' : `(${a})`;
(async () => {
  const fx = fixtures(); const srv = await serve(PORT); const { chk, st } = counter();
  const browser = await launch(); const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__app && window.__app.state, null, { timeout: 10000 });
  await page.setInputFiles('#filePicker', fx.portrait);
  await page.waitForFunction(() => window.__app.state.sources.length === 1, null, { timeout: 8000 });

  const r = await page.evaluate(async () => {
    const A = window.__app, src = A.state.sources[0];
    src.crop = { ratio: '3:2', zoom: 1, cx: 0.5, cy: 0.5, flip: false, rotate: 0 };
    await A.renderer.bakeCropActive();       // cache centered (GREEN)
    src.crop.cy = 0.75;                       // pan down, bake deliberately skipped
    await A.renderer.ensureCropAll();         // the fix: self-heal
    const eff = A.renderer.effective(src);
    const cv = new OffscreenCanvas(2, 2), c = cv.getContext('2d'); c.drawImage(eff.bitmap, 0, 0, 2, 2);
    return Array.from(c.getImageData(1, 1, 1, 1).data).slice(0, 3);
  });
  chk('ensureCropAll heals stale crop cache -> BLUE', band(r) === 'BLUE', band(r));

  const center = await page.evaluate(async () => {
    const A = window.__app, src = A.state.sources[0];
    src.crop = { ratio: '3:2', zoom: 1, cx: 0.5, cy: 0.5, flip: false, rotate: 0 };
    await A.renderer.bakeCropActive(); src.crop.cy = 0.75; // stale
    const files = await A.exporter.postFiles();            // export path ensures fresh
    const bmp = await createImageBitmap(files[0]); const cv = new OffscreenCanvas(bmp.width, bmp.height), c = cv.getContext('2d'); c.drawImage(bmp, 0, 0);
    const p = c.getImageData(bmp.width >> 1, bmp.height >> 1, 1, 1).data; return [p[0], p[1], p[2]];
  });
  chk('real export reflects current crop params (BLUE)', band(center) === 'BLUE', band(center));

  const mid = await page.evaluate(async () => {
    const A = window.__app, src = A.state.sources[0];
    src.crop = { ratio: '3:2', zoom: 1, cx: 0.5, cy: 0.5, flip: false, rotate: 0 }; src._cropSig = undefined;
    const files = await A.exporter.postFiles(); const bmp = await createImageBitmap(files[0]); const cv = new OffscreenCanvas(bmp.width, bmp.height), c = cv.getContext('2d'); c.drawImage(bmp, 0, 0);
    const p = c.getImageData(bmp.width >> 1, bmp.height >> 1, 1, 1).data; return [p[0], p[1], p[2]];
  });
  chk('centered 3:2 export = GREEN', band(mid) === 'GREEN', band(mid));

  console.log(`\n${st.pass} passed, ${st.fail} failed`);
  await browser.close(); srv.close(); process.exit(st.fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
