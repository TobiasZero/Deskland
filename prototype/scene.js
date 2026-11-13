'use strict';
/* ======================================================================
   Deskland · 场景引擎（Canvas 2D）
   ----------------------------------------------------------------------
   每个主题页面 = 本文件 + scenes/<场景>.js + <主题>.html。
   引擎负责：画布/尺寸、图标数据（宿主或设置页发来）、图标距离场、
   静态图层缓存与淡入、暂停、30fps、参数、以及分享脚本要用的全局量。
   场景只负责画：paintStatic(g, e) 画静态图层（缓存），paint(g, e) 画每帧动画。

   图标距离场 field：每个采样点到最近图标（外扩 sigma）的距离，图标里为负。
   场景用它来决定"哪里可以画海水/熔岩/树/房子"，图标周围留出一块空地。
   ====================================================================== */

const QS = new URLSearchParams(location.search);
const WALL = QS.has('wallpaper');      // 壁纸模式：桌面宿主加载，消息来自 WebView2
const PREVIEW = QS.has('preview');     // 预览模式：设置窗口里的 iframe，消息来自父页面
const SHOT = QS.has('shot');           // 截图/缩略图：只画风景，不画图标方块

const TASKBAR = 48;                    // 分享脚本排版演示图标时要用
const CELL_W = 76, CELL_H = 100, GRID_X0 = 4, GRID_Y0 = 6;
const MORPH_MS = 1000;                 // 图标变化后，新旧静态图层交叉淡入的时长

const cv = document.getElementById('art');
const ctx = cv.getContext('2d', { alpha: false });
let W = innerWidth, H = innerHeight;
let icons = [];
let paused = false, frameN = 0, clock = 0, lastTs = 0, lastPaint = 0;
var cacheOK = true;                    // share.js 会读写：表示"静态图层缓存可以作废"
let needsPaint = true;
let SCENE = null, P = {}, DEFAULTS = {};
let curStatic = null, prevStatic = null, stDirty = true, stT0 = -1e9;
let lastStaticMs = 0;
const ST_DEBOUNCE = 70;       // 拖动滑块时静态图层最多每 70ms 重画一次
let stDue = 0;
function markStatic() {
  stDirty = true;
  stDue = performance.now() + ST_DEBOUNCE;
  needsPaint = true;
  // 暂停时没有循环帧：等去抖时间到了主动补一帧
  clearTimeout(markStatic.timer);
  markStatic.timer = setTimeout(() => { needsPaint = true; }, ST_DEBOUNCE + 10);
}
const Engine = { seed: 1, field: null, clusters: [], st: {} };
const SCENES = window.SCENES || (window.SCENES = {});

/* ======================================================================
   画笔工具（所有场景共用）
   ====================================================================== */
