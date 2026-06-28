# Bingkai — Verification Report & Real-Device Checklist (P7)

Single-file photo framing / crop / collage / seamless-carousel PWA, Android-first,
Bahasa Indonesia UI. This document records **what is verified**, **how**, and
**what cannot be verified in the build sandbox** and must be checked on a real
Android device before relying on the app.

---

## 1. What ships

| File | Role | Lines |
|---|---|---|
| `index.html` | The entire app (inline CSS/JS, no build step, no bundler) | ~2090 |
| `sw.js` | Service worker (app-shell offline cache) — the **only** sidecar | ~61 |

The manifest is **inlined** as a data-URI with an inline SVG maskable icon, so it
is not a separate file. A service worker physically cannot be inlined (a Blob-URL
SW cannot control page navigations), so `sw.js` is required for offline install.
Deploy both files to the same folder on GitHub Pages (HTTPS).

`geometryCore.js` + `geometryCore.test.js` are the **development** copies of the
pure math and its Node tests. The same functions are inlined byte-for-byte inside
`index.html`; the standalone files exist so the math can be re-tested in Node.

---

## 2. Verified (automated)

### 2.1 Geometry core — Node unit tests (`node --test`), **15/15 pass**
Pure, DOM-free functions, tested over tens of thousands of randomized cases:

- **Aspect-fit frame**: vertical frame thickness = `margin + letterbox/2`, exact; filled-axis thickness = `margin`, exact.
- **Crop (locked)**: box always ⊆ source; aspect exact; clamping at extremes.
- **Focal-point zoom** (`cropZoomAboutPoint`): the source point under the pinch stays fixed (away from edges); result box ⊆ source; aspect exact.
- **Collage tiling** (`computeCollageLayout`): cells + gutters tile the canvas with **exact** gutters, zero overlap, integer pixels; rejects impossible layouts.
- **Carousel boundaries** (`computeCarouselBoundaries`): `b[0]=0`, `b[N]=Wc`, strictly increasing, widths sum to `Wc`, max width diff ≤1 — for N=2..10 incl. **odd `Wc`**.
- **canvas/ratio/fill** helpers and **filename order** (`seamless_01..0N`).

### 2.2 Integration tests — headless Chromium (Playwright), **7/7 pass**
Each renders real pixels and decodes the real output blob:

| Test | What it proves |
|---|---|
| P2 smoke | Import + EXIF-orientation decode path + two-res downscale (4000px → 2048 work bitmap) + stage paints |
| P3 export | Frame export = **1080×1350 sRGB JPEG**; white frame thickness in **exported pixels** matches the geometry math (351px top / 54px left) |
| P3b crop | Cropped quadrant exports the correct region (color probe); 1080×1080 JPEG; focal-zoom stable in-page |
| P4 collage | 2×2: each exported cell center = its source color; gutter color present; swap exchanges cells; 1080×1080 JPEG |
| P5 carousel | **Seamless**: independently-rendered tiles equal the composite slices at every boundary (no gap/overlap/shift); equal 1080-wide tiles; ZIP fallback valid (PK, N entries in order); share path delivers N files in order |
| P6 PWA | Inline manifest valid; **SW controls the page**; settings persist across reload (controls re-sync); presets save/apply/delete; **server killed + offline → app still boots from cache** |
| P7 e2e | Full journey Import → Frame → Crop → Collage → Carousel → preset → offline; every export decoded to correct dimensions/format/order |

---

## 3. NOT verifiable in the sandbox — check on a real Android device

These are not failures; they are things headless Chromium on a server cannot
exercise. Test each on the target phone (Android Chrome **and** Samsung Internet).

### 3.1 EXIF orientation on a real Lightroom JPEG — **HIGH priority**
The code uses `createImageBitmap(blob, { imageOrientation: 'from-image' })`. The
capability flag is true and the decode path runs, but synthetic canvas JPEGs carry
no EXIF orientation tag. **Test:** export a portrait photo from Lightroom with
Orientation 6 or 8 (rotated), import it, confirm it appears upright (not sideways).
If wrong, the fallback `createImageBitmap(blob)` ran — investigate.

