'use strict';
/* ======================================================================
   Deskland · 火山 / 火山之夜
   限色纸本插画：远山、切面的火山锥、熔岩河与玄武岩台地。
   静态层保存河岸、裂纹和纸纹；动画只复用烟团路径、火光贴图与遮罩。
   ====================================================================== */
(function () {
  const TAU = Math.PI * 2;
  const PAL = {
    day: {
      sky: ['#f8dbc1', '#f2c2ac', '#e9a99e', '#db9297'], sun: '#fff1cb',
      cloud: '#f9deca', far: '#bd909b', farLit: '#cf9ca2', mid: '#966f84',
      ash: '#a28c91', dune: '#8f7882', ground: '#735c6c', plate: '#655061',
      plateLit: '#806777', body: '#67505f', shade: '#493b50', lit: '#8e6570',
      facet: '#785766', rim: '#b9847e', fore: '#302b3d', ink: '#3f3143',
      smoke: ['#897884', '#a18a92', '#b59a9e'], smokeWarm: '#bc8475',
      cold: '#b89aa0', ember: '#ffe0a0', bird: '#685466', grain: .085
    },
    night: {
      sky: ['#121a31', '#1b2440', '#2c304b', '#4b3b53'], sun: '#e0dfce',
      cloud: '#40405a', far: '#625368', farLit: '#766070', mid: '#414057',
      ash: '#555264', dune: '#454455', ground: '#343445', plate: '#292d3e',
      plateLit: '#414356', body: '#2c2d40', shade: '#202638', lit: '#444054',
      facet: '#363346', rim: '#756278', fore: '#151c2d', ink: '#1c2233',
      smoke: ['#414054', '#555064', '#686072'], smokeWarm: '#a56760',
      cold: '#7d7d94', ember: '#ffe6ac', bird: '#aba6bc', grain: .10
    }
  };
  const HEAT = ['#8e4544', '#ce5a42', '#ef873f', '#ffd07b'];
  const CONE = [[.23, .65], [.35, .565], [.445, .48], [.53, .387], [.582, .326],
    [.605, .332], [.63, .326], [.654, .335], [.714, .433], [.795, .515], [.9, .585], [.97, .65]];

  function shape(g, e, pts, color) {
    U.poly(g, pts.map(p => [p[0] * e.W, p[1] * e.H]), color);
  }
  function line(g, pts, color, width) {
    g.strokeStyle = color; g.lineWidth = width;
    U.strokePts(g, pts); g.stroke();
  }
  function disc(g, x, y, r, color) {
    g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }

  /* ---- 天空：四色平带、薄云与稀疏的星河 ---- */
  function sky(g, e, p, night) {
    const { W, H, rng: r } = e;
    g.fillStyle = p.sky[0]; g.fillRect(0, 0, W, H);
    for (let i = 1; i < 4; i++) {
      const y = .13 + i * .11;
      shape(g, e, [[0, y + .022], [.24, y], [.55, y + .016], [.82, y - .01],
        [1, y + .012], [1, 1], [0, 1]], p.sky[i]);
    }
    if (night) {
      // 星河由细点组成，留出暗缝，不用模糊的大光团。
      for (let i = 0; i < 630; i++) {
        const x = r() * W, y = r() * H * .52;
        const band = Math.abs(y / H - (.39 - .35 * x / W));
        if (i > 180 && band > .025 + r() * .075) continue;
        if (e.noise.fbm(x * .012, y * .012) < .29) continue;
        g.globalAlpha = .14 + r() * .45;
        disc(g, x, y, i < 180 ? .55 + r() * .85 : .45, p.sun);
      }
      g.globalAlpha = 1;
    }
    const x = W * .865, y = H * .155, rad = H * .039;
    disc(g, x, y, rad * 1.55, U.rgba(p.sun, night ? .035 : .13));
    disc(g, x, y, rad * 1.22, U.rgba(p.sun, night ? .07 : .20));
    disc(g, x, y, rad, p.sun);
    if (night) {
      for (const [dx, dy, s] of [[-.3, -.25, .19], [.28, .2, .26], [-.2, .5, .12]])
        disc(g, x + dx * rad, y + dy * rad, rad * s, '#c5c6c1');
    }
    for (const [x0, y0, w] of [[.30, .115, .15], [.06, .24, .2], [.77, .265, .19], [.38, .205, .10]]) {
      shape(g, e, [[x0, y0], [x0 + w * .25, y0 - .008], [x0 + w, y0 - .003],
        [x0 + w * .81, y0 + .004], [x0 + w * .12, y0 + .006]], U.rgba(p.cloud, night ? .24 : .65));
    }
  }

  /* ---- 远景与六块主山体：明暗边缘顺着山脊走 ---- */
  function mountains(g, e, p) {
    shape(g, e, [[0, .53], [.085, .43], [.12, .435], [.20, .53], [.31, .47],
      [.37, .485], [.45, .56], [.72, .55], [.82, .465], [.85, .47], [.96, .53],
      [1, .50], [1, .65], [0, .65]], p.far);
    shape(g, e, [[.085, .43], [.12, .435], [.20, .53], [.145, .51]], p.farLit);
    shape(g, e, [[.82, .465], [.85, .47], [.96, .53], [.88, .52]], p.farLit);
    shape(g, e, [[0, .595], [.14, .54], [.24, .565], [.35, .515], [.42, .555],
      [.53, .54], [.73, .58], [.87, .54], [1, .575], [1, .68], [0, .68]], p.mid);
    shape(g, e, CONE, p.body);
    shape(g, e, [[.23, .65], [.445, .48], [.582, .326], [.554, .447], [.50, .56], [.45, .65]], p.shade);
    shape(g, e, [[.582, .326], [.605, .332], [.582, .44], [.55, .49], [.57, .57], [.50, .56], [.554, .447]], p.facet);
    shape(g, e, [[.63, .326], [.654, .335], [.714, .433], [.795, .515], [.9, .585], [.76, .55], [.69, .47]], p.lit);
    shape(g, e, [[.63, .326], [.662, .44], [.72, .56], [.66, .53], [.608, .395]], p.facet);
    shape(g, e, [[.654, .335], [.714, .433], [.768, .485], [.706, .452]], p.rim);
    // 侵蚀沟：断续的细线，远处密，山脚稀。
    const r = e.rng;
    for (let i = 0; i < 24; i++) {
      const u = i / 23, x = e.W * (.586 + u * .065), y = e.H * (.35 + r() * .045);
      const dx = (u - .46) * e.W * .21, dy = e.H * (.12 + r() * .10);
      line(g, [[x, y], [x + dx * .34, y + dy * .45], [x + dx, y + dy]],
        U.rgba(i % 3 ? p.shade : p.cold, .14), .7 + r());
    }
  }

  /* ---- 河道：变宽的双岸多边形，图标使河岸侧向退让 ---- */
  function flow(e, controls, w0, w1) {
    const pts = U.spline(controls.map(p => [p[0] * e.W, p[1] * e.H]), 12);
    const sides = e.icons.map(ic => {
      let near = pts[0];
      for (const pt of pts) if (Math.abs(pt[1] - ic.y - ic.h / 2) < Math.abs(near[1] - ic.y - ic.h / 2)) near = pt;
      return near[0] < ic.x + ic.w / 2 ? -1 : 1;
    });
    const out = pts.map((pt, i) => {
      const u = i / (pts.length - 1);
      const w = e.H * U.lerp(w0, w1, u) * (.45 + .75 * U.clamp(e.P.lava, 0, 1)) *
        (1 + .24 * Math.sin(u * 19) + .12 * Math.sin(u * 43));
      let x = pt[0];
      for (let k = 0; k < e.icons.length; k++) {
        const ic = e.icons[k], cy = ic.y + ic.h / 2;
        const ry = ic.h * .7 + e.P.sigma * .8 + w + 16;
        const v = (pt[1] - cy) / ry;
        if (Math.abs(v) >= 1) continue;
        const reach = (ic.w * .7 + e.P.sigma * .85 + w + 16) * Math.sqrt(1 - v * v);
        const cx = ic.x + ic.w / 2;
        if (Math.abs(x - cx) < reach) x = cx + sides[k] * reach;
      }
      return { x, y: pt[1], w, nx: 0, ny: 0 };
    });
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      out[i].nx = -(b.y - a.y) / d; out[i].ny = (b.x - a.x) / d;
    }
    return out;
  }
  function ribbon(g, pts, k, color, offset) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], w = p.w * (k + (offset || 0)) * (1 + .09 * Math.sin(i * 1.91));
      if (!i) g.moveTo(p.x + p.nx * w, p.y + p.ny * w);
      else g.lineTo(p.x + p.nx * w, p.y + p.ny * w);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i], w = p.w * (k - (offset || 0)) * (1 + .08 * Math.sin(i * 1.43));
      g.lineTo(p.x - p.nx * w, p.y - p.ny * w);
    }
    g.closePath(); g.fillStyle = color; g.fill();
  }
  function heatSprite(e) {
    // 小尺寸辉光贴图同时用于河岸和动画；避免高分辨率整层阴影模糊。
    if (!e.st.heatGlow) {
      const c = document.createElement('canvas'); c.width = c.height = 96;
      U.glow(c.getContext('2d'), 48, 48, 48, HEAT[2], 1);
      e.st.heatGlow = c;
    }
    return e.st.heatGlow;
  }
  function lava(g, e, p, night, flows) {
    const amount = U.clamp(e.P.lava, 0, 1), r = e.rng;
    // 大图标覆盖山口时，绕行的河道仍须落在山体或灰原上。
    // 此处裁的是地形外轮廓，图标洞仍由外层 U.mask 擦除。
    g.save();
    g.beginPath();
    g.moveTo(CONE[0][0] * e.W, CONE[0][1] * e.H);
    for (let i = 1; i < CONE.length; i++) g.lineTo(CONE[i][0] * e.W, CONE[i][1] * e.H);
    g.closePath();
    g.rect(0, e.H * .61, e.W, e.H * .39);
    g.clip();
    for (const pts of flows) ribbon(g, pts, 1.23, p.shade);
    if (!amount) { g.restore(); return; }
    for (let j = flows.length - 1; j >= 0; j--) {
      const pts = flows[j];
      g.save();
      if (night) {
        g.globalCompositeOperation = 'lighter';
        const glow = heatSprite(e);
        for (let i = 0; i < pts.length; i += 3) {
          const a = pts[i], b = pts[Math.min(i + 3, pts.length - 1)];
          const radius = a.w * 1.8 + e.H * .009;
          g.globalAlpha = amount * .32 * Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / radius);
          g.drawImage(glow, a.x - radius, a.y - radius, radius * 2, radius * 2);
        }
      }
      g.restore();
      ribbon(g, pts, 1.05, HEAT[0]);
      ribbon(g, pts, .86, U.mix(HEAT[0], HEAT[1], amount));
      ribbon(g, pts, .64, U.mix(HEAT[1], HEAT[2], amount));
      // 不连续的亮芯，宽窄和偏移各不相同，像壳下露出的热窗。
      for (let k = 1; k < pts.length - 2; k += 6) {
        const window = pts.slice(k, Math.min(pts.length, k + 6));
        const tapered = window.map((a, i) => ({ ...a, w: a.w * (.08 + .92 * Math.sin(i / (window.length - 1) * Math.PI)) }));
        ribbon(g, tapered, .22 + r() * .28,
          U.mix(HEAT[2], HEAT[3], amount), (r() - .5) * .35);
      }
      // 分离的冷壳岛：不要用连续的黑色中线把河画成绳子。
      for (let i = 3; i < pts.length - 2; i += 3) {
        const a = pts[i], side = r() < .5 ? -1 : 1;
        const offset = side * (.15 + r() * .65), x = a.x + a.nx * a.w * offset, y = a.y + a.ny * a.w * offset;
        const s = a.w * (.25 + r() * .42);
        g.save(); g.translate(x, y); g.rotate(Math.atan2(a.ny, a.nx));
        U.poly(g, [[-s, -s * .4], [-s * .55, -s * (.65 + r() * .6)], [s * .17, -s * .9],
          [s * .7, -s * .45], [s * (.7 + r() * .4), s * .35], [s * .2, s * .63], [-s * .4, s * .7]], p.shade);
        line(g, [[-s, -s * .4], [-s * .55, -s * .85], [s * .17, -s * .9]], HEAT[0], .8);
        g.restore();
      }
    }
    g.restore();
  }

  /* ---- 灰原、冷却板块、碎石与枯木 ---- */
  function ground(g, e, p, flows) {
    const { W, H, rng: r } = e;
    shape(g, e, [[0, .645], [.19, .61], [.38, .65], [.54, .60], [.73, .63], [1, .605], [1, 1], [0, 1]], p.dune);
    shape(g, e, [[0, .76], [.24, .70], [.45, .73], [.67, .67], [.85, .72], [1, .70], [1, 1], [0, 1]], p.ground);
    shape(g, e, [[0, .66], [.18, .646], [.36, .674], [.48, .66], [.31, .698], [.12, .683]], p.ash);
    shape(g, e, [[.72, .64], [.9, .625], [1, .64], [1, .665], [.87, .654]], p.ash);
    // 岩板随透视放大，每块保留上沿冷光和少量热裂隙。
    const sites = [], cols = 16, rows = 7;
    for (let j = -1; j <= rows; j++) for (let i = -1; i <= cols; i++)
      sites.push([i + .16 + r() * .68, j + .16 + r() * .68]);
    // 邻近种子的中垂线切出不规则冷壳，避免像方砖地面。
    for (const site of sites) {
      if (site[0] < 0 || site[0] > cols || site[1] < 0 || site[1] > rows) continue;
      let cell = [[-1, 0], [cols + 1, 0], [cols + 1, rows + 1], [-1, rows + 1]];
      for (const other of sites) {
        const dx = other[0] - site[0], dy = other[1] - site[1];
        if (other === site || Math.abs(dx) > 2.5 || Math.abs(dy) > 2.5) continue;
        const bound = (other[0] ** 2 + other[1] ** 2 - site[0] ** 2 - site[1] ** 2) / 2;
        const next = [];
        for (let k = 0; k < cell.length; k++) {
          const a = cell[k], b = cell[(k + 1) % cell.length];
          const da = a[0] * dx + a[1] * dy - bound, db = b[0] * dx + b[1] * dy - bound;
          if (da <= 0) next.push(a);
          if ((da <= 0) !== (db <= 0)) next.push([U.lerp(a[0], b[0], da / (da - db)), U.lerp(a[1], b[1], da / (da - db))]);
        }
        cell = next;
      }
      if (cell.length < 3) continue;
      const raw = cell.map(q => [q[0] / cols * W, H * (.68 + .40 * Math.pow(Math.max(0, q[1]) / rows, 1.65))]);
      const cx = raw.reduce((s, q) => s + q[0], 0) / raw.length, cy = raw.reduce((s, q) => s + q[1], 0) / raw.length;
      const pts = raw.map(q => [U.lerp(cx, q[0], .976), U.lerp(cy, q[1], .955)]);
      U.poly(g, pts, U.mix(p.ground, r() < .5 ? p.plate : p.plateLit, .35 + r() * .5));
      line(g, pts.slice(0, 2), U.rgba(p.cold, .16), .85);
      const hot = flows.some(f => f.some(a => Math.hypot(a.x - cx, a.y - cy) < a.w * 2.8 + W * .04));
      if (hot && r() < .65 && e.P.lava > 0) {
        const crack = pts.slice(1, 4);
        line(g, crack, U.rgba(HEAT[0], e.P.lava * .65), 2.1);
        line(g, crack.slice(0, 2), U.rgba(HEAT[2], e.P.lava * .55), .8);
      }
    }
    for (const [x, y, s] of [[.32, .64, .024], [.87, .635, .038], [.945, .655, .022]]) {
      shape(g, e, [[x - s, y], [x - s * .15, y - s], [x + s * .18, y - s * .94], [x + s * 1.4, y]], p.shade);
      shape(g, e, [[x + s * .18, y - s * .94], [x + s * 1.4, y], [x + s * .4, y]], p.lit);
      if (p === PAL.night && e.P.lava > 0) {
        g.save(); g.globalCompositeOperation = 'lighter';
        U.glow(g, x * W, (y - s) * H, H * .017, HEAT[1], e.P.lava * .25);
        line(g, [[(x - s * .13) * W, (y - s) * H], [(x + s * .18) * W, (y - s * .94) * H]],
          U.rgba(HEAT[2], e.P.lava * .85), 1.5);
        g.restore();
      }
    }
    // 短风纹与散落的火山砾，集中在台地而不是均匀撒满。
    for (let i = 0; i < 240; i++) {
      const x = r() * W, y = H * (.63 + r() * .37), d = (y / H - .6) * 2;
      if (e.noise.fbm(x * .012, y * .018) < .43) continue;
      line(g, [[x, y], [x + (2 + r() * 9) * d, y - 1]], U.rgba(p.cold, .28), .7 + d);
    }
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = H * (.66 + r() * .32), s = H * (.002 + .009 * (y / H - .6)) * (1 + r());
      if (flows.some(f => f.some(a => Math.hypot(a.x - x, a.y - y) < a.w * 1.9 + s))) continue;
      U.poly(g, [[x - s, y], [x - s * .4, y - s], [x + s * .7, y - s * .8], [x + s, y + s * .2]], p.ink);
      U.poly(g, [[x - s, y], [x - s * .4, y - s], [x + s * .7, y - s * .8], [x, y - s * .5]], p.plateLit);
    }
  }
  function foreground(g, e, p) {
    const { W, H } = e;
    shape(g, e, [[0, .96], [.12, .91], [.23, .965], [.34, .935], [.44, 1], [0, 1]], p.fore);
    shape(g, e, [[.83, 1], [.91, .93], [.97, .905], [1, .925], [1, 1]], p.fore);
    // 前景柱状玄武岩：顶面月光，靠河的一面留暖色反光。
    for (let i = 0; i < 8; i++) {
      const x = W * (.925 + i * .014), y = H * (.96 - .012 * Math.sin(i)),
        w = W * .018, h = H * (.048 + .024 * Math.sin(i * 1.7) ** 2);
      U.poly(g, [[x - w, y], [x - w, y - h], [x, y - h * 1.18], [x + w * .6, y - h], [x + w * .6, y]], p.ink);
      U.poly(g, [[x - w, y - h], [x, y - h * 1.18], [x + w * .6, y - h], [x - w * .2, y - h * .83]], p.plateLit);
      U.poly(g, [[x - w * .2, y - h * .83], [x + w * .6, y - h], [x + w * .6, y], [x - w * .2, y]], p.fore);
      line(g, [[x - w + 1, y - h + 2], [x - w + 1, y - 3]], U.rgba(p.rim, .28 + e.P.lava * .25), 1);
    }
    for (const [fx, fy, sz, lean] of [[.36, .87, .065, -1], [.405, .893, .041, 1], [.91, .81, .049, 1], [.95, .84, .03, -1]]) {
      const x = W * fx, y = H * fy, h = H * sz, s = h * .07;
      U.poly(g, [[x - s, y], [x - s * .4, y - h * .55], [x + lean * s, y - h],
        [x + lean * s + s * .7, y - h * .97], [x + s, y]], p.fore);
      g.strokeStyle = p.fore; g.lineWidth = Math.max(1, s * .55);
      g.beginPath(); g.moveTo(x, y - h * .43); g.lineTo(x - h * .19, y - h * .63); g.lineTo(x - h * .23, y - h * .81);
      g.moveTo(x, y - h * .67); g.lineTo(x + h * .17, y - h * .78); g.lineTo(x + h * .19, y - h * .92); g.stroke();
      line(g, [[x + s, y - h * .1], [x + s * .7, y - h * .55]], U.rgba(p.rim, .55), .8);
    }
  }
  function crater(g, e, p, night) {
    const { W, H } = e, amount = U.clamp(e.P.lava, 0, 1);
    const cx = .619 * W, cy = .337 * H;
    g.fillStyle = p.ink; g.beginPath(); g.ellipse(cx, cy, W * .037, H * .014, 0, 0, TAU); g.fill();
    if (amount) {
      g.fillStyle = U.mix(HEAT[0], HEAT[2], amount);
      g.beginPath(); g.ellipse(cx, cy, W * .030, H * .008, 0, 0, TAU); g.fill();
      g.fillStyle = U.mix(HEAT[1], HEAT[3], amount);
      g.beginPath(); g.ellipse(cx + W * .004, cy - H * .001, W * .021, H * .004, 0, 0, TAU); g.fill();
      if (night) {
        g.save(); g.globalCompositeOperation = 'lighter';
        U.glow(g, cx, cy, H * .065, HEAT[1], .20 * amount);
        g.restore();
      }
    }
    shape(g, e, [[.58, .337], [.598, .344], [.618, .345], [.629, .341], [.648, .339],
      [.642, .352], [.62, .355], [.598, .351]], p.shade);
    line(g, [[W * .585, H * .338], [W * .604, H * .346], [W * .617, H * .347]],
      amount ? HEAT[1] : p.rim, 1.2);
  }

  /* ---- 一次建立烟团路径与动画画布；每帧只清空并复用 ---- */
  function prepareAnimation(g, e, p, night, flows) {
    const a = { flows, puffs: [], plume: [], underlight: new Path2D(), stars: [], holes: new Path2D(), terrain: new Path2D() };
    a.terrain.moveTo(CONE[0][0] * e.W, CONE[0][1] * e.H);
    for (let i = 1; i < CONE.length; i++) a.terrain.lineTo(CONE[i][0] * e.W, CONE[i][1] * e.H);
    a.terrain.closePath(); a.terrain.rect(0, e.H * .61, e.W, e.H * .39);
    const r = U.rng(e.seed ^ 0x517a);
    for (let i = 0; i < 9; i++) {
      const path = new Path2D();
      U.blobAdd(path, 0, 0, 1, .74, 11, .22, r);
      U.blobAdd(path, -.55, .04, .55, .48, 8, .18, r);
      U.blobAdd(path, .38, -.26, .62, .55, 9, .19, r);
      a.puffs.push(path);
    }
    // 同一色层合成一个路径，烟团重叠处不会出现透明圆圈。
    for (let layer = 0; layer < 3; layer++) {
      const path = new Path2D();
      for (let i = 0; i < 19; i++) {
        const u = i / 18, s = e.H * (.012 + u * .053) * (.5 + e.P.smoke * .65);
        const x = e.W * (.17 * u * u) + Math.sin(i * 2.1) * s * .24;
        const y = -e.H * u * .255;
        const k = layer === 0 ? 1 : layer === 1 ? .7 : .38;
        if (layer === 2 && i % 3 === 0) continue;
        U.blobAdd(path, x - s * layer * .24, y - s * layer * .16,
          s * k * (1 + .25 * Math.sin(i * 1.8)), s * k * .77, 10, .18, r);
      }
      a.plume.push(path);
    }
    for (let i = 0; i < 6; i++) {
      const u = i / 20, s = e.H * (.009 + u * .023) * (.5 + e.P.smoke * .65);
      U.blobAdd(a.underlight, e.W * .17 * u * u + s * .3, -e.H * u * .255,
        s * .67, s * .62, 9, .18, r);
    }
    for (const h of U.iconHoles(e, .7)) U.blobAdd(a.holes, h.cx, h.cy, h.rx, h.ry, 10, .14, h.rng);
    a.canvas = document.createElement('canvas');
    a.canvas.width = g.canvas.width; a.canvas.height = g.canvas.height;
    a.g = a.canvas.getContext('2d');
    a.sx = g.canvas.width / e.W; a.sy = g.canvas.height / e.H;
    a.glow = heatSprite(e);
    if (night) for (let i = 0; i < 18; i++) a.stars.push({ x: r() * e.W, y: r() * e.H * .30, phase: r() * TAU });
    e.st.volcano = a;
  }
  function paintStatic(g, e, night) {
    const p = night ? PAL.night : PAL.day;
    const flows = [flow(e, [[.628, .345], [.65, .425], [.638, .50], [.575, .594], [.584, .65], [.70, .752], [.79, .86], [.86, 1.05]], .004, .043)];
    if (e.P.lava > .6) flows.push(flow(e, [[.603, .345], [.574, .425], [.54, .49], [.53, .56], [.46, .656]], .004, .0006));
    if (e.P.lava > .35) flows.push(flow(e, [[.585, .653], [.54, .71], [.47, .75], [.43, .81]], .009, .001));
    sky(g, e, p, night);
    // 浅灰是地面本色；遮罩只擦掉上面的岩石，不另画光斑。
    shape(g, e, [[0, .59], [.20, .58], [.44, .61], [.65, .58], [1, .59], [1, 1], [0, 1]], p.ash);
    shape(g, e, CONE, p.ash);
    U.mask(g, cg => {
      mountains(cg, e, p);
      ground(cg, e, p, flows);
      lava(cg, e, p, night, flows);
      crater(cg, e, p, night);
      foreground(cg, e, p);
    }, U.iconHoles(e, .7));
    U.grain(g, e.W, e.H, p.grain);
    U.vignette(g, e.W, e.H, p.fore, night ? .16 : .11);
    prepareAnimation(g, e, p, night, flows);
  }

  function paint(g, e, night) {
    const a = e.st.volcano;
    if (!a) return;
    const { W, H, P, t } = e, p = night ? PAL.night : PAL.day, c = a.g;
    const smoke = U.clamp(P.smoke, 0, 1), heat = U.clamp(P.lava, 0, 1);
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, a.canvas.width, a.canvas.height);
    c.setTransform(a.sx, 0, 0, a.sy, 0, 0);
    // 烟团分批升起、变宽、解体；上部灰冷，下部受熔岩反照。
    if (smoke > 0) {
      c.save(); c.translate(W * .619, H * .329);
      c.transform(1, 0, Math.sin(t * .22) * .018, 1, 0, 0);
      for (let layer = 0; layer < 3; layer++) {
        c.globalAlpha = smoke * (layer ? .62 : .92); c.fillStyle = p.smoke[layer]; c.fill(a.plume[layer]);
      }
      c.globalAlpha = smoke * heat * (night ? .72 : .18);
      c.fillStyle = p.smokeWarm; c.fill(a.underlight);
      c.restore();
      for (let i = 0; i < 9; i++) {
        const life = (i / 9 + t * .042) % 1;
        const x = W * (.619 + .17 * life * life) + Math.sin(i * 2.4 + t * .25) * W * .009 * life;
        const y = H * (.329 - life * .36), s = H * (.009 + life * .026) * (.5 + smoke * .65);
        c.save(); c.translate(x, y); c.scale(s, s);
        c.globalAlpha = Math.sin(life * Math.PI) * smoke * .48;
        c.fillStyle = life < .24 && night && heat > 0 ? p.smokeWarm : p.smoke[2];
        c.fill(a.puffs[i]); c.restore();
      }
    }
    if (heat > 0) {
      c.save(); c.globalCompositeOperation = 'lighter';
      c.globalAlpha = heat * (night ? .12 : .04) * (.8 + Math.sin(t * 1.4) * .2);
      const s = H * .075;
      c.drawImage(a.glow, W * .619 - s, H * .332 - s, s * 2, s * 2);
      c.restore();
      // 河面不铺连续亮线，只让零散的热窗顺流移动。
      c.save(); c.clip(a.terrain);
      c.fillStyle = HEAT[3];
      for (let i = 0; i < 24; i++) {
        const f = a.flows[i % a.flows.length], u = (i * .618034 + t * .032) % 1;
        const k = u * (f.length - 1), n = Math.floor(k), p0 = f[n], p1 = f[Math.min(n + 1, f.length - 1)];
        const x = U.lerp(p0.x, p1.x, k - n), y = U.lerp(p0.y, p1.y, k - n);
        c.globalAlpha = Math.sin(u * Math.PI) * heat * .55;
        c.beginPath(); c.ellipse(x, y, Math.max(1, p0.w * .18), Math.max(.6, p0.w * .055), Math.atan2(p0.ny, p0.nx) + Math.PI / 2, 0, TAU); c.fill();
      }
      c.restore();
    }
    c.fillStyle = p.ember;
    const embers = Math.round(U.clamp(P.embers, 0, 1) * 44);
    for (let i = 0; i < embers; i++) {
      const life = (i * .618034 + t * (.075 + i % 4 * .009)) % 1;
      const x = W * (.619 + Math.sin(i * 7.3) * .026 + life * life * .12);
      const y = H * (.33 - life * (.14 + (i % 5) * .025));
      c.globalAlpha = Math.sin(life * Math.PI) * (night ? .85 : .65);
      c.fillRect(x, y, 1 + i % 3 * .45, 1.7 + i % 4 * .55);
    }
    c.globalAlpha = 1; c.strokeStyle = p.bird; c.lineWidth = 1.4;
    for (let i = 0; i < Math.round(U.clamp(P.birds, 0, 6)); i++) {
      const x = ((.42 + i * .068 + t * (.006 + i * .0007)) % 1.18 - .09) * W;
      const y = H * (.26 + i % 3 * .021) + Math.sin(t * .5 + i * 2) * H * .012;
      const s = H * (.005 + i % 2 * .002), flap = .25 + .5 * Math.sin(t * 4 + i);
      c.beginPath(); c.moveTo(x - s, y - s * flap); c.quadraticCurveTo(x - s * .4, y - s * .65, x, y);
      c.quadraticCurveTo(x + s * .4, y - s * .65, x + s, y - s * flap); c.stroke();
    }
    c.fillStyle = p.sun;
    for (const star of a.stars) {
      c.globalAlpha = .15 + Math.max(0, Math.sin(t * .7 + star.phase)) * .35;
      c.fillRect(star.x, star.y, 1.2, 1.2);
    }
    // 动态层沿用同一组图标洞；无需每帧调用会创建画布的 U.mask。
    c.globalAlpha = 1; c.globalCompositeOperation = 'destination-out'; c.fill(a.holes);
    c.globalCompositeOperation = 'source-over';
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(a.canvas, 0, 0); g.restore();
  }

  function make(night, defaults, title) {
    return { title, defaults,
      paintStatic(g, e) { paintStatic(g, e, night); },
      paint(g, e) { paint(g, e, night); }
    };
  }
  SCENES.volcano = make(false, { sigma: 60, lava: .55, smoke: .6, embers: .5, birds: 3 }, '火山');
  SCENES['volcano-night'] = make(true, { sigma: 60, lava: .85, smoke: .7, embers: .8, birds: 0 }, '火山之夜');
})();