const U = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  smooth(t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
  easeInOut(t) { t = U.clamp(t, 0, 1); return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },

  // 固定种子的随机数（每次重画静态图层都得到同一张画）
  rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  // 平铺值噪声 + 分形叠加
  noise(seed) {
    const h = (x, y) => {
      let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2246822519);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const s = t => t * t * (3 - 2 * t);
    const n = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = s(x - ix), fy = s(y - iy);
      const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    const fbm = (x, y, o = 4) => {
      let v = 0, amp = .5, f = 1;
      for (let i = 0; i < o; i++) { v += n(x * f, y * f) * amp; f *= 2; amp *= .5; }
      return v;
    };
    return { n, fbm };
  },

  rgba(hex, a) {
    if (hex[0] !== '#') return hex;
    let s = hex.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s, 16);
    return 'rgba(' + (v >> 16 & 255) + ',' + (v >> 8 & 255) + ',' + (v & 255) + ',' + a + ')';
  },
  shade(hex, f) {
    let s = hex.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s, 16);
    const c = (k) => U.clamp(Math.round((v >> k & 255) * f), 0, 255);
    return 'rgb(' + c(16) + ',' + c(8) + ',' + c(0) + ')';
  },
  mix(a, b, t) {
    const pa = U.rgb(a), pb = U.rgb(b);
    return 'rgb(' + Math.round(U.lerp(pa[0], pb[0], t)) + ',' + Math.round(U.lerp(pa[1], pb[1], t)) + ',' +
      Math.round(U.lerp(pa[2], pb[2], t)) + ')';
  },
  rgb(hex) {
    // 支持 #rgb / #rrggbb / rgb(...) / rgba(...)：场景里经常把 mix 出来的颜色再混一次
    if (hex[0] !== '#') {
      const m = String(hex).match(/-?\d+(\.\d+)?/g);
      return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
    }
    let s = hex.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s, 16);
    return [v >> 16 & 255, v >> 8 & 255, v & 255];
  },

  // Catmull-Rom 平滑：把折线变成密集的曲线点（火焰、河流、树枝、海岸都用得上）
  spline(pts, perSeg) {
    const n = pts.length;
    if (n < 2) return pts.slice();
    perSeg = perSeg || 8;
    const out = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let s = 0; s < perSeg; s++) {
        const t = s / perSeg, t2 = t * t, t3 = t2 * t;
        out.push([
          .5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(pts[n - 1]);
    return out;
  },
  // 经过这些点的柔和闭合曲线（半径中点做二次贝塞尔）
  smoothClosed(g, pts) {
    const n = pts.length;
    if (!n) return;
    if (n < 3) { g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[n - 1][0], pts[n - 1][1]); return; }
    g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    g.closePath();
  },
  // 不规则的圆/椭圆（水彩块、树冠、云朵）。会新开一个路径。
  blob(g, cx, cy, rx, ry, n, jit, rng) {
    g.beginPath();
    U.blobAdd(g, cx, cy, rx, ry, n, jit, rng);
  },
  // 往当前路径里加一团（几团拼成一个形状时用）
  blobAdd(g, cx, cy, rx, ry, n, jit, rng) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, k = 1 + (rng() * 2 - 1) * jit;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    U.smoothClosed(g, pts);
  },
  // 软边的椭圆（渐变到透明）：雾、云影、光晕、水下阴影
  softEllipse(g, cx, cy, rx, ry, color, alpha, inner) {
    g.save();
    g.translate(cx, cy);
    g.scale(1, Math.max(.001, ry / rx));
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, rx));
    gr.addColorStop(0, U.rgba(color, alpha));
    gr.addColorStop(inner == null ? .62 : inner, U.rgba(color, alpha * .55));
    gr.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, Math.max(1, rx), 0, Math.PI * 2); g.fill();
    g.restore();
  },
  glow(g, cx, cy, r, color, alpha) {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
    gr.addColorStop(0, U.rgba(color, alpha));
    gr.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  },
  strokePts(g, pts, close) {
    if (!pts.length) return;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (close) g.closePath();
  },
  dashed(g, pts, color, width, dash, offset) {
    g.save();
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
    g.setLineDash(dash || [6, 7]); if (offset) g.lineDashOffset = offset;
    U.strokePts(g, pts); g.stroke();
    g.restore();
  },
  // 平行细线（地图的阴影线 / 木纹 / 海面斜纹）
  hatch(g, x0, y0, x1, y1, spacing, angle, color, alpha, width) {
    g.save();
    g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = width || 1;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.hypot(x1 - x0, y1 - y0) / 2 + spacing;
    const dx = Math.cos(angle) * r, dy = Math.sin(angle) * r;
    g.beginPath();
    for (let d = -r; d <= r; d += spacing) {
      g.moveTo(cx + Math.cos(angle + Math.PI / 2) * d - dx, cy + Math.sin(angle + Math.PI / 2) * d - dy);
      g.lineTo(cx + Math.cos(angle + Math.PI / 2) * d + dx, cy + Math.sin(angle + Math.PI / 2) * d + dy);
    }
    g.stroke();
    g.restore();
  },
  // 纸张颗粒（一次画满整张静态图层）
  grain(g, w, h, alpha) {
    if (!U._grain) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const cc = c.getContext('2d'), img = cc.createImageData(128, 128), r = U.rng(20261113);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 96 + (r() * 128) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      cc.putImageData(img, 0, 0);
      U._grain = c;
    }
    g.save();
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = alpha;
    g.fillStyle = g.createPattern(U._grain, 'repeat');
    g.fillRect(0, 0, w, h);
    g.restore();
  },
  // 水彩纸底：底色 + 几团淡色晕染 + 颗粒
  paper(g, w, h, base, spots, seed) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = U.rng(seed || 7);
    for (const [color, alpha, n] of spots) {
      for (let i = 0; i < n; i++)
        U.softEllipse(g, r() * w, r() * h, (0.08 + r() * 0.3) * w, (0.08 + r() * 0.28) * h, color, alpha, .3);
    }
  },
  vignette(g, w, h, color, alpha) {
    const gr = g.createRadialGradient(w / 2, h * .46, Math.min(w, h) * .28, w / 2, h * .5, Math.hypot(w, h) * .62);
    gr.addColorStop(0, U.rgba(color, 0));
    gr.addColorStop(1, U.rgba(color, alpha));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  },
  // 在一个临时图层上画，再按 holes 挖掉图标底下的部分，最后贴回 g。
  // （不能用 clip('evenodd')：图标当洞时，洞和洞重叠的地方会因为奇偶抵消而重新露出来，出现碎裂的楔形。）
  mask(g, drawFn, holes) {
    const c = document.createElement('canvas');
    c.width = g.canvas.width; c.height = g.canvas.height;
    const cg = c.getContext('2d');
    cg.setTransform(g.getTransform());
    drawFn(cg);
    if (holes && holes.length) {
      cg.globalCompositeOperation = 'destination-out';
      cg.beginPath();
      for (const h of holes) U.blobAdd(cg, h.cx, h.cy, h.rx, h.ry, 10, h.jit == null ? .14 : h.jit, h.rng);
      cg.fill();
      cg.globalCompositeOperation = 'source-over';
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, 0, 0);
    g.restore();
  },
  // 圆角矩形路径（图标、卡片）
  roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  },
  // 平涂多边形（山、房子、屋顶、石头）
  poly(g, pts, fill) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
  },
  // 圆润的闭合多边形（树冠、岛、云团）
  smoothPoly(g, pts, fill) {
    const n = pts.length;
    g.beginPath();
    g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
  },
  // 一朵平涂的积云：暗的底边 + 亮的云顶
  cloud(g, x, y, w, h, fill, shade) {
    const r = Math.max(2, h / 2);
    const shape = (dy, k) => {
      g.beginPath();
      g.moveTo(x - w / 2 + r, y + r * .5);
      g.arc(x - w * .26, y - r * .1 + dy, r * k, Math.PI, 0);
      g.arc(x + w * .06, y - r * .45 + dy, r * 1.35 * k, Math.PI, 0);
      g.arc(x + w * .38, y - r * .05 + dy, r * .85 * k, Math.PI, 0);
      g.closePath();
    };
    shape(r * .3, 1.02); g.fillStyle = shade || fill; g.fill();
    shape(0, .95); g.fillStyle = fill; g.fill();
  },
  // 图标底下的"洞"：需要绕开图标的东西用它（配合 U.mask）
  iconHoles(e, grow) {
    return e.icons.map((ic, i) => ({
      cx: ic.x + ic.w / 2, cy: ic.y + ic.h / 2,
      rx: ic.w * .54 + e.P.sigma * grow, ry: ic.h * .56 + e.P.sigma * grow * .9,
      rng: U.rng((e.seed ^ ((i + 1) * 2654435761)) >>> 0)
    }));
  }
};