### 3.2 `navigator.share({ files })` into Instagram — **HIGH priority**
The share-sheet path is wired and the file array is built correctly, but whether
Android actually hands the file(s) to the Instagram app is device/OS-dependent.
**Test:** Frame export → does the share sheet appear and list Instagram? Carousel
export → does it share **all N tiles** in order? On failure it falls back to
Downloads (single) or a ZIP (carousel) — confirm those too.

### 3.3 Multi-touch pinch / drag — **MEDIUM**
Crop zoom, collage per-cell pan/zoom + drag-to-reorder, and carousel swipe were
verified at the **logic/state** level only. **Test on glass:** pinch-zoom in crop;
in collage, tap a cell then drag onto another to swap (vs. drag within a cell to
pan); swipe the carousel and confirm it snaps per tile.

### 3.4 PWA install — **MEDIUM**
`beforeinstallprompt` does not fire in headless. **Test:** Add-to-Home-Screen on
Android Chrome and on **Samsung Internet** (which historically blocks install from
`content://` — that was the reason for HTTPS hosting). Confirm the install button
appears, the app installs, and launches standalone (no browser chrome).

### 3.5 Large-image memory ceiling — **MEDIUM**
The two-resolution pipeline keeps one downscaled preview bitmap, but **all full-res
source bitmaps stay resident** (needed for collage/export). **Test:** import several
24–48 MP photos and build a 3×3 collage; watch for tab crashes / out-of-memory,
especially on Samsung Internet. If it crashes, the mitigation is a per-cell working
bitmap cache (noted in code).

### 3.6 JSZip first-online-load — **LOW**
JSZip is lazy-loaded from `cdn.jsdelivr.net` on first carousel export and precached
by the SW. The CDN is blocked in the sandbox, so the actual fetch is unproven here.
**Test:** carousel export **online once** (when share is unavailable, e.g. desktop)
→ ZIP downloads; then offline → ZIP still works (served from SW cache).

### 3.7 sRGB color conversion on wide-gamut sources — **LOW**
Drawing onto a 2D canvas converts to sRGB (canvas default color space), which is
why exports normalize P3/AdobeRGB to sRGB. The exact rendering intent on a
wide-gamut display is browser-managed and not byte-verifiable. **Test:** export a
vivid P3 photo, post to Instagram, confirm colors are not dulled/over-saturated.

---

## 4. Instagram quality notes (baked into the app)

- **Width pinned to 1080** in the "Instagram 1080" profile → IG performs **no
  dimensional resize**, only one re-encode. This is the single biggest quality lever.
- **Carousel tiles forced to exactly 1080 each** (`Wc = N×1080`) so IG does not
  resize individual tiles and break the seam.
- **JPEG q0.92** default — high enough that your compression adds no visible
  artifacts before IG's pass; tunable 70–95.
- **sRGB** output (canvas-managed) fixes the most common "IG dulled my colors" issue.
- **No silent upscaling**: exporting a source narrower than 1080 shows a warning.
- **PNG** offered only for flat-color/text designs; IG re-JPEGs photos anyway.

You cannot beat IG's server-side recompression ceiling — the app's job is to avoid
making it work harder (no resize, correct color space, clean source), and it does.

---

## 5. Known deliberate scope limits (v1)

- **No free-form (corner-drag) crop** — "Asli" (original ratio) covers zoom/pan within native framing. Corner-handle cropping is a separate interaction for a later version.
- **Collage/carousel draw from full-res source bitmaps** (not per-cell working bitmaps) — simpler, fine for a handful of photos; see 3.5.
- **`fit` mode pads with black**, not yet configurable.
- **Color grading / filters out of scope** (done in Lightroom upstream).
- SW uses `skipWaiting` + `clients.claim`: updates apply on next load (no stale-version limbo), which is the right tradeoff for a personal tool.

---

## 6. How to re-run the tests

```
# pure geometry (no browser)
node --test

# integration (headless Chromium; some serve a local http server for the SW)
node p2.smoke.js
node p3.export.js
node p3b.crop.js
node p4.collage.js
node p5.carousel.js     # needs _jszip.min.js present (dev-only helper)
node p6.pwa.js
node e2e.js
```
