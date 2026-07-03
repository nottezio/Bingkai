'use strict';
// Regression: framing is optional. Default OFF exports the raw (cropped) image
// at its own aspect; ON applies the chosen ratio/bg; touching a control auto-enables.
const { fixtures, serve, counter, launch } = require('./_helpers.cjs');
const PORT = 8322;
(async () => {
  const fx = fixtures(); const srv = await serve(PORT); const { chk, st } = counter();
  const browser = await launch(); const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__app && window.__app.state, null, { timeout: 10000 });
  await page.setInputFiles('#filePicker', fx.portrait); // 3:4
  await page.waitForFunction(() => window.__app.state.sources.length === 1, null, { timeout: 8000 });

  chk('frame.enabled defaults to OFF', await page.evaluate(() => window.__app.state.frame.enabled) === false);

  const analyse = async () => page.evaluate(async () => {
    const A = window.__app; const files = await A.exporter.postFiles(); const bmp = await createImageBitmap(files[0]);
    const cv = new OffscreenCanvas(bmp.width, bmp.height), cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0);
    const mx = bmp.width >> 1, my = bmp.height >> 1;
    const at = (x, y) => { const d = cx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
    const w = (a) => a[0] > 240 && a[1] > 240 && a[2] > 240;
    return { aspect: +(bmp.width / bmp.height).toFixed(3), center: at(mx, my),
      topW: w(at(mx, 3)), botW: w(at(mx, bmp.height - 4)), leftW: w(at(3, my)), rightW: w(at(bmp.width - 4, my)) };
  });

  const off = await analyse();
  chk('OFF export = image aspect 3:4', Math.abs(off.aspect - 0.75) < 0.01, 'aspect=' + off.aspect);
  chk('OFF export has NO frame bars', !off.topW && !off.botW && !off.leftW && !off.rightW);

  await page.evaluate(() => { const f = window.__app.state.frame; f.enabled = true; f.ratio = '1:1'; f.flip = false; f.marginPct = 0; f.bg = 'solid'; f.frameColor = '#FFFFFF'; });
  const on = await analyse();
  chk('ON 1:1 export = square', Math.abs(on.aspect - 1.0) < 0.01, 'aspect=' + on.aspect);
  chk('ON 1:1 shows white bars left & right', on.leftW && on.rightW);
  chk('ON 1:1 center still image (GREEN)', on.center[1] > 140 && on.center[0] < 110, 'center=' + on.center);

  await page.evaluate(() => { window.__app.state.frame.enabled = false; });
  const off2 = await analyse();
  chk('toggle OFF again -> raw', Math.abs(off2.aspect - 0.75) < 0.01 && !off2.leftW);

  await page.evaluate(() => { window.__app.state.frame.enabled = false; const A = window.__app; A.state.view = 'edit'; A.ui.setMode('frame'); });
  await page.evaluate(() => document.querySelector('#ratioChips .chip[data-ratio="4:5"]').click());
  chk('picking a ratio chip auto-enables framing', await page.evaluate(() => window.__app.state.frame.enabled) === true);

  chk('no console/page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
  console.log(`\n${st.pass} passed, ${st.fail} failed`);
  await browser.close(); srv.close(); process.exit(st.fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
