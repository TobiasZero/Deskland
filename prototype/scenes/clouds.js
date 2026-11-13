'use strict';
/* ======================================================================
   Deskland · 天空 / 大海
   ----------------------------------------------------------------------
   天空：一整片卡通的蓝天。图标坐在云里——每个图标贡献一团云瓣，所有云瓣
         拼成一条路径、一次填充（重叠处不会有半透明接缝）；云有一条白色的
         外轮廓和压暗的云底。远处还有积云慢慢飘过（从图标云的后面经过）。
         白天 / 傍晚 / 夜晚三套色调（P.time）。
   大海：俯视的深蓝海面，用一笔一笔的短浪画出水面的明暗；白色云团罩住
         图标，云影落在右下方、随云慢慢漂；帆船拖着尾迹，鲸鱼在深处。
   云的形状在静态层算一次（Path2D），动画里只做平移和填充，不在每帧重建
   上千个控制点。
   ====================================================================== */
(function () {

  /* ==================================================================
     云的工具
     ================================================================== */
  // 一瓣云（不规则圆）：随机点一次算好，静态 / 动画复用同一个形状
  function lobe(r, cx, cy, rx, ry, n, jit) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, k = 1 + (r() * 2 - 1) * jit;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return { cx, cy, pts };
  }
  // 同一个形状往自己中心缩一圈：云瓣拼成的轮廓里就留出一条白边
  function inset(L, k) {
    return L.pts.map(p => [L.cx + (p[0] - L.cx) * k, L.cy + (p[1] - L.cy) * k]);
  }
  // 一堆云瓣 → 一条 Path2D（nonzero 填充，拼起来的地方没有缝）
  function pathOf(lobes) {
    const p = new Path2D();
    for (let j = 0; j < lobes.length; j++) {
      const pts = lobes[j], n = pts.length;
      p.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }
      p.closePath();
    }
    return p;
  }
  function fillPath(g, path, color, dx, dy) {
    g.save();
    g.translate(dx || 0, dy || 0);
    g.fillStyle = color;
    g.fill(path);
    g.restore();
  }
  // 三层：白色外轮廓 / 压暗的云底 / 云身
  function makeCloud(lobes, kIn) {
    return { rim: pathOf(lobes.map(L => L.pts)), body: pathOf(lobes.map(L => inset(L, kIn))) };
  }
  function paintCloud(g, c, pal, dx, dy) {
    fillPath(g, c.rim, pal.rim, dx, dy);
    // 云底：只画在轮廓里面（不然小鼓包下面会漏出暗色）
    g.save();
    g.translate(dx, dy);
    g.clip(c.rim);
    g.translate(0, pal.off);
    g.fillStyle = pal.shade;
    g.fill(c.body);
    g.restore();
    fillPath(g, c.body, pal.body, dx, dy);
  }

  // 图标所在的云：每个图标一团大的 + 一圈小鼓包（菜花一样的轮廓）
  function iconCloudLobes(e, kx, ky) {
    const r = U.rng((e.seed ^ 0x51CE) >>> 0), s = e.P.sigma || 90, out = [];
    for (const ic of e.icons) {
      const cx = ic.x + ic.w / 2, cy = ic.y + ic.h / 2, k = .95 + r() * .12;
      const rx = (ic.w / 2 + s * kx) * k, ry = (ic.h / 2 + s * ky) * k;
      out.push(lobe(r, cx, cy + ry * .04, rx, ry, 13, .055));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + .3 + r() * .5;
        const br = rx * (.19 + r() * .13);
        out.push(lobe(r, cx + Math.cos(a) * rx * .80, cy + Math.sin(a) * ry * .80,
          br, br * (.85 + r() * .3), 8, .085));
      }
    }
    return out;
  }

  // 一朵普通的积云：底下一排、上面堆几个
  function cumulusLobes(r, w, h) {
    const out = [];
    const n = 3 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - .5;
      const rr = h * (.34 + r() * .12) * (1 - Math.abs(t) * .22);
      out.push(lobe(r, t * w * .78, h * .06, rr * 1.7, rr * 1.05, 9, .055));
    }
    const m = 1 + ((r() * 2) | 0);
    for (let i = 0; i < m; i++) {
      const t = m === 1 ? 0 : i / (m - 1) - .5;
      const rr = h * (.42 + r() * .14);
      out.push(lobe(r, t * w * .34 + (r() - .5) * w * .08, -h * .30, rr * 1.3, rr, 9, .06));
    }
    return out;
  }
  function wrap(v, span) { return ((v % span) + span) % span; }

  /* ==================================================================
     天空
     ================================================================== */
  const SKY = {
    day: {
      sky: ['#2b76c2', '#4b93d5', '#8ac3e8', '#cbe7f6'],
      sun: '#fff6d0', sunCore: '#fffdf0', halo: '#ffe2a4',
      cloud: { rim: '#ffffff', body: '#f3f9fe', shade: '#c6def2', off: 10 },
      deco: { rim: '#ffffff', body: '#f6fbff', shade: '#d2e6f6', off: 8 },
      bird: '#2b5a7c',
      grain: .05, vig: .12, vigCol: '#155080'
    },
    dusk: {
      sky: ['#3a2e5e', '#6a4076', '#a85e7d', '#e08a7d', '#f7c48e'],
      sun: '#fff1c2', sunCore: '#fffdf0', halo: '#ffb183',
      cloud: { rim: '#fff6ec', body: '#ffe9d6', shade: '#f4b192', off: 8 },
      deco: { rim: '#fff2e4', body: '#ffdcc4', shade: '#f0a586', off: 6 },
      bird: '#462b48',
      grain: .06, vig: .14, vigCol: '#2a1a3a'
    },
    night: {
      sky: ['#050a1c', '#091228', '#101d3c', '#1a2d54'],
      sun: '#f7f2d6', sunCore: '#fffbe6', halo: '#c6d4ff',
      cloud: { rim: '#e9efff', body: '#d7e0f1', shade: '#a6b5d8', off: 8 },
      deco: { rim: '#8ea6cf', body: '#24334d', shade: '#172238', off: 6 },
      bird: '#0b1220',
      grain: .09, vig: .34, vigCol: '#03060f'
    }
  };
  function skyMode(P) {
    const v = Math.round(+P.time || 0);
    return v <= 0 ? 'day' : v === 1 ? 'dusk' : 'night';
  }

  function skyGradient(g, e, p) {
    const gr = g.createLinearGradient(0, 0, 0, e.H);
    p.sky.forEach((c, i) => gr.addColorStop(i / (p.sky.length - 1), c));
    g.fillStyle = gr;
    g.fillRect(0, 0, e.W, e.H);
  }

  function sunDay(g, e, p) {
    const W = e.W, H = e.H, sx = W * .815, sy = H * .155, sr = Math.min(W, H) * .046;
    U.glow(g, sx, sy, sr * 4.6, p.halo, .22);
    g.fillStyle = p.sun;
    g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill();
    g.fillStyle = p.sunCore;
    g.beginPath(); g.arc(sx - sr * .18, sy - sr * .16, sr * .42, 0, 7); g.fill();
  }

  function sunDusk(g, e, p) {
    const W = e.W, H = e.H, sx = W * .735, sy = H * .705, sr = Math.min(W, H) * .068;
    U.glow(g, sx, sy, sr * 5.6, p.halo, .34);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++)
      U.softEllipse(g, sx, sy + i * H * .014, sr * (2.2 + i * .9), sr * (.5 + i * .18), p.halo, .10 - i * .02, .35);
    g.restore();
    g.fillStyle = p.sun;
    g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill();
    g.fillStyle = U.rgba(p.sunCore, .8);
    g.beginPath(); g.arc(sx - sr * .16, sy - sr * .14, sr * .4, 0, 7); g.fill();
    // 贴着天边的暖带
    const hz = g.createLinearGradient(0, H * .70, 0, H);
    hz.addColorStop(0, U.rgba('#ffcf9c', 0));
    hz.addColorStop(.5, U.rgba('#ffc493', .18));
    hz.addColorStop(1, U.rgba('#ffb383', .05));
    g.fillStyle = hz;
    g.fillRect(0, H * .70, W, H * .30);
  }

  function stars(g, e, n) {
    const r = U.rng((e.seed ^ 0x57A5) >>> 0), W = e.W, H = e.H;
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H * .94, s = .35 + r() * 1.1, a = .22 + r() * .66;
      g.fillStyle = U.rgba('#ffffff', a);
      g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
      if (r() < .06) {
        g.strokeStyle = U.rgba('#e7efff', a * .55);
        g.lineWidth = .8;
        g.beginPath();
        g.moveTo(x - s * 3.2, y); g.lineTo(x + s * 3.2, y);
        g.moveTo(x, y - s * 3.2); g.lineTo(x, y + s * 3.2);
        g.stroke();
      }
    }
  }

  function moon(g, e, p) {
    const W = e.W, H = e.H, mx = W * .82, my = H * .155, mr = Math.min(W, H) * .040;
    U.glow(g, mx, my, mr * 4.2, p.halo, .18);
    g.fillStyle = p.sun;
    g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
    g.fillStyle = U.rgba('#c9c2a0', .45);
    for (const [dx, dy, rr] of [[-.32, -.28, .2], [.28, .18, .24], [-.02, .5, .12], [.44, -.3, .1]]) {
      g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, 7); g.fill();
    }
    g.fillStyle = U.rgba(p.sunCore, .3);
    g.beginPath(); g.arc(mx - mr * .12, my - mr * .14, mr * .88, 0, 7); g.fill();
  }

  function makeSkyClouds(e) {
    const r = U.rng((e.seed ^ 0x0DEC) >>> 0), W = e.W, H = e.H;
    const n = Math.round(U.clamp(e.P.cover == null ? .55 : +e.P.cover, 0, 1) * 12);
    const out = [];
    for (let i = 0; i < n; i++) {
      const w = W * (.07 + r() * .10), h = w * (.36 + r() * .16);
      out.push({
        w, h, x: r() * W, y: H * (.05 + r() * .88),
        v: (r() < .5 ? -1 : 1) * (5 + r() * 7), ph: r() * 6.28,
        shape: makeCloud(cumulusLobes(r, w, h), .87)
      });
    }
    return out;
  }

  function paintSkyStatic(g, e) {
    const m = skyMode(e.P), p = SKY[m], W = e.W, H = e.H;
    skyGradient(g, e, p);
    if (m === 'day') sunDay(g, e, p);
    else if (m === 'dusk') sunDusk(g, e, p);
    else { stars(g, e, Math.round(150 + (e.P.cover || 0) * 90)); moon(g, e, p); }
    U.vignette(g, W, H, p.vigCol, p.vig);
    U.grain(g, W, H, p.grain);
    // 动画层要用的形状先算好
    e.st.skyCloud = makeCloud(iconCloudLobes(e, .34, .30), .90);
    e.st.skyClouds = makeSkyClouds(e);
  }

  function drawBird(g, x, y, s, col, flap) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x - s, y);
    g.quadraticCurveTo(x - s * .52, y - s * .95 * flap, x, y - s * .1);
    g.quadraticCurveTo(x + s * .52, y - s * .95 * flap, x + s, y);
    g.quadraticCurveTo(x + s * .42, y - s * .34, x, y + s * .04);
    g.quadraticCurveTo(x - s * .42, y - s * .34, x - s, y);
    g.closePath();
    g.fill();
  }

  function paintSky(g, e) {
    const m = skyMode(e.P), p = SKY[m], t = e.t, W = e.W, H = e.H;
    const drift = Math.max(0, +e.P.drift || 0);

    // 远处的积云慢慢飘（从图标云的后面经过，不会压到图标）
    for (const c of e.st.skyClouds || []) {
      const span = W + c.w * 2;
      const x = wrap(c.x + t * c.v * drift, span) - c.w;
      const y = c.y + Math.sin(t * .21 + c.ph) * 6;
      paintCloud(g, c.shape, p.deco, x, y);
    }

    if (m === 'night') {
      // 星星闪烁
      for (let i = 0; i < 26; i++) {
        const x = ((i * 7919) % 1000) / 1000 * W;
        const y = ((i * 104729) % 1000) / 1000 * H * .62;
        const a = .10 + .45 * Math.max(0, Math.sin(t * (.7 + (i % 4) * .3) + i));
        g.fillStyle = U.rgba('#ffffff', a);
        g.beginPath(); g.arc(x, y, 1.1, 0, 7); g.fill();
      }
      // 萤火：贴着画面下方慢慢浮
      for (let i = 0; i < 14; i++) {
        const x = ((i * 4021) % 1000) / 1000 * W + Math.sin(t * .19 + i) * W * .022;
        const y = H * (.58 + ((i * 683) % 1000) / 1000 * .36) + Math.cos(t * .24 + i * 1.7) * H * .02;
        const a = Math.max(0, Math.sin(t * (.9 + (i % 3) * .35) + i * 2.1)) * .6;
        g.fillStyle = U.rgba('#ffe6a6', a * .22);
        g.beginPath(); g.arc(x, y, 3.4, 0, 7); g.fill();
        g.fillStyle = U.rgba('#ffeeb4', a);
        g.beginPath(); g.arc(x, y, 1.3, 0, 7); g.fill();
      }
    } else {
      // 飞鸟：几道弯弯的剪影
      for (let i = 0; i < 4; i++) {
        const sp = .010 + (i % 3) * .004;
        const x = ((t * sp + i * .27) % 1.3 - .15) * W;
        const y = H * (.11 + i * .04 + .02 * Math.sin(t * .45 + i * 2));
        const s = H * .011 * (.85 + (i % 2) * .45);
        const flap = .5 + .5 * Math.sin(t * 2.7 + i * 1.6);
        drawBird(g, x, y, s, U.rgba(p.bird, .30 + .16 * Math.sin(t * .8 + i)), flap);
      }
    }

    // 图标所在的云画在最上面：一条合并路径、一次填充
    if (e.st.skyCloud) paintCloud(g, e.st.skyCloud, p.cloud, 0, 0);
  }

  SCENES.sky = {
    title: '天空',
    defaults: { sigma: 90, cover: .55, drift: 1, time: 0 },
    paintStatic: paintSkyStatic,
    paint: paintSky
  };

  /* ==================================================================
     大海
     ================================================================== */
  const SEA = {
    water: '#17598d', waveLight: '#4f97c6', waveMid: '#347cac', waveDark: '#0a3e6a',
    foam: '#eaf8ff',
    cloud: { rim: '#ffffff', body: '#f1f8fd', shade: '#c9dcec', off: 9 },
    shadow: '#062c4e',
    sail: '#ffffff', sailShade: '#c4d9e8', hull: '#f0f9ff', mast: '#3d6480',
    whale: '#0a3c66', whaleHi: '#4b93c0', fish: '#0a3a5e',
    grain: .06, vig: .22, vigCol: '#04233c'
  };

  // 水：底色 + 一笔一笔的短浪（不用渐变，靠笔触的疏密出明暗）
  function oceanWater(g, e, p) {
    const W = e.W, H = e.H, n = e.noise, r = e.rng;
    g.fillStyle = p.water;
    g.fillRect(0, 0, W, H);
    const N = Math.round(W * H / 700);
    g.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const x = r() * W, y = r() * H;
      const f = n.fbm(x * .0016, y * .0023, 3) - .5;          // 大块的起伏
      const lit = f > 0;
      const a = .07 + Math.min(.30, Math.abs(f) * 1.5);
      const len = (9 + r() * 28) * (1 + Math.max(0, f) * .9);
      const ang = (n.fbm(x * .004 + 11, y * .004 - 7, 2) - .5) * .8;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      g.strokeStyle = U.rgba(lit ? (r() < .5 ? p.waveLight : p.waveMid) : p.waveDark, a);
      g.lineWidth = .9 + r() * 2.0;
      g.beginPath();
      g.moveTo(x - ca * len * .5, y - sa * len * .5);
      g.quadraticCurveTo(x + sa * len * .16, y - ca * len * .16, x + ca * len * .5, y + sa * len * .5);
      g.stroke();
    }
    // 浪尖的白：很短的几笔
    for (let i = 0; i < N * .16; i++) {
      const x = r() * W, y = r() * H, len = 4 + r() * 13;
      g.strokeStyle = U.rgba(p.foam, .08 + r() * .20);
      g.lineWidth = .9 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len * .5, y - r() * 3.4, x + len, y + (r() - .5) * 2);
      g.stroke();
    }
    // 几道很长的涌浪：加深一点，给海面横向的节奏
    for (let i = 0; i < 34; i++) {
      const y0 = r() * H, x0 = -W * .1 + r() * W * .5, len = W * (.32 + r() * .5);
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push([x0 + t * len, y0 + Math.sin(t * 5.2 + i) * H * .014 + (r() - .5) * H * .006]);
      }
      g.strokeStyle = U.rgba(i % 3 ? p.waveDark : p.waveLight, .07 + r() * .07);
      g.lineWidth = 2 + r() * 3;
      U.strokePts(g, U.spline(pts, 4)); g.stroke();
    }
  }

  function seaSparkles(g, e, p) {
    const r = U.rng((e.seed ^ 0x2C0F) >>> 0), W = e.W, H = e.H;
    for (let i = 0; i < 150; i++) {
      const x = r() * W, y = r() * H, s = .7 + r() * 1.9, a = .14 + r() * .42;
      g.fillStyle = U.rgba(p.foam, a);
      g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
      if (r() < .12) {
        g.strokeStyle = U.rgba(p.foam, a * .65);
        g.lineWidth = .8;
        g.beginPath();
        g.moveTo(x - s * 2.8, y); g.lineTo(x + s * 2.8, y);
        g.moveTo(x, y - s * 2.8); g.lineTo(x, y + s * 2.8);
        g.stroke();
      }
    }
  }
  function makeGlints(e) {
    const r = U.rng((e.seed ^ 0x61E7) >>> 0), out = [];
    const n = Math.round(e.W * e.H / 14000);
    for (let i = 0; i < n; i++)
      out.push({ x: r() * e.W, y: r() * e.H, l: 5 + r() * 17, w: .8 + r(), ph: r() * 6.28, sp: .5 + r() * 1.6 });
    return out;
  }
  function drawGlints(g, e) {
    const t = e.t;
    g.lineCap = 'round';
    for (const q of e.st.glints || []) {
      const a = .04 + .20 * (.5 + .5 * Math.sin(t * q.sp + q.ph));
      g.strokeStyle = U.rgba('#ffffff', a);
      g.lineWidth = q.w;
      g.beginPath();
      g.moveTo(q.x - q.l * .5, q.y);
      g.lineTo(q.x + q.l * .5, q.y);
      g.stroke();
    }
  }

  // 深处的鲸鱼：一块很淡的剪影
  function drawWhale(g, e, p) {
    const r = U.rng((e.seed ^ 0x77A1) >>> 0), W = e.W, H = e.H;
    let bx = W * .66, by = H * .66, bd = -1e9;
    for (let i = 0; i < 30; i++) {
      const x = W * (.14 + r() * .72), y = H * (.18 + r() * .66);
      const d = (e.field ? e.field.at(x, y) : 999) - Math.hypot(x - W * .5, y - H * .5) * .10;
      if (d > bd) { bd = d; bx = x; by = y; }
    }
    const s = Math.min(W, H) * .21, ang = -.22 + r() * .44;
    g.save();
    g.translate(bx, by);
    g.rotate(ang);
    g.globalAlpha = .5;
    g.fillStyle = p.whale;
    // 身体
    g.beginPath();
    g.moveTo(s * 1.02, 0);
    g.bezierCurveTo(s * .92, -s * .30, s * .40, -s * .46, -s * .16, -s * .36);
    g.bezierCurveTo(-s * .48, -s * .29, -s * .66, -s * .18, -s * .86, -s * .11);
    g.bezierCurveTo(-s * .98, -s * .05, -s * .98, s * .05, -s * .86, s * .11);
    g.bezierCurveTo(-s * .66, s * .18, -s * .48, s * .29, -s * .16, s * .36);
    g.bezierCurveTo(s * .40, s * .46, s * .92, s * .30, s * 1.02, 0);
    g.closePath();
    g.fill();
    // 尾鳍
    g.beginPath();
    g.moveTo(-s * .74, 0);
    g.quadraticCurveTo(-s * 1.02, -s * .40, -s * 1.34, -s * .46);
    g.quadraticCurveTo(-s * 1.16, -s * .10, -s * 1.12, 0);
    g.quadraticCurveTo(-s * 1.16, s * .10, -s * 1.34, s * .46);
    g.quadraticCurveTo(-s * 1.02, s * .40, -s * .74, 0);
    g.closePath();
    g.fill();
    // 胸鳍
    g.beginPath();
    g.moveTo(s * .22, -s * .28);
    g.quadraticCurveTo(s * .02, -s * .78, -s * .30, -s * .70);
    g.quadraticCurveTo(-s * .02, -s * .36, s * .10, -s * .18);
    g.closePath();
    g.fill();
    // 背上的反光
    g.globalAlpha = .26;
    g.strokeStyle = p.whaleHi;
    g.lineWidth = Math.max(1, s * .02);
    g.beginPath();
    g.moveTo(s * .84, -s * .14);
    g.bezierCurveTo(s * .5, -s * .34, s * .06, -s * .36, -s * .34, -s * .24);
    g.stroke();
    g.restore();
  }

  function makeOceanClouds(e) {
    const r = U.rng((e.seed ^ 0xC10D) >>> 0), out = [];
    const n = Math.round(U.clamp(e.P.cover == null ? .6 : +e.P.cover, 0, 1) * 8);
    for (let i = 0; i < n; i++) {
      const w = e.W * (.10 + r() * .10), h = w * (.34 + r() * .12);
      out.push({
        w, h, x: r() * e.W, y: e.H * (.04 + r() * .92),
        v: (r() < .5 ? -1 : 1) * (6 + r() * 8), ph: r() * 6.28,
        shape: makeCloud(cumulusLobes(r, w, h), .87)
      });
    }
    return out;
  }
  function drawOceanClouds(g, e, p) {
    const t = e.t, drift = Math.max(0, +e.P.drift || 0);
    for (const c of e.st.oClouds || []) {
      const span = e.W + c.w * 2;
      const x = wrap(c.x + t * c.v * drift, span) - c.w;
      const y = c.y + Math.sin(t * .2 + c.ph) * 7;
      g.save();
      g.globalAlpha = .09;
      fillPath(g, c.shape.rim, p.shadow, x + c.w * .20, y + c.h * .44);
      g.globalAlpha = .12;
      fillPath(g, c.shape.rim, p.shadow, x + c.w * .11, y + c.h * .24);
      g.restore();
      paintCloud(g, c.shape, p.cloud, x, y);
    }
  }

  function fishPath(g, s) {
    g.beginPath();
    g.moveTo(s, 0);
    g.quadraticCurveTo(s * .12, -s * .64, -s * .55, -s * .22);
    g.lineTo(-s * 1.06, -s * .6);
    g.lineTo(-s * .84, 0);
    g.lineTo(-s * 1.06, s * .6);
    g.lineTo(-s * .55, s * .22);
    g.quadraticCurveTo(s * .12, s * .64, s, 0);
    g.closePath();
  }
  function drawFish(g, e, p) {
    const t = e.t, W = e.W, H = e.H;
    for (let i = 0; i < 9; i++) {
      const bx = ((i * 977) % 1000) / 1000, by = ((i * 613) % 1000) / 1000;
      const x = (bx + .06 * Math.sin(t * .10 + i * 2.3)) * W;
      const y = (by * .78 + .1 + .04 * Math.cos(t * .15 + i * 1.7)) * H;
      const vx = Math.cos(t * .10 + i * 2.3), vy = -Math.sin(t * .15 + i * 1.7) * .5;
      const s = 4.5 + (i % 3) * 2.2;
      g.save();
      g.translate(x, y);
      g.rotate(Math.atan2(vy, vx));
      g.globalAlpha = .42;
      g.fillStyle = p.fish;
      fishPath(g, s);
      g.fill();
      g.fillStyle = U.rgba(p.foam, .2);
      g.beginPath(); g.ellipse(0, s * .12, s * .46, s * .11, 0, 0, 7); g.fill();
      g.restore();
    }
  }

  // 帆船：俯视，船头朝 +x
  function boatShape(g, p, s) {
    g.beginPath();
    g.moveTo(-s * 1.15, -s * .29);
    g.quadraticCurveTo(s * .45, -s * .46, s * 1.56, 0);
    g.quadraticCurveTo(s * .45, s * .46, -s * 1.15, s * .29);
    g.quadraticCurveTo(-s * 1.44, 0, -s * 1.15, -s * .29);
    g.closePath();
    g.fillStyle = p.hull; g.fill();
    g.fillStyle = U.rgba(p.mast, .28);
    g.beginPath(); g.ellipse(-s * .34, 0, s * .44, s * .14, 0, 0, 7); g.fill();
    // 帆（俯视的一片月牙）
    g.beginPath();
    g.moveTo(s * .10, -s * .10);
    g.quadraticCurveTo(s * .74, -s * 1.34, s * .06, -s * 1.62);
    g.quadraticCurveTo(-s * .62, -s * 1.0, -s * .52, -s * .16);
    g.quadraticCurveTo(-s * .18, -s * .12, s * .10, -s * .10);
    g.closePath();
    g.fillStyle = p.sail; g.fill();
    g.strokeStyle = U.rgba(p.sailShade, .85);
    g.lineWidth = Math.max(.8, s * .05);
    g.beginPath();
    g.moveTo(s * .06, -s * .16);
    g.quadraticCurveTo(s * .10, -s * .82, s * .04, -s * 1.5);
    g.stroke();
    g.fillStyle = p.mast;
    g.beginPath(); g.arc(s * .10, -s * .10, Math.max(1, s * .085), 0, 7); g.fill();
  }
  function boatWake(g, p, s) {
    g.lineCap = 'round';
    for (const sd of [-1, 1]) {
      g.strokeStyle = U.rgba(p.foam, .26);
      g.lineWidth = Math.max(.8, s * .05);
      g.beginPath();
      g.moveTo(-s * 1.1, sd * s * .28);
      g.quadraticCurveTo(-s * 2.1, sd * s * .62, -s * 3.6, sd * s * 1.28);
      g.stroke();
    }
    g.fillStyle = U.rgba(p.foam, .30);
    for (let i = 0; i < 5; i++) {
      const u = (i + .5) / 5;
      const x = -s * (1.2 + u * 2.3), y = (i % 2 ? 1 : -1) * s * (.30 + u * .62);
      g.beginPath(); g.arc(x, y, s * (.09 + u * .07), 0, 7); g.fill();
    }
  }
  function makeBoats(e) {
    const r = U.rng((e.seed ^ 0xB0A7) >>> 0), out = [];
    const n = U.clamp(Math.round(+e.P.boats || 0), 0, 4);
    for (let i = 0; i < n; i++) {
      out.push({
        x: r() * e.W, y: e.H * (.16 + r() * .68),
        v: (r() < .5 ? -1 : 1) * (10 + r() * 10),
        ph: r() * 6.28, s: Math.min(e.W, e.H) * (.021 + r() * .009)
      });
    }
    return out;
  }
  function drawBoats(g, e, p) {
    const t = e.t, drift = Math.max(0, +e.P.drift || 0);
    const span = e.W + 300;
    for (const b of e.st.boats || []) {
      const x = wrap(b.x + t * b.v * drift, span) - 150;
      const y = b.y + Math.sin(t * .23 + b.ph) * 7;
      const ang = (b.v < 0 ? Math.PI : 0) + Math.sin(t * .19 + b.ph) * .06;
      g.save();
      g.globalAlpha = .16;
      g.translate(x + 6, y + 8);
      g.rotate(ang);
      g.fillStyle = p.shadow;
      g.beginPath(); g.ellipse(0, 0, b.s * 1.5, b.s * .40, 0, 0, 7); g.fill();
      g.restore();
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      boatWake(g, p, b.s);
      boatShape(g, p, b.s);
      g.restore();
    }
  }

  function paintOceanStatic(g, e) {
    oceanWater(g, e, SEA);
    seaSparkles(g, e, SEA);
    drawWhale(g, e, SEA);
    e.st.oCloud = makeCloud(iconCloudLobes(e, .34, .30), .90);
    e.st.oClouds = makeOceanClouds(e);
    e.st.glints = makeGlints(e);
    e.st.boats = makeBoats(e);
    U.vignette(g, e.W, e.H, SEA.vigCol, SEA.vig);
    U.grain(g, e.W, e.H, SEA.grain);
  }

  function paintOcean(g, e) {
    const t = e.t, drift = Math.max(0, +e.P.drift || 0), p = SEA;
    drawGlints(g, e);
    drawFish(g, e, p);
    drawBoats(g, e, p);
    // 图标云的影子落在海面上，跟着云慢慢漂
    const c = e.st.oCloud;
    if (c) {
      const ox = 16 + Math.sin(t * .05 * drift + .8) * 8;
      const oy = 24 + Math.cos(t * .04 * drift + 2.1) * 9;
      g.save();
      g.globalAlpha = .10;
      fillPath(g, c.rim, p.shadow, ox * 1.8, oy * 1.8);
      g.globalAlpha = .13;
      fillPath(g, c.rim, p.shadow, ox, oy);
      g.restore();
    }
    // 远处的云从图标云后面飘过
    drawOceanClouds(g, e, p);
    if (c) paintCloud(g, c, p.cloud, 0, 0);
  }

  SCENES.ocean = {
    title: '大海',
    defaults: { sigma: 85, cover: .6, drift: 1, boats: 2 },
    paintStatic: paintOceanStatic,
    paint: paintOcean
  };
})();
