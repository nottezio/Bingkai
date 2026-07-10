/* Fails if any file hardcodes a version/cache string outside version.js.
 * Run before every deploy:  node verify-version.mjs */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const SELF = "version.js";
const reVer = /\b20\d\d-\d\d-\d\d\.\d+\b/;          // YYYY-MM-DD.N
const reCache = /bingkai-v?\d[\w.-]*/;              // hardcoded cache name
function walk(d, out = []) {
  for (const e of readdirSync(d)) {
    if (e === "node_modules" || e === "Previous Versions" || e.startsWith(".")) continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|html)$/.test(e)) out.push(p);
  }
  return out;
}
let bad = 0;
for (const f of walk(".")) {
  if (f.endsWith(SELF)) continue;
  const t = readFileSync(f, "utf8");
  for (const [name, re] of [["version", reVer], ["cache-name", reCache]]) {
    const m = t.match(re);
    if (m) { console.error(`DRIFT: ${f} hardcodes ${name} "${m[0]}" — read it from version.js instead`); bad++; }
  }
}
console.log(bad ? `\n${bad} drift issue(s).` : "OK — version lives only in version.js.");
process.exit(bad ? 1 : 0);
