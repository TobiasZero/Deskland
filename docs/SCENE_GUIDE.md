# Deskland · Theme scene guide (for scene authors)

This fork adds **unlocked themes implemented from scratch**. The engine (`prototype/scene.js`)
draws every theme with Canvas 2D. A theme page = `scene.js` + one scene file + a tiny HTML page.

Read these first (do not modify them):

- `prototype/scene.js` — engine, globals, helpers (`U`)
- `prototype/scenes/volcano.js` — **reference scene** (quality + style bar)
- `prototype/volcano.html` — page template
- `prototype/scene.css` — canvas / preview-ghost styles
- `prototype/share.js` — needs the globals the engine already provides (nothing to do in scenes)
- `prototype/flat.html`, `prototype/meadow.html` — the original art direction (flat illustration + grain)

## Scene contract

```js
SCENES['my-theme'] = {
  title: 'My theme',                 // used for document.title
  defaults: { sigma: 70, ... },      // MUST match the params agreed below
  paintStatic(g, e) { ... },         // cached layer, deterministic, may be slow (~100ms)
  paint(g, e) { ... }                // every frame at 30fps, cheap
};
```

`e` = `{ W, H, P, icons, clusters, field, t, seed, rng, noise, st, U, forStatic }`

- `W, H`: logical (CSS) pixels. Draw in this space; the engine handles DPR.
- `P`: live params (`P.sigma`, theme keys).
- `icons`: `[{x, y, w, h}]` icon rects in CSS px; `clusters`: merged icon groups
  `{members, x0, y0, x1, y1, cx, cy, w, h, r, n}`. They are the anchors the scenery adapts to.
- `field.at(x, y)`: distance to the nearest icon clearing (< 0 inside), distance grows outward.
- `t`: seconds (frozen while paused). `seed`: number. `rng()`: seeded random (same sequence on
  every static repaint). `noise.fbm(x, y)`: smooth noise. `st`: persistent object for your scene
  (reset when the seed changes — do not put per-frame allocations there).
- `U`: helpers (see below).

The engine caches `paintStatic` into an offscreen canvas, cross-fades on icon changes and pauses,
handles preview/wallpaper messages, DPR and fps. **Never** create canvases or big gradients per frame.

## Helpers (`U`)

`clamp lerp smooth easeInOut rng noise rgba shade mix rgb spline` ·
`blob(g,cx,cy,rx,ry,n,jit,rng)` (starts a new path) · `blobAdd(...)` (adds to current path) ·
`smoothClosed` · `softEllipse` · `glow` · `strokePts` · `dashed` · `hatch` · `grain` · `paper` ·
`vignette` · `mask(g, drawFn, holes)` · `iconHoles(e, grow)` · `poly` · `smoothPoly` · `cloud`.

- **Avoid icons**: `U.mask(g, cg => { ...draw... }, U.iconHoles(e, .6))` draws on a scratch layer and
  erases the icon areas (use grow ≈ 0.4–0.8 × sigma). Do **not** use `clip('evenodd')` for icon holes.
- **Clouds / islands around icons**: one path, `U.blobAdd` for every icon, then one `fill()` — this
  gives a merged organic shape with no alpha seams.
- **Path accumulation**: always `beginPath()` before a standalone fill; use `blobAdd` only when
  deliberately merging shapes into one fill.

## Art direction (must match the repo)

Flat illustration: 3–6 flat colors per scene, crisp silhouettes, painterly grain on top
(`U.grain`), soft vignette. **No** giant blurred ellipses as "clearing", no muddy airbrush.
Details come from many small flat shapes (rocks, grass, petals, leaves, hatching), not from
large gradients. Keep icon labels readable: either a much lighter "desk" area (island, plaza,
cloud) or a very subtle light halo (alpha ≤ 0.06).

Per-frame animation must be cheap: a few dozen sprites/shapes, no text, no new gradients per
particle. Static layer handles all heavy geometry. `paint()` should only animate: clouds drifting,
water shimmer, petals, fish, smoke, traffic, twinkling.

## Params (exact keys and defaults — themes.json is generated from these)

Every scene has `sigma` (distance of the scenery from the icons) as first parameter.

| theme id | title | params |
| --- | --- | --- |
| `beach-turquoise` | 马尔代夫 | `sigma` 70, `fish` .6, `reef` .6, `palms` 4 |
| `lake` | 湖泊 | `sigma` 80, `reeds` .5, `ducks` 2, `wind` 1 |
| `lotus` | 荷塘 | `sigma` 65, `koi` 6, `pads` .8, `bloom` .6 |
| `sky` | 天空 | `sigma` 90, `cover` .55, `drift` 1, `time` 0 (0 day / 1 dusk / 2 night) |
| `ocean` | 大海 | `sigma` 85, `cover` .6, `drift` 1, `boats` 2 |
| `forest` | 森林 | `sigma` 80, `trees` .7, `wind` 1, `leaves` .5 |
| `pinkforest` | 粉色森林 | `sigma` 80, `trees` .7, `wind` 1, `petals` .6 |
| `map` | 手绘城市 | `sigma` 60, `houses` .7, `traffic` 2, `age` .5 |
| `citymap` | 彩色城市 | `sigma` 60, `houses` .7, `traffic` 2, `color` .8 |
| `worldmap` | 老地图 | `sigma` 70, `towns` .6, `wagons` 2, `age` .6 |
| `nauticalmap` | 航海地图 | `sigma` 70, `ships` 3, `depth` .6, `age` .5 |

## Page template

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deskland · NAME</title>
<link rel="stylesheet" href="scene.css">
</head>
<body>
<canvas id="art"></canvas>
<script src="scene.js"></script>
<script src="scenes/FILE.js"></script>
<script>Deskland.boot(SCENES['ID']);</script>
<script src="share.js"></script>
</body>
</html>
```

## Verify visually (mandatory)

```powershell
$chrome='C:\Program Files\Google\Chrome\Application\chrome.exe'
& $chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
  --window-size=1400,880 --virtual-time-budget=4000 `
  --screenshot="$PWD\shot-ID.png" --user-data-dir="$env:TEMP\dl-UNIQUE" `
  "file:///C:/.../prototype/ID.html?shot=1"
```

`?shot=1` hides the preview ghost boxes; icons are still present so the adapted shapes show.
The screenshot has a black strip at the bottom (window vs viewport) — ignore it.
Open the PNG with the image reader, critique it, fix, repeat 2–3 times. Also test `time` variants
(sky) and a night/dusk variant where it makes sense.

Check `node --check scenes/FILE.js` after every edit.

## Rules

- Only create/edit **your assigned files** (scene file + your theme pages). Never touch
  `scene.js`, `scene.css`, `themes.json`, `settings.html`, `share.js`, other agents' files.
- No network resources, no external assets, no fonts, no text as UI. Everything procedural.
- Chinese comments, concise code, no dependencies.
- Keep 30fps: static layer cached, animation cheap.
- Report back: files, per-theme params (already fixed above), screenshot paths, what you would improve.