/* ======================================================================
   图标：距离场 / 聚簇 / 空地方块
   ====================================================================== */
function buildField() {
  const cell = 6, sigma = Math.max(8, +P.sigma || 80);
  const cols = Math.ceil(W / cell) + 2, rows = Math.ceil(H / cell) + 2;
  const f = new Float32Array(cols * rows).fill(1e4);
  const rr = 12;
  for (const ic of icons) {
    const pad = sigma + 14;
    const i0 = Math.max(0, Math.floor((ic.x - pad) / cell)), i1 = Math.min(cols - 2, Math.ceil((ic.x + ic.w + pad) / cell));
    const j0 = Math.max(0, Math.floor((ic.y - pad) / cell)), j1 = Math.min(rows - 2, Math.ceil((ic.y + ic.h + pad) / cell));
    const cx = ic.x + ic.w / 2, cy = ic.y + ic.h / 2, hw = ic.w / 2, hh = ic.h / 2;
    for (let j = j0; j <= j1; j++) {
      const py = j * cell - cy;
      for (let i = i0; i <= i1; i++) {
        const px = i * cell - cx;
        const qx = Math.abs(px) - hw + rr, qy = Math.abs(py) - hh + rr;
        const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr - sigma;
        const k = j * cols + i;
        if (d < f[k]) f[k] = d;
      }
    }
  }
  Engine.field = {
    f, cols, rows, cell, sigma,
    at(x, y) {
      const gx = U.clamp(x / cell, 0, cols - 1.001), gy = U.clamp(y / cell, 0, rows - 1.001);
      const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, c = cols;
      const a = f[j * c + i], b = f[j * c + i + 1], d = f[(j + 1) * c + i], e = f[(j + 1) * c + i + 1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
    }
  };
}
function buildClusters() {
  const n = icons.length, parent = new Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const pad = 30;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = icons[i], b = icons[j];
    if (a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad) uni(i, j);
  }
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!map.has(r)) map.set(r, { members: [] });
    map.get(r).members.push(icons[i]);
  }
  Engine.clusters = [...map.values()].map(c => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const ic of c.members) {
      x0 = Math.min(x0, ic.x); y0 = Math.min(y0, ic.y);
      x1 = Math.max(x1, ic.x + ic.w); y1 = Math.max(y1, ic.y + ic.h);
    }
    return { members: c.members, x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
      w: x1 - x0, h: y1 - y0, r: Math.hypot(x1 - x0, y1 - y0) / 2, n: c.members.length };
  });
}
// 图标周围的一块空地：每个图标一团不规则椭圆，重叠的连成一片（nonzero 填充）
function iconBlobs(g, grow, jit, rng, only) {
  g.beginPath();
  for (const ic of (only || icons)) {
    const rx = ic.w / 2 + grow, ry = ic.h / 2 + grow;
    U.blobAdd(g, ic.x + ic.w / 2, ic.y + ic.h / 2, rx, ry, 10, jit, rng);
  }
}
function onIcons() {
  buildClusters();
  buildField();
  markStatic();
  if (SCENE && SCENE.onIcons) { try { SCENE.onIcons(makeEnv(clock, true)); } catch (e) { console.error(e); } }
}

