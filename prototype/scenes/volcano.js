'use strict';
/* ======================================================================
   Deskland · 火山（白天 / 夜晚）
   扁平插画：天空、远山、火山锥、火山灰原、一条横穿前景的熔岩河。
   图标坐在柔和的火山灰斑上；熔岩和裂缝遇到图标会绕开。
   ====================================================================== */
(function () {
  const PAL = {
    day: {
      sky: ['#ffe9d6', '#fbd2b8', '#f2b3a1', '#e39a94'],
      sun: '#fff7e0', sunRing: '#ffd7a0',
      cloud: '#fde8da', cloudShade: '#eec6b6',
      rangeFar: '#c4929a', rangeMid: '#a3707c',
      body: '#4a3039', bodyDark: '#36222b', bodyLight: '#5c3b45', bodyEdge: '#281923',
      crater: '#ff9430', craterHot: '#ffd77e',
      ground: '#3a2930', ashBand: '#59434e', ash: '#6d555e', ashSoft: '#7d6570',
      fore: '#1c131a', ink: '#231720',
      lava: '#ff7a1f', lavaHot: '#ffd166', lavaFaint: '#ffab52', crust: '#3d1a17',
      smoke: '#7b656e', smokeLight: '#9a838c', smokeDark: '#5c4a55',
      haze: '#f5c6af', bird: '#3e2b35', grain: .07, vig: .20, vignette: '#2a1a20'
    },
    night: {
      sky: ['#06070f', '#0c0c1c', '#191326', '#38202c'],
      sun: '#f4f2ff', sunRing: '#aab6ff',
      cloud: '#241d2d', cloudShade: '#181322',
      rangeFar: '#2b2136', rangeMid: '#1c1524',
      body: '#1c131f', bodyDark: '#120c16', bodyLight: '#2a1b27', bodyEdge: '#08050a',
      crater: '#ff8a24', craterHot: '#ffe4a3',
      ground: '#14111b', ashBand: '#221b2a', ash: '#2f2737', ashSoft: '#3b3145',
      fore: '#07050a', ink: '#0a070d',
      lava: '#ff7d1e', lavaHot: '#ffd97e', lavaFaint: '#ff9c40', crust: '#2b0d0a',
      smoke: '#3b3048', smokeLight: '#4e4159', smokeDark: '#241d2f',
      haze: '#5c2b25', bird: '#0c0a12', grain: .11, vig: .45, vignette: '#05040a'
    }
  };

  /* ---- 基础形状 ---- */
  function poly(g, pts, fill) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
  }
  function cloud(g, x, y, w, h, fill, shade) {
    const r = h / 2;
    const shape = (dy, k) => {
      g.beginPath();
      g.moveTo(x - w / 2 + r, y + r * .5);
      g.arc(x - w * .26, y - r * .1 + dy, r * k, Math.PI, 0);
      g.arc(x + w * .06, y - r * .45 + dy, r * 1.35 * k, Math.PI, 0);
      g.arc(x + w * .38, y - r * .05 + dy, r * .85 * k, Math.PI, 0);
      g.closePath();
    };
    shape(r * .3, 1.02); g.fillStyle = shade; g.fill();
    shape(0, .95); g.fillStyle = fill; g.fill();
  }
  // 在山脊线上按点画线
  function ridgeLine(g, pts, W, H, fill) {
    poly(g, pts.concat([[W, H], [0, H]]), fill);
  }
  // 平滑的多边形边（把折线变成圆润的弧）
  function smoothPoly(g, pts, close) {
    const n = pts.length;
    g.beginPath();
    g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    if (close) g.closePath();
    return g;
  }

  /* ---- 天空 ---- */
  function sky(g, e, mode) {
    const p = PAL[mode], { W, H } = e, hz = H * .61;
    const gr = g.createLinearGradient(0, 0, 0, hz);
    p.sky.forEach((c, i) => gr.addColorStop(i / (p.sky.length - 1), c));
    g.fillStyle = gr; g.fillRect(0, 0, W, hz + 2);

    const sx = W * .805, sy = H * .145, sr = H * .050;
    U.glow(g, sx, sy, H * .20, p.sunRing, mode === 'day' ? .26 : .20);
    g.fillStyle = U.rgba(p.sunRing, .30);
    g.beginPath(); g.arc(sx, sy, sr * 1.45, 0, 7); g.fill();
    g.fillStyle = p.sun; g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill();

    if (mode === 'day') {
      cloud(g, W * .16, H * .115, W * .24, H * .050, p.cloud, p.cloudShade);
      cloud(g, W * .47, H * .075, W * .16, H * .034, p.cloud, p.cloudShade);
      cloud(g, W * .60, H * .215, W * .12, H * .026, p.cloud, p.cloudShade);
      cloud(g, W * .95, H * .27, W * .10, H * .022, p.cloud, p.cloudShade);
    } else {
      const r = e.rng;
      for (let i = 0; i < 300; i++) {
        const x = r() * W, y = r() * H * .64, s = .5 + r() * 1.4;
        g.fillStyle = U.rgba('#ffffff', .2 + r() * .75);
        g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
      }
      g.save(); g.translate(W * .30, H * .16); g.rotate(-.42);
      for (let i = 0; i < 4; i++) U.softEllipse(g, (i - 1.5) * W * .1, 0, W * .25, H * .026, '#b6c2ff', .032, .3);
      g.restore();
    }
    const haze = g.createLinearGradient(0, H * .46, 0, H * .64);
    haze.addColorStop(0, U.rgba(p.haze, 0));
    haze.addColorStop(.65, U.rgba(p.haze, mode === 'day' ? .40 : .16));
    haze.addColorStop(1, U.rgba(p.haze, 0));
    g.fillStyle = haze; g.fillRect(0, H * .46, W, H * .18);
  }

  /* ---- 远山 ---- */
  function ranges(g, e, mode) {
    const p = PAL[mode], { W, H } = e;
    const mk = (pts, fill) => ridgeLine(g, pts.map(([x, y]) => [W * x, H * y]), W, H, fill);
    mk([[-.02, .62], [.04, .545], [.10, .562], [.17, .512], [.25, .556], [.33, .527], [.41, .56], [.49, .533],
      [.57, .558], [.65, .52], [.72, .556], [.81, .525], [.89, .552], [.97, .532], [1.02, .62]], p.rangeFar);
    mk([[-.02, .62], [.07, .572], [.14, .59], [.22, .562], [.30, .592], [.38, .57], [.46, .596],
      [.54, .575], [.62, .596], [.70, .572], [.78, .594], [.86, .575], [.94, .594], [1.02, .62]], p.rangeMid);
  }

  /* ---- 火山锥 ---- */
  const VOLC = [
    [-.02, .612], [.16, .592], [.28, .545], [.38, .47], [.455, .372], [.515, .302], [.540, .291],
    [.560, .303], [.578, .294], [.598, .305], [.618, .296], [.640, .308], [.700, .392], [.780, .480],
    [.870, .548], [.960, .590], [1.02, .612]
  ];
  function volcanoBody(g, e, mode) {
    const p = PAL[mode], { W, H } = e;
    const P0 = VOLC.map(([x, y]) => [W * x, H * y]);
    poly(g, P0.concat([[W, H], [0, H]]), p.body);
    // 左右受光
    poly(g, [[0, H], [W * .16, H * .592], [W * .38, H * .47], [W * .515, H * .302], [W * .540, H * .291],
      [W * .545, H * .62], [W * .30, H]], p.bodyDark);
    poly(g, [[W * .618, H * .296], [W * .640, H * .308], [W * .700, H * .392], [W * .780, H * .480],
      [W * .870, H * .548], [W * .820, H * .62], [W * .700, H * .62]], p.bodyLight);
    // 山脊
    g.strokeStyle = U.rgba(p.bodyEdge, .5); g.lineWidth = Math.max(1, H * .0015);
    g.beginPath(); g.moveTo(W * .16, H * .592); g.lineTo(W * .38, H * .47); g.lineTo(W * .455, H * .372);
    g.lineTo(W * .515, H * .302); g.stroke();

    // 火山口
    const cx = W * .578, cy = H * .303;
    g.fillStyle = p.bodyEdge;
    g.beginPath(); g.ellipse(cx, cy + H * .008, W * .055, H * .019, 0, 0, 7); g.fill();
    g.fillStyle = p.crater;
    g.beginPath(); g.ellipse(cx, cy + H * .006, W * .042, H * .013, 0, 0, 7); g.fill();
    g.fillStyle = p.craterHot;
    g.beginPath(); g.ellipse(cx + W * .002, cy + H * .003, W * .024, H * .007, 0, 0, 7); g.fill();
    // 口沿的亮边
    g.strokeStyle = U.rgba(p.crater, .65); g.lineWidth = Math.max(1, H * .0018);
    g.beginPath(); g.ellipse(cx, cy + H * .002, W * .045, H * .015, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter';
    U.glow(g, cx, cy, W * .10, p.crater, mode === 'day' ? .22 : .34);
    g.restore();
  }

  /* ---- 地面 ---- */
  function ground(g, e, mode) {
    const p = PAL[mode], { W, H } = e, hz = H * .585;
    g.fillStyle = p.ground; g.fillRect(0, hz, W, H - hz);
    // 灰原
    const r = e.rng, top = [];
    for (let x = 0; x <= 20; x++) top.push([W * x / 20, H * (.625 + Math.sin(x * .7) * .010 + r() * .008)]);
    poly(g, top.concat([[W, H], [0, H]]), p.ashBand);
    // 灰原上起伏的沙丘：只比底色亮一点，边是清晰的
    for (let i = 0; i < 9; i++) {
      const x = r() * W, y = H * (.64 + r() * .30), w = W * (.05 + r() * .13), h = H * (.010 + r() * .022);
      const pts = [];
      for (let k = 0; k <= 7; k++) {
        const t = k / 7;
        pts.push([x - w + t * w * 2, y + Math.sin(t * Math.PI) * -h * (.4 + r() * .8) + (r() - .5) * h * .2]);
      }
      pts.push([x + w, y + h], [x - w, y + h]);
      poly(g, pts, U.rgba(p.ash, mode === 'day' ? .34 : .30));
    }
    // 远处的小火山锥
    for (const [x, s] of [[.075, .55], [.93, .7], [.30, .34]]) {
      const bx = W * x, by = H * .635, bw = W * .05 * s, bh = H * .055 * s;
      poly(g, [[bx - bw, by], [bx - bw * .22, by - bh], [bx + bw * .16, by - bh * .9], [bx + bw, by]], p.ink);
      if (mode === 'night') U.glow(g, bx - bw * .05, by - bh, bw * .5, p.crater, .18);
    }
    // 前景暗脊
    poly(g, [[0, H * .945], [W * .12, H * .918], [W * .26, H * .952], [W * .40, H * .925], [W * .55, H * .958],
      [W * .70, H * .928], [W * .84, H * .955], [W, H * .932], [W, H], [0, H]], p.fore);
  }

  /* ---- 图标底下很淡的一圈光：让图标名字在暗色地面上更好读 ---- */
  function clearing(g, e, mode) {
    for (const ic of e.icons) {
      const cx = ic.x + ic.w / 2, cy = ic.y + ic.h / 2;
      U.softEllipse(g, cx, cy, ic.w * .95 + e.P.sigma * .5, ic.h * .95 + e.P.sigma * .45,
        mode === 'day' ? '#ffe8d8' : '#8f7ea8', .05, .3);
    }
  }

  /* ---- 熔岩 ---- */
  // 分几段、每段一条路径一次描边：半透明的颜色不会因为圆头端点反复叠加而越来越实
  function lavaStroke(g, pts, w0, w1, color, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
    const n = pts.length;
    const parts = Math.max(1, Math.min(4, Math.round(n / 24)));
    for (let c = 0; c < parts; c++) {
      const a = Math.floor(c * (n - 1) / parts), b = Math.floor((c + 1) * (n - 1) / parts);
      if (b <= a) continue;
      g.beginPath();
      g.moveTo(pts[a][0], pts[a][1]);
      for (let i = a + 1; i <= b; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.lineWidth = w0 + (w1 - w0) * ((a + b) / 2 / Math.max(1, n - 1));
      g.stroke();
    }
    g.restore();
  }
  // 折线 → 平滑、密集的曲线点
  function curve(pts, per) { return U.spline(pts, per || 10); }
  // 图标底下的"洞"：熔岩和小物都不画到图标身上
  function iconHoles(e, grow) {
    return e.icons.map((ic, i) => ({
      cx: ic.x + ic.w / 2, cy: ic.y + ic.h / 2,
      rx: ic.w * .54 + e.P.sigma * grow, ry: ic.h * .56 + e.P.sigma * grow * .9,
      rng: U.rng((e.seed ^ ((i + 1) * 2654435761)) >>> 0)
    }));
  }
  function lava(g, e, mode) {
    U.mask(g, cg => drawLava(cg, e, mode), iconHoles(e, .58));
  }
  function drawLava(g, e, mode) {
    const p = PAL[mode], { W, H, P } = e;
    const r = U.rng(e.seed ^ 0x2F1D);

    const main = [[.578, .312], [.596, .360], [.612, .410], [.622, .462], [.618, .512], [.600, .560],
      [.566, .606], [.512, .646], [.446, .684], [.372, .716], [.292, .744], [.210, .775], [.130, .812], [.055, .852], [-.02, .888]];
    const left = [[.556, .305], [.532, .352], [.512, .406], [.498, .462], [.486, .518], [.472, .566], [.452, .606]];
    const right = [[.622, .312], [.648, .344], [.668, .380], [.684, .414]];

    const flows = [
      { pts: main, w: [H * .014, H * .040] },
      { pts: right, w: [H * .006, H * .013] }
    ];
    const count = P.lava > .7 ? 2 : 1;
    const drawn = [];
    for (let i = 0; i < count; i++) {
      const f = flows[i];
      drawn.push({ pts: curve(f.pts.map(([x, y]) => [W * x, H * y]), 14), w: f.w });
    }
    // 熔岩贴着地面的热光：沿着河道的一条很淡的宽光带
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const f of drawn) lavaStroke(g, f.pts, f.w[0] * 4.2, f.w[1] * 3.6, p.lava, mode === 'day' ? .06 : .10);
    g.restore();

    // 支流压在主河道下面
    if (drawn[0]) {
      const m = drawn[0].pts[Math.floor(drawn[0].pts.length * .62)];
      const br = curve([[m[0] + W * .01, m[1] - H * .006], [m[0] - W * .05, m[1] + H * .020], [m[0] - W * .095, m[1] + H * .046]], 10);
      lavaStroke(g, br, H * .008, H * .0026, p.crust, .9);
      lavaStroke(g, br, H * .004, H * .0016, p.lava, .9);
    }
    // 先画所有河道的黑色壳，再画熔岩和亮芯：两条河交汇的地方不会出现"壳压在熔岩上"的暗线
    for (const f of drawn) lavaStroke(g, f.pts, f.w[0] * 1.45, f.w[1] * 1.45, p.crust, .95);
    for (const f of drawn) lavaStroke(g, f.pts, f.w[0], f.w[1], p.lava, .98);
    for (const f of drawn) lavaStroke(g, f.pts, f.w[0] * .45, f.w[1] * .42, p.lavaHot, .95);
    // 熔岩池
    for (const [fx, fy, fr] of [[.335, .742, .034], [.115, .848, .042]]) {
      const x = W * fx, y = H * fy, rr = W * fr;
      g.fillStyle = p.crust;
      U.blob(g, x, y, rr * 1.08, rr * .56, 12, .12, r); g.fill();
      g.fillStyle = p.lava;
      U.blob(g, x, y, rr * .98, rr * .50, 12, .12, r); g.fill();
      g.fillStyle = p.lavaHot;
      U.blob(g, x - rr * .10, y - rr * .08, rr * .46, rr * .20, 10, .16, r); g.fill();
      // 池边的裂缝：只往外画，不穿过池子
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI * 2 + .8;
        lavaStroke(g, curve([[x + Math.cos(a) * rr * 1.15, y + Math.sin(a) * rr * .60],
          [x + Math.cos(a) * rr * 1.90, y + Math.sin(a) * rr * 1.15]], 6), H * .0028, H * .0008, p.lavaFaint, .45);
      }
    }
    // 地面裂缝
    for (let i = 0; i < 12; i++) {
      const x0 = W * (.30 + r() * .55), y0 = H * (.62 + r() * .26);
      let x = x0, y = y0;
      const pts = [[x, y]];
      for (let k = 0; k < 3; k++) {
        x += (r() * 2 - 1) * W * .022; y += H * (.012 + r() * .018);
        pts.push([x, y]);
      }
      lavaStroke(g, curve(pts, 6), H * .0032, H * .0008, p.lavaFaint, .5);
    }
  }

  /* ---- 前景小物 ---- */
  function props(g, e, mode) {
    U.mask(g, cg => drawProps(cg, e, mode), iconHoles(e, .70));
  }
  function drawProps(g, e, mode) {
    const p = PAL[mode], { W, H } = e, r = e.rng;
    // 黑曜石
    for (let i = 0; i < 20; i++) {
      const x = r() * W, y = H * (.62 + r() * .3), s = H * (.005 + r() * .013);
      poly(g, [[x - s, y + s * .4], [x - s * .5, y - s * .7], [x + s * .6, y - s * .4], [x + s, y + s * .5]], p.ink);
      poly(g, [[x - s * .5, y - s * .7], [x + s * .6, y - s * .4], [x + s * .05, y - s * .25]], U.rgba(p.ash, .55));
    }
    // 烧焦的树
    for (let i = 0; i < 10; i++) {
      const x = r() * W, y = H * (.60 + r() * .30), h = H * (.026 + r() * .042), w = Math.max(1, H * .0021);
      g.strokeStyle = p.ink; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w * .5, y - h * .55, x + h * .03, y - h); g.stroke();
      g.lineWidth = w * .55;
      for (let b = 0; b < 3; b++) {
        g.beginPath(); g.moveTo(x + h * .015, y - h * (.36 + b * .18));
        g.lineTo(x + (b % 2 ? -1 : 1) * h * (.06 + r() * .05), y - h * (.48 + b * .16)); g.stroke();
      }
    }
    // 干草丛
    for (let i = 0; i < 40; i++) {
      const x = r() * W, y = H * (.62 + r() * .36), h = H * (.005 + r() * .008);
      g.strokeStyle = U.rgba(mode === 'day' ? '#8d7359' : '#4a3a44', .4); g.lineWidth = 1;
      g.beginPath();
      for (let k = -2; k <= 2; k++) { g.moveTo(x, y); g.quadraticCurveTo(x + k * 2, y - h * .5, x + k * 4, y - h); }
      g.stroke();
    }
    // 冒气的地缝
    for (let i = 0; i < 3; i++) {
      const x = W * (.18 + r() * .6), y = H * (.66 + r() * .22);
      for (let k = 0; k < 3; k++)
        U.softEllipse(g, x + Math.sin(k * 1.7 + i) * W * .01, y - H * (.01 + k * .022), W * .014, H * .024, p.ashSoft, .18 - k * .04, .2);
    }
  }

  /* ---- 静态画面 ---- */
  function paintStatic(g, e, mode) {
    const p = PAL[mode], { W, H } = e;
    const only = QS.get('only');            // 调试：只画某一层
    const want = k => !only || only === k;
    if (want('sky')) sky(g, e, mode);
    if (want('ranges')) ranges(g, e, mode);
    if (want('body')) volcanoBody(g, e, mode);
    if (want('ground')) ground(g, e, mode);
    if (want('clear')) clearing(g, e, mode);
    if (want('lava')) lava(g, e, mode);
    if (want('props')) props(g, e, mode);
    if (!only) {
      U.vignette(g, W, H, p.vignette, p.vig);
      U.grain(g, W, H, p.grain);
    }
  }

  /* ---- 动画 ---- */
  function smoke(g, e, mode, cx, cy) {
    const p = PAL[mode], { W, H } = e, t = e.t;
    const n = Math.round(9 + e.P.smoke * 15);
    const layers = [
      { c: p.smokeDark, a: mode === 'day' ? .42 : .55, ox: W * .014, oy: H * .012, k: 1.12 },
      { c: p.smoke, a: mode === 'day' ? .82 : .64, ox: 0, oy: 0, k: 1 },
      { c: p.smokeLight, a: mode === 'day' ? .38 : .20, ox: -W * .012, oy: -H * .014, k: .60 }
    ];
    for (const L of layers) {
      g.save();
      g.globalAlpha = L.a;
      g.fillStyle = L.c;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const x = cx + L.ox + k * k * W * .120 + Math.sin(t * .55 + i * 1.2) * W * .011 * k;
        const y = cy + L.oy - k * H * .470;
        const r = H * (.014 + k * .062) * L.k;
        g.moveTo(x + r, y);
        g.arc(x, y, r, 0, Math.PI * 2);
      }
      g.fill();
      g.restore();
    }
    // 顶部散开的小烟团
    for (let i = 0; i < 4; i++) {
      const x = cx + W * .120 + i * W * .026 + Math.sin(t * .4 + i) * W * .008;
      const y = cy - H * (.468 + i * .030);
      const r = H * (.030 + i * .008);
      g.save();
      g.globalAlpha = (mode === 'day' ? .38 : .30) * (1 - i * .18);
      g.fillStyle = p.smokeLight;
      g.beginPath();
      g.moveTo(x + r, y); g.arc(x, y, r, 0, 7);
      g.moveTo(x - r * .8 + r * .7, y + r * .2); g.arc(x - r * .8, y + r * .2, r * .7, 0, 7);
      g.fill();
      g.restore();
    }
  }
  function paintAnim(g, e, mode) {
    const p = PAL[mode], { W, H } = e, t = e.t;
    const cx = W * .578, cy = H * .303;
    const pulse = .5 + .5 * Math.sin(t * 1.4);

    g.save(); g.globalCompositeOperation = 'lighter';
    U.glow(g, cx, cy, H * (.030 + .020 * pulse) * (1 + e.P.lava * .5), p.crater, .16 + .10 * pulse);
    g.restore();

    smoke(g, e, mode, cx, cy - H * .012);

    // 火星
    const ne = Math.round(5 + e.P.embers * 34);
    for (let i = 0; i < ne; i++) {
      const ph = (i * .618) % 1;
      const life = ((t * (.05 + (i % 5) * .008) + ph) % 1);
      const x = cx + Math.sin(ph * 29 + i) * W * .05 + life * life * W * .13;
      const y = cy - life * H * .34 + Math.sin(t + i) * 2;
      const s = H * (.0015 + (i % 4) * .0005) * (1 + life);
      g.fillStyle = U.rgba(p.lavaHot, Math.sin(life * Math.PI) * (mode === 'night' ? .95 : .65));
      g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    // 空中的灰
    for (let i = 0; i < 20; i++) {
      const x = ((i * 6367) % 1000) / 1000 * W + Math.sin(t * .18 + i) * W * .01;
      const y = ((i * 3571) % 1000) / 1000 * H * .72 + ((t * .005 * (1 + i % 3)) % 1) * H * .08;
      g.fillStyle = U.rgba(mode === 'day' ? '#f8e0d2' : '#8a7a90', .20);
      g.beginPath(); g.arc(x, y, 1 + (i % 3) * .5, 0, 7); g.fill();
    }
    // 飞鸟：两道弯弯的翅膀，实心剪影
    const nb = mode === 'day' ? Math.round(e.P.birds) : 0;
    for (let i = 0; i < nb; i++) {
      const sp = .010 + (i % 3) * .004;
      const x = ((t * sp + i * .24) % 1.35 - .18) * W;
      const y = H * (.12 + i * .035 + .022 * Math.sin(t * .5 + i * 2.1));
      const s = H * .011 * (.9 + (i % 2) * .45);
      g.fillStyle = U.rgba(p.bird, .40 + .18 * Math.sin(t * 2 + i));
      g.beginPath();
      g.moveTo(x - s, y);
      g.quadraticCurveTo(x - s * .5, y - s * .95, x, y - s * .15);
      g.quadraticCurveTo(x + s * .5, y - s * .95, x + s, y);
      g.quadraticCurveTo(x + s * .35, y - s * .40, x, y - s * .04);
      g.quadraticCurveTo(x - s * .35, y - s * .40, x - s, y);
      g.fill();
    }
    if (mode === 'night') {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 20; i++) {
        const x = ((i * 7919) % 1000) / 1000 * W, y = ((i * 104729) % 1000) / 1000 * H * .52;
        const a = .15 + .28 * Math.max(0, Math.sin(t * (1 + i % 3) + i));
        g.fillStyle = U.rgba('#ffffff', a);
        g.beginPath(); g.arc(x, y, 1.2, 0, 7); g.fill();
      }
      g.restore();
    }
  }

  function make(mode, defaults, title) {
    return {
      title, defaults,
      paintStatic(g, e) { paintStatic(g, e, mode); },
      paint(g, e) { paintAnim(g, e, mode); }
    };
  }
  SCENES.volcano = make('day', { sigma: 60, lava: .55, smoke: .6, embers: .5, birds: 3 }, '火山');
  SCENES['volcano-night'] = make('night', { sigma: 60, lava: .85, smoke: .7, embers: .8, birds: 0 }, '火山之夜');
})();
