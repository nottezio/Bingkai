'use strict';
// Shared harness for the Bingkai regression suites. Generates deterministic
// band images (so exported pixels can be sampled), serves the app with correct
// MIME types (ES modules need text/javascript), and launches headless Chromium.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');

// --- minimal PNG writer (RGB, no deps) ---
function png(W, H, px) {
  const raw = Buffer.alloc((W * 3 + 1) * H); let o = 0;
  for (let y = 0; y < H; y++) { raw[o++] = 0; for (let x = 0; x < W; x++) { const c = px(x, y); raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; } }
  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type); const crc = Buffer.alloc(4);
    let c = ~0; const buf = Buffer.concat([t, data]); for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } crc.writeUInt32BE((~c) >>> 0);
    return Buffer.concat([len, t, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// portrait 3:4 with 3 horizontal bands RED/GREEN/BLUE; landscape with vertical bands.
function fixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingkai-'));
  const P = path.join(dir, 'portrait.png'), L = path.join(dir, 'landscape.png');
  const bandY = (y, H) => y < H / 3 ? [220, 40, 40] : y < 2 * H / 3 ? [40, 200, 40] : [40, 60, 220];
  const bandX = (x, W) => x < W / 3 ? [220, 40, 40] : x < 2 * W / 3 ? [40, 200, 40] : [40, 60, 220];
  fs.writeFileSync(P, png(1200, 1600, (x, y) => bandY(y, 1600)));
  fs.writeFileSync(L, png(1600, 1000, (x, y) => bandX(x, 1600)));
  return { portrait: P, landscape: L, dir };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function serve(port) {
  return new Promise((r) => { const s = http.createServer((q, res) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  }); s.listen(port, '127.0.0.1', () => r(s)); });
}

function counter() {
  const st = { pass: 0, fail: 0 };
  const chk = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  — ' + x : '')); c ? st.pass++ : st.fail++; };
  return { chk, st };
}

async function launch() {
  return chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox'] });
}

module.exports = { fixtures, serve, counter, launch, ROOT };