/* ======================================================================
   画面：静态图层缓存 + 每帧动画
   ====================================================================== */
function makeEnv(t, forStatic) {
  return {
    W, H, P, icons, clusters: Engine.clusters, field: Engine.field, t,
    seed: Engine.seed, rng: U.rng((Engine.seed + 0x9E3779B9) >>> 0),
    noise: U.noise(Engine.seed), st: Engine.st, U, forStatic
  };
}
function rebuildStatic() {
  const cw = Math.max(1, cv.width), ch = Math.max(1, cv.height);
  const t0 = performance.now();
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  g.setTransform(cw / W, 0, 0, ch / H, 0, 0);
  try { SCENE.paintStatic(g, makeEnv(0, true)); }
  catch (err) { console.error('paintStatic 失败', err); }
  // 画布尺寸变了（窗口缩放、分享时临时放大）就不做交叉淡入：两层大小不同，直接换新的一层
  prevStatic = (curStatic && curStatic.width === cw && curStatic.height === ch) ? curStatic : null;
  curStatic = c;
  stT0 = performance.now();
  stDirty = false;
  lastStaticMs = performance.now() - t0;
}
function draw(now) {
  if (!SCENE) return;
  frameN++;
  // 尺寸变了必须马上重画；图标/参数变化先等 70ms（连续拖动时不会每帧都重画整张静态图层）
  if (!curStatic || curStatic.width !== cv.width || curStatic.height !== cv.height) rebuildStatic();
  else if (stDirty && performance.now() >= stDue) rebuildStatic();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const morph = prevStatic ? U.clamp((now - stT0) / MORPH_MS, 0, 1) : 1;
  if (morph < 1) {
    ctx.drawImage(prevStatic, 0, 0);
    ctx.globalAlpha = U.easeInOut(morph);
    ctx.drawImage(curStatic, 0, 0);
    ctx.globalAlpha = 1;
    if (morph > .985) prevStatic = null;
  } else {
    ctx.drawImage(curStatic, 0, 0);
    if (prevStatic) prevStatic = null;
  }
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  if (SCENE.paint) { try { SCENE.paint(ctx, makeEnv(clock, false)); } catch (err) { console.error('paint 失败', err); } }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = lastTs ? Math.min((now - lastTs) / 1000, .1) : .016;
  lastTs = now;
  if (!paused) {
    clock += dt;
    if (now - lastPaint < 31 && !needsPaint) return;   // 核显 30fps
  } else if (!needsPaint) {
    if (stDirty && now >= stDue) needsPaint = true;    // 暂停时图标/参数变了，也要补上那一帧
    else return;
  }
  needsPaint = false;
  lastPaint = now;
  draw(now);
}

/* ======================================================================
   参数 / 图标消息 / 宿主协议
   ====================================================================== */
function applySettings(v) {
  let changed = false;
  if (typeof v.seed === 'number' && v.seed !== P.seed) {
    P.seed = v.seed; Engine.seed = v.seed; Engine.st = {}; changed = true;
  }
  for (const k in v) {
    if (k === 'seed' || !(k in DEFAULTS)) continue;
    if (typeof v[k] !== typeof DEFAULTS[k] || P[k] === v[k]) continue;
    P[k] = v[k]; changed = true;
  }
  if (changed) {
    buildField();
    markStatic();
    if (SCENE.onParams) { try { SCENE.onParams(makeEnv(clock, true)); } catch (e) { console.error(e); } }
  }
}
function handleMessage(m) {
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
  if (!m) return;
  if (m.t === 'pause') { paused = PREVIEW ? false : !!m.v; needsPaint = true; return; }
  if (m.t === 'settings') { applySettings(m.v || {}); return; }
  if (m.t === 'reset') { applySettings(Object.assign({}, DEFAULTS)); return; }
  if (m.t !== 'icons') return;
  const k = window.devicePixelRatio || 1;
  icons = m.vis ? m.r.map(([l, t, r, b]) => ({ x: l / k, y: t / k, w: (r - l) / k, h: (b - t) / k })) : [];
  onIcons();
  if (PREVIEW) drawGhosts();
}
function drawGhosts() {
  if (SHOT) return;
  let box = document.getElementById('ghosts');
  if (!box) { box = document.createElement('div'); box.id = 'ghosts'; document.body.appendChild(box); }
  box.innerHTML = icons.map(ic => `<div class="ghost" style="left:${ic.x}px;top:${ic.y}px;width:${ic.w}px;height:${ic.h}px"><i></i><b></b></div>`).join('');
}
function demoIcons() {
  const out = [];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 9; r++) {
    if (c === 3 && r > 5) continue;
    out.push({ x: GRID_X0 + c * CELL_W, y: GRID_Y0 + r * CELL_H, w: CELL_W, h: 92 });
  }
  for (const [c, r] of [[5, 1], [6, 1], [9, 0], [10, 0], [10, 1], [13, 2], [14, 2], [13, 3], [14, 3], [17, 4], [18, 4], [17, 5], [18, 5], [20, 0]]) {
    out.push({ x: GRID_X0 + c * CELL_W, y: GRID_Y0 + r * CELL_H, w: CELL_W, h: 92 });
  }
  return out;
}
function startHosted() {
  document.body.classList.add('wall');
  if (PREVIEW) {
    document.body.classList.add('preview');
    addEventListener('message', ev => {
      if (ev.source !== parent) return;
      handleMessage(typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data);
    });
    parent.postMessage(JSON.stringify({ t: 'ready' }), '*');
    return;
  }
  const host = window.chrome && window.chrome.webview;
  if (!host) return;
  host.addEventListener('message', ev => handleMessage(ev.data));
  host.postMessage('ready');
}
function startDemo() {
  icons = demoIcons();
  buildClusters(); buildField();
  drawGhosts();
  document.body.classList.add('preview');
  markStatic();
}
function resize() {
  W = innerWidth; H = innerHeight;
  const box = cv.getBoundingClientRect();
  const bw = box.width || W, bh = box.height || H;
  // 预览：页面按整块桌面的尺寸排版再整体缩小，画布只要很低的分辨率
  let s = PREVIEW ? .42 : Math.min(window.devicePixelRatio || 1, 2);
  s = Math.min(s, Math.sqrt(4.2e6 / Math.max(1, bw * bh)));   // 静态图层最多约 420 万像素
  cv.width = Math.round(bw * s); cv.height = Math.round(bh * s); cv._scale = s;
  markStatic();
  if (SCENE && SCENE.onResize) { try { SCENE.onResize(); } catch (e) { console.error(e); } }
}
addEventListener('resize', resize);

const Deskland = {
  boot(scene) {
    SCENE = scene;
    DEFAULTS = Object.assign({ sigma: 90 }, scene.defaults || {});
    P = Object.assign({}, DEFAULTS);
    if (typeof P.seed !== 'number') P.seed = (Math.random() * 1e6) | 0;
    Engine.seed = P.seed;
    Engine.st = {};
    if (scene.title) document.title = 'Deskland · ' + scene.title;
    resize();
    buildClusters(); buildField();
    if (WALL || PREVIEW) startHosted();
    else startDemo();
    requestAnimationFrame(loop);
  },
  scene: () => SCENE,
  icons: () => icons,
  // 调试/自检用：已经画了多少帧、静态图层用了多久、画布多大
  stats: () => ({ frames: frameN, clock: +clock.toFixed(1), staticMs: +lastStaticMs.toFixed(1),
    scale: cv._scale, w: cv.width, h: cv.height, icons: icons.length })
};
window.Deskland = Deskland;

// share.js 在离线演示录像时会让主题重算图标场
function commit() { onIcons(); }
