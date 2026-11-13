'use strict';
/* ======================================================================
   Deskland · 四张地图主题
   手绘城市 / 彩色城市 / 老地图 / 航海地图
   ----------------------------------------------------------------------
   四张图都画在"纸"上：paintStatic 画纸、街道、房子、海岸线、山脉这些重活，
   paint 只画会动的小东西（马车、小车、帆船、鲸鱼的水柱）。
   图标所在的区域用两种办法处理：静态细节用 U.mask + U.iconHoles 挖掉；
   街道、房子、海浪、测深数字则用图标距离场 field 绕开。
   等值线（海岸线、广场边线）直接从 field 里取，所以它会跟着图标一起变化。
   ====================================================================== */
(function () {
  const TAU = Math.PI * 2;

  /* ==================================================================
     公共：路径、等值线、纸
     ================================================================== */
  function strokePts(g, pts, close) {
    if (!pts || pts.length < 2) return;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (close) g.closePath();
    g.stroke();
  }
  function pathLoops(g, loops) {
    g.beginPath();
    for (const lp of loops) {
      if (!lp.length) continue;
      g.moveTo(lp[0][0], lp[0][1]);
      for (let i = 1; i < lp.length; i++) g.lineTo(lp[i][0], lp[i][1]);
      g.closePath();
    }
  }
  // Chaikin 抹角：把等值线的锯齿磨圆，边缘仍然是手画的弯
  function chaikin(pts, closed, iters) {
    let p = pts;
    for (let k = 0; k < (iters || 1); k++) {
      const n = p.length;
      if (n < 3) return p;
      const out = [];
      if (!closed) out.push(p[0]);
      const last = closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = p[i], b = p[(i + 1) % n];
        out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]);
        out.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
      }
      if (!closed) out.push(p[n - 1]);
      p = out;
    }
    return p;
  }
  // 从图标距离场取等值线：level 越小离图标越近；wob 让线有一点自然的弯
  // 采样范围往画布外多一圈，画布外当作"外面"，等值线就在画布边上自然收口，
  // 不会出现一条横穿画面的直线（直接用首尾相连会切出一块假的直边）。
  function isoLoops(e, level, step, wob, freq) {
    const W = e.W, H = e.H, nz = e.noise;
    const cols = Math.ceil(W / step) + 3, rows = Math.ceil(H / step) + 3;
    const v = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      const y = (j - 1) * step;
      for (let i = 0; i < cols; i++) {
        const x = (i - 1) * step;
        let d = 1;
        if (x >= 0 && y >= 0 && x <= W && y <= H) {
          d = e.field.at(x, y) - level;
          if (wob) d += (nz.fbm(x * freq, y * freq, 3) - .5) * wob;
        }
        v[j * cols + i] = d;
      }
    }
    const ip = (ax, ay, av, bx, by, bv) => {
      const t = av / (av - bv);
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    };
    const segs = [];
    for (let j = 0; j < rows - 1; j++) {
      const y0 = (j - 1) * step, y1 = y0 + step;
      for (let i = 0; i < cols - 1; i++) {
        const x0 = (i - 1) * step, x1 = x0 + step;
        const a = v[j * cols + i], b = v[j * cols + i + 1];
        const c = v[(j + 1) * cols + i + 1], d = v[(j + 1) * cols + i];
        const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const T = () => ip(x0, y0, a, x1, y0, b);
        const R = () => ip(x1, y0, b, x1, y1, c);
        const B = () => ip(x0, y1, d, x1, y1, c);
        const L = () => ip(x0, y0, a, x0, y1, d);
        switch (idx) {
          case 1: segs.push([L(), T()]); break;
          case 2: segs.push([T(), R()]); break;
          case 3: segs.push([L(), R()]); break;
          case 4: segs.push([R(), B()]); break;
          case 5: segs.push([L(), T()], [R(), B()]); break;
          case 6: segs.push([T(), B()]); break;
          case 7: segs.push([L(), B()]); break;
          case 8: segs.push([B(), L()]); break;
          case 9: segs.push([T(), B()]); break;
          case 10: segs.push([T(), R()], [B(), L()]); break;
          case 11: segs.push([R(), B()]); break;
          case 12: segs.push([L(), R()]); break;
          case 13: segs.push([T(), R()]); break;
          case 14: segs.push([L(), T()]); break;
        }
      }
    }
    // 首尾相接拼成折线
    const key = p => Math.round(p[0] * 64) + ':' + Math.round(p[1] * 64);
    const byEnd = new Map();
    const add = (k, s) => { let a = byEnd.get(k); if (!a) byEnd.set(k, a = []); a.push(s); };
    for (const s of segs) { add(key(s[0]), s); add(key(s[1]), s); }
    const used = new Set(), loops = [];
    for (const s of segs) {
      if (used.has(s)) continue;
      used.add(s);
      const pts = [s[0], s[1]];
      for (let dir = 0; dir < 2; dir++) {
        for (;;) {
          const end = dir ? pts[0] : pts[pts.length - 1];
          const cand = byEnd.get(key(end));
          let nxt = null;
          if (cand) for (const c of cand) if (!used.has(c)) { nxt = c; break; }
          if (!nxt) break;
          used.add(nxt);
          const other = key(nxt[0]) === key(end) ? nxt[1] : nxt[0];
          if (dir) pts.unshift(other); else pts.push(other);
          if (key(other) === key(pts[dir ? pts.length - 1 : 0])) break;
        }
      }
      loops.push(pts);
    }
    return loops;
  }
  // 折线向外/向里平移（海岸线的平行阴影线、广场铺地环）
  function offsetPts(pts, d, closed) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const L = Math.hypot(dx, dy) || 1;
      out.push([pts[i][0] - dy / L * d, pts[i][1] + dx / L * d]);
    }
    return out;
  }
  function polyLen(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }
  // 折线按弧长切段（让路和马车都停在图标空地边上）
  function cutByField(pts, e, margin) {
    const out = [];
    let cur = null;
    for (const p of pts) {
      if (e.field.at(p[0], p[1]) > margin) {
        if (!cur) { cur = []; out.push(cur); }
        cur.push(p);
      } else cur = null;
    }
    return out.filter(a => a.length > 2 && polyLen(a) > 34);
  }
  function prepare(pts) {
    const cum = [0];
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      cum.push(L);
    }
    return { pts, cum, len: Math.max(1, L) };
  }
  // 弧长 d 处的位置和方向
  function atLen(P, d, o) {
    const { pts, cum, len } = P;
    d = ((d % len) + len) % len;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= d) lo = m; else hi = m;
    }
    const a = pts[lo], b = pts[Math.min(lo + 1, pts.length - 1)];
    const seg = (cum[lo + 1] - cum[lo]) || 1;
    const t = (d - cum[lo]) / seg;
    o.x = a[0] + (b[0] - a[0]) * t;
    o.y = a[1] + (b[1] - a[1]) * t;
    o.a = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return o;
  }
  // 不用字体的小数字（七段式）：航海图的测深数字用
  const SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
  function numGlyph(g, x, y, v, size, color, alpha) {
    const str = String(v), dw = size * .52, gap = size * .38;
    g.save();
    g.strokeStyle = color; g.globalAlpha = alpha;
    g.lineWidth = Math.max(.5, size * .11);
    g.lineCap = 'round';
    for (let k = 0; k < str.length; k++) {
      const s = SEG[+str[k]] | 0, ox = x + k * (dw + gap), oy = y;
      const x1 = ox + dw, ym = oy + size * .5, y1 = oy + size;
      g.beginPath();
      if (s & 1) { g.moveTo(ox, oy); g.lineTo(x1, oy); }
      if (s & 2) { g.moveTo(ox, oy); g.lineTo(ox, ym); }
      if (s & 4) { g.moveTo(x1, oy); g.lineTo(x1, ym); }
      if (s & 8) { g.moveTo(ox, ym); g.lineTo(x1, ym); }
      if (s & 16) { g.moveTo(ox, ym); g.lineTo(ox, y1); }
      if (s & 32) { g.moveTo(x1, ym); g.lineTo(x1, y1); }
      if (s & 64) { g.moveTo(ox, y1); g.lineTo(x1, y1); }
      g.stroke();
    }
    g.restore();
  }
  // 纸的纤维：一层很淡的短线
  function fibers(g, e, color, alpha, n) {
    const r = U.rng(e.seed ^ 0xF1BE), { W, H } = e;
    g.save();
    g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = .8;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, a = r() * TAU, l = 3 + r() * 11;
      g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
    g.stroke();
    g.restore();
  }
  // 做旧：茶渍、水渍边、黄斑、折痕
  function aging(g, e, amount, tone) {
    if (amount <= .001) return;
    const { W, H } = e, r = U.rng(e.seed ^ 0xA9E1);
    g.save();
    const n = Math.round(10 + amount * 26);
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H;
      const rx = (36 + r() * 150) * (0.6 + amount * .7), ry = rx * (.45 + r() * .55);
      g.fillStyle = U.rgba(tone, (0.025 + r() * 0.05) * amount);
      U.blob(g, x, y, rx, ry, 10, .3, r); g.fill();
      g.strokeStyle = U.rgba(tone, .05 * amount); g.lineWidth = 1.2;
      U.blob(g, x, y, rx * .96, ry * .96, 10, .3, r); g.stroke();
    }
    // 黄斑：小簇的褐色小点
    const clusters = Math.round(amount * 28);
    g.fillStyle = tone;
    for (let c = 0; c < clusters; c++) {
      const cx = r() * W, cy = r() * H, m = 4 + Math.round(r() * 9);
      for (let i = 0; i < m; i++) {
        const a = r() * TAU, d = r() * r() * (12 + r() * 26);
        g.globalAlpha = (0.06 + r() * .16) * amount;
        g.beginPath();
        g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, .7 + r() * 1.5, 0, TAU);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    // 折痕
    for (let i = 0; i < 2; i++) {
      const vertical = r() < .5, at = (vertical ? W : H) * (.28 + r() * .44);
      g.strokeStyle = U.rgba(tone, .05 * amount); g.lineWidth = 1;
      g.beginPath();
      if (vertical) { g.moveTo(at, 0); g.lineTo(at + (r() - .5) * 20, H); }
      else { g.moveTo(0, at); g.lineTo(W, at + (r() - .5) * 20); }
      g.stroke();
    }
    g.restore();
  }

  /* ==================================================================
     1 · 手绘城市：奶油纸 + 褐色墨线，成排的坡顶小房子，图标在广场上
     ================================================================== */
  const OLD = {
    ink: '#6a4a33', ink2: '#8a6a4e', paper: '#eee1c1', pave: '#fffbf0',
    street: '#fdf8ea', wall: '#ecdfbd', roof: '#fffdf4', roofShade: '#e5d3ac',
    kiln: '#d08a62', kilnShade: '#b06f4b',
    ochre: '#f2e4bb', ochreShade: '#ddc99a',
    green: '#8d9a6b', greenD: '#66744b', stain: '#8a6a3a', tree: '#93a172'
  };
  // 街区网格的基准位置（街道中心线的大致位置）
  const OLX = [.078, .223, .368, .513, .658, .803, .952];
  const OLY = [.10, .245, .39, .535, .68, .825, .965];
  // 街道骨架：笔直但不僵硬，七竖七横
  function oldLanes(e) {
    const { W, H } = e, r = U.rng(e.seed ^ 0x2C71), nz = e.noise;
    const lanes = [], hw = 12;
    for (let i = 0; i < OLX.length; i++) {
      const bx = W * OLX[i] + (r() - .5) * W * .016;
      const pts = [];
      for (let y = -30; y <= H + 30; y += 20) {
        const k = y / H;
        pts.push([bx + Math.sin(k * 4.6 + i * 2.3) * W * .013 + (nz.n(k * 3.4, i * 7.1) - .5) * W * .026, y]);
      }
      lanes.push({ pts, vert: true, base: bx, hw });
    }
    for (let j = 0; j < OLY.length; j++) {
      const by = H * OLY[j] + (r() - .5) * H * .016;
      const pts = [];
      for (let x = -30; x <= W + 30; x += 20) {
        const k = x / W;
        pts.push([x, by + Math.sin(k * 5.1 + j * 1.9) * H * .012 + (nz.n(k * 3.1 + 19, j * 5.7 + 3) - .5) * H * .024]);
      }
      lanes.push({ pts, vert: false, base: by, hw });
    }
    return lanes;
  }
  function oldStreet(g, pts, hw) {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = U.rgba(OLD.ink, .62); g.lineWidth = hw * 2 + 3.6; strokePts(g, pts);
    g.strokeStyle = OLD.street; g.lineWidth = hw * 2; strokePts(g, pts);
    // 石板缝
    g.strokeStyle = U.rgba(OLD.ink2, .23); g.lineWidth = .8;
    g.beginPath();
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc > 22) {
        acc = 0;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
        const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, l = hw * .66;
        g.moveTo(cx - Math.cos(ang) * l, cy - Math.sin(ang) * l);
        g.lineTo(cx + Math.cos(ang) * l, cy + Math.sin(ang) * l);
      }
    }
    g.stroke();
    g.restore();
  }
  // 街区里面的小院：矮墙、菜畦、果树、水井，偶尔有一个小棚子
  function oldGarden(g, e, x0, y0, x1, y1, r) {
    const w = x1 - x0, h = y1 - y0;
    if (w < 44 || h < 36) return;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const kind = r() < .30 ? 1 : r() < .45 ? 2 : r() < .55 ? 3 : 0;
    const rad = Math.min(20, w * .32, h * .32);
    g.save();
    // 院子地面
    g.fillStyle = kind === 2 ? '#efe6cd' : kind === 3 ? '#e9edcf' : '#eef1d8';
    U.roundRect(g, x0, y0, w, h, rad); g.fill();
    // 矮墙 / 绿篱
    g.strokeStyle = U.rgba(OLD.greenD, kind === 2 ? .35 : .5); g.lineWidth = 2.4;
    U.roundRect(g, x0, y0, w, h, rad); g.stroke();
    g.strokeStyle = U.rgba(OLD.ink, .32); g.lineWidth = .9;
    U.roundRect(g, x0 + 2.6, y0 + 2.6, w - 5.2, h - 5.2, Math.max(2, rad - 3)); g.stroke();
    if (kind === 1) {
      // 果园：一排排小树
      const cols = Math.max(1, Math.floor((w - 22) / 26)), rows = Math.max(1, Math.floor((h - 20) / 24));
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const tx = x0 + 16 + (i + .5) * ((w - 32) / cols);
        const ty = y0 + 14 + (j + .5) * ((h - 26) / rows);
        g.strokeStyle = U.rgba(OLD.ink2, .35); g.lineWidth = 1;
        g.beginPath(); g.arc(tx, ty, 4.5, 0, TAU); g.fillStyle = OLD.tree; g.fill(); g.stroke();
      }
    } else if (kind === 2) {
      // 打谷场：水井 + 小棚子
      g.fillStyle = '#f7efd8'; g.strokeStyle = U.rgba(OLD.ink, .55); g.lineWidth = 1;
      g.beginPath(); g.arc(x0 + w * .3, y0 + h * .46, 5.2, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.arc(x0 + w * .3, y0 + h * .46, 2.1, 0, TAU); g.stroke();
      if (w > 74) {
        g.fillStyle = U.rgba(OLD.ink, .13);
        g.fillRect(x0 + w * .58 + 2, y0 + h * .42 + 3, w * .27, h * .4);
        g.fillStyle = OLD.kiln; g.strokeStyle = U.rgba(OLD.ink, .65); g.lineWidth = 1;
        g.fillRect(x0 + w * .58, y0 + h * .42, w * .27, h * .4);
        g.strokeRect(x0 + w * .58, y0 + h * .42, w * .27, h * .4);
      }
    } else if (kind === 3) {
      // 草坪：一条碎石小径 + 两棵树
      g.strokeStyle = U.rgba(OLD.ink2, .3); g.lineWidth = 1.2;
      g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(x0 + 6, cy); g.lineTo(x1 - 6, cy); g.stroke();
      g.setLineDash([]);
      for (let i = 0; i < 2; i++)
        oldTree(g, x0 + 18 + r() * (w - 36), y0 + h * (.25 + r() * .5), 5 + r() * 4, r);
    } else {
      // 菜畦
      if (w > 60) {
        g.strokeStyle = U.rgba(OLD.greenD, .32); g.lineWidth = 1.2;
        g.beginPath();
        const rows = Math.max(2, Math.min(5, (h * .42 / 8) | 0));
        for (let i = 0; i < rows; i++) {
          const yy = cy + (i - (rows - 1) / 2) * 7;
          g.moveTo(cx - w * .22, yy); g.lineTo(cx + w * .22, yy);
        }
        g.stroke();
      }
      const n = 1 + Math.round(r() * 2);
      for (let i = 0; i < n; i++)
        oldTree(g, x0 + 12 + r() * (w - 24), y0 + 10 + r() * (h - 20), 5 + r() * 5, r);
    }
    g.restore();
  }
  // 一棵俯看的小树：圆冠 + 几笔排线 + 一点深色
  function oldTree(g, x, y, rad, rng) {
    g.save();
    g.fillStyle = U.rgba(OLD.ink, .14);
    g.beginPath(); g.arc(x + rad * .28, y + rad * .34, rad * .95, 0, TAU); g.fill();
    g.fillStyle = OLD.tree;
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    g.strokeStyle = U.rgba(OLD.greenD, .55); g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
    // 冠上的放射排线
    g.strokeStyle = U.rgba(OLD.greenD, .35); g.lineWidth = .8;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + .4;
      g.moveTo(x + Math.cos(a) * rad * .22, y + Math.sin(a) * rad * .22);
      g.lineTo(x + Math.cos(a) * rad * .78, y + Math.sin(a) * rad * .78);
    }
    g.stroke();
    g.restore();
  }
  // 一栋小房子：局部 +y 朝向街道。坡顶 + 临街的白墙（门、窗、偶尔一条条纹雨篷）
  function oldHouse(g, w, d, roofKind, rng) {
    const x0 = -w / 2, x1 = w / 2;
    const yB = -d * .58, yR = -d * .06, yF = d * .44, yW = yF + d * .40;
    const light = roofKind === 0 ? OLD.kiln : roofKind === 2 ? OLD.ochre : OLD.roof;
    const dark = roofKind === 0 ? OLD.kilnShade : roofKind === 2 ? OLD.ochreShade : OLD.roofShade;
    // 落在地上的影子
    g.fillStyle = U.rgba(OLD.ink, .15);
    g.fillRect(x0 + 2.2, yB + 2.6, w, yW - yB);
    // 后坡（受光）
    g.fillStyle = light;
    g.fillRect(x0, yB, w, yR - yB);
    // 前坡（背光）
    g.fillStyle = dark;
    g.fillRect(x0, yR, w, yF - yR);
    // 前坡排线（屋脊平行）
    g.save();
    g.beginPath(); g.rect(x0, yR, w, yF - yR); g.clip();
    g.strokeStyle = U.rgba(OLD.ink, .28); g.lineWidth = .75;
    g.beginPath();
    for (let y = yR + 2.5; y < yF; y += 2.7) { g.moveTo(x0, y); g.lineTo(x1, y); }
    g.stroke();
    g.restore();
    // 临街的墙
    g.fillStyle = '#f9f3e1';
    g.fillRect(x0, yF, w, yW - yF);
    g.fillStyle = U.rgba(OLD.ink, .06);
    g.fillRect(x0, yW - (yW - yF) * .28, w, (yW - yF) * .28);
    // 条纹雨篷
    if (rng() < .3 && w > 14) {
      g.fillStyle = OLD.kiln;
      for (let k = 0; k < 4; k++) g.fillRect(x0 + 1 + k * (w - 2) / 4, yF + .4, (w - 2) / 8, 2.2);
    }
    // 门和窗
    const dw = Math.min(3.6, w * .2), dh = Math.min(5.4, (yW - yF) * .72);
    g.fillStyle = U.rgba(OLD.ink, .72);
    g.fillRect(-dw / 2, yW - dh - .6, dw, dh);
    g.strokeStyle = U.rgba(OLD.ink, .55); g.lineWidth = .8;
    g.beginPath();
    if (w > 17) {
      g.rect(x0 + w * .18 - 1.1, yF + (yW - yF) * .30, 2.2, 2.2);
      g.rect(x1 - w * .18 - 1.1, yF + (yW - yF) * .30, 2.2, 2.2);
    }
    g.stroke();
    // 屋檐下的投影
    g.strokeStyle = U.rgba(OLD.ink, .38); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x0 + .5, yF + .6); g.lineTo(x1 - .5, yF + .6); g.stroke();
    // 外轮廓 + 屋脊
    g.strokeStyle = U.rgba(OLD.ink, .9); g.lineWidth = 1.15;
    g.strokeRect(x0, yB, w, yW - yB);
    g.strokeStyle = U.rgba(OLD.ink, .95); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0 - .3, yR); g.lineTo(x1 + .3, yR); g.stroke();
    // 山墙的厚度
    g.strokeStyle = U.rgba(OLD.ink, .45); g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x0, yR); g.lineTo(x0, yW);
    g.moveTo(x1, yR); g.lineTo(x1, yW);
    g.stroke();
    // 烟囱（偶尔两个）
    const n = w > 30 && rng() < .5 ? 2 : 1;
    g.fillStyle = OLD.wall; g.strokeStyle = U.rgba(OLD.ink, .7); g.lineWidth = .9;
    for (let k = 0; k < n; k++) {
      const cx = (k ? 1 : -1) * w * (.18 + rng() * .16);
      const cy = yB + (yR - yB) * (.3 + rng() * .3);
      g.fillRect(cx - 1.7, cy - 2.4, 3.4, 4.2);
      g.strokeRect(cx - 1.7, cy - 2.4, 3.4, 4.2);
    }
  }
  // 广场：图标站的那块浅色铺地
  function oldPlazas(g, e, s) {
    const margin = e.P.sigma * .48;
    const loops = isoLoops(e, margin - e.P.sigma, 7, 12, .013).filter(l => l.length > 6);
    if (!loops.length) return loops;
    const r = U.rng(e.seed ^ 0x51D3);
    g.save();
    // 石头路缘
    g.strokeStyle = '#e4d7b6'; g.lineWidth = 7;
    pathLoops(g, loops); g.stroke();
    g.fillStyle = OLD.pave;
    pathLoops(g, loops); g.fill();
    g.strokeStyle = U.rgba(OLD.ink, .55); g.lineWidth = 1.6;
    pathLoops(g, loops); g.stroke();
    // 铺地：同心环 + 小石块（避开图标）
    U.mask(g, cg => {
      cg.save();
      pathLoops(cg, loops); cg.clip();
      cg.strokeStyle = U.rgba(OLD.ink2, .18); cg.lineWidth = .9;
      for (let d = 9; d < 80; d += 10) {
        cg.beginPath();
        for (const lp of loops) {
          const off = offsetPts(lp, d, true);
          cg.moveTo(off[0][0], off[0][1]);
          for (let i = 1; i < off.length; i++) cg.lineTo(off[i][0], off[i][1]);
          cg.closePath();
        }
        cg.stroke();
      }
      // 铺地小石块：按 13px 网格撒点，外围用轮廓裁掉
      cg.fillStyle = U.rgba(OLD.ink2, .22);
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const lp of loops) for (const p of lp) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      cg.beginPath();
      for (let y = minY, j = 0; y < maxY; y += 13, j++)
        for (let x = minX + (j % 2 ? 6 : 0); x < maxX; x += 13) {
          const px = x + (r() - .5) * 3, py = y + (r() - .5) * 3;
          cg.moveTo(px + 1.1, py);
          cg.arc(px, py, 1.1, 0, TAU);
        }
      cg.fill();
      cg.restore();
    }, U.iconHoles(e, .16));
    // 广场边的树
    for (const lp of loops) {
      const L = polyLen(lp);
      const step = 88 * s;
      const P2 = prepare(lp);
      for (let d = step * .5; d < L; d += step) {
        const o = atLen(P2, d, {});
        const i = Math.min(lp.length - 1, Math.max(1, Math.round(d / L * lp.length)));
        const a = lp[i - 1], b = lp[i];
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l, ny = dx / l;
        const tx = o.x + nx * 15, ty = o.y + ny * 15;
        if (e.field.at(tx, ty) < margin - e.P.sigma + 3) continue;
        if (tx < 14 || ty < 14 || tx > e.W - 14 || ty > e.H - 14) continue;
        oldTree(g, tx, ty, (6 + r() * 5) * s, r);
      }
    }
    // 集市的小摊子：红白篷子，摆在广场边缘的空处
    let stalls = 0;
    for (const lp of loops) {
      if (stalls >= 3) break;
      const L = polyLen(lp), P2 = prepare(lp);
      for (let d = 40; d < L && stalls < 3; d += 150 * s) {
        const o = atLen(P2, d, {});
        const i = Math.min(lp.length - 1, Math.max(1, Math.round(d / L * lp.length)));
        const a = lp[i - 1], b = lp[i];
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l, ny = dx / l;
        const tx = o.x + nx * 6, ty = o.y + ny * 6;
        if (e.field.at(tx, ty) < margin - e.P.sigma + 2) continue;
        if (tx < 26 || ty < 26 || tx > e.W - 26 || ty > e.H - 26) continue;
        if (r() < .45) continue;
        g.save();
        g.translate(tx, ty);
        g.rotate(o.a);
        g.fillStyle = U.rgba(OLD.ink, .14);
        g.fillRect(-8.5, -5.5, 17, 11);
        g.fillStyle = '#fdf6e2'; g.strokeStyle = U.rgba(OLD.ink, .8); g.lineWidth = 1;
        g.fillRect(-8, -5, 16, 10); g.strokeRect(-8, -5, 16, 10);
        g.fillStyle = OLD.kiln;
        for (let k = 0; k < 4; k++) g.fillRect(-8 + k * 4, -5, 2, 10);
        g.restore();
        stalls++;
      }
    }
    g.restore();
    return loops;
  }
  function mapStatic(g, e) {
    const { W, H, P } = e, r = U.rng(e.seed ^ 0x1234);
    const s = U.clamp(Math.min(W, H) / 880, .78, 1.4);
    // 纸
    U.paper(g, W, H, OLD.paper, [['#efe2c0', .42, 5], ['#e8d8b2', .22, 4]], (e.seed ^ 0x7A1) >>> 0);
    fibers(g, e, OLD.ink2, .05, 300);

    const lanes = oldLanes(e);
    const margin = P.sigma * .48;
    const clear = margin + 8 * s - P.sigma;
    // 街区里的小院（先铺，房子压在上面）
    for (let i = 0; i < OLX.length - 1; i++) for (let j = 0; j < OLY.length - 1; j++) {
      const bw = (OLX[i + 1] - OLX[i]) * W, bh = (OLY[j + 1] - OLY[j]) * H;
      if (bw < 120 * s || bh < 92 * s) continue;
      const inset = 42 * s;
      const x0 = OLX[i] * W + inset, x1 = OLX[i + 1] * W - inset;
      const y0 = OLY[j] * H + inset, y1 = OLY[j + 1] * H - inset;
      if (x1 - x0 < 42 || y1 - y0 < 34) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (e.field.at(cx, cy) < clear + 22 * s) continue;
      if (r() > .74) continue;
      oldGarden(g, e, x0, y0, x1, y1, r);
    }
    // 街道（在图标空地前断开）
    const roadSegs = [];
    for (const ln of lanes) {
      for (const seg of cutByField(ln.pts, e, clear)) {
        if (polyLen(seg) < 50 * s) continue;
        roadSegs.push({ pts: seg, hw: ln.hw * s });
      }
    }
    for (const sg of roadSegs) oldStreet(g, sg.pts, sg.hw);
    // 广场
    oldPlazas(g, e, s);

    // 交叉口
    const junc = [];
    for (const x of OLX) for (const y of OLY) junc.push([x * W, y * H]);
    // 房子：沿街两排
    const dens = U.clamp(P.houses, 0, 1);
    const items = [];
    for (const ln of lanes) {
      const P2 = prepare(ln.pts);
      for (const side of [-1, 1]) {
        let d = 8 + r() * 12;
        while (d < P2.len - 8) {
          let w = (15 + r() * 12) * s, dp = (11 + r() * 7) * s;
          if (r() < .07) { w += 13 * s; dp += 3 * s; }        // 偶尔有一栋大房子
          const o = atLen(P2, d, {});
          const nx = Math.cos(o.a + Math.PI / 2), ny = Math.sin(o.a + Math.PI / 2);
          const off = ln.hw * s + dp * .84 + 2.6;
          const cx = o.x + nx * off * side, cy = o.y + ny * off * side;
          d += w + (1 + r() * 4) * s;
          if (cx < 6 || cy < 6 || cx > W - 6 || cy > H - 6) continue;
          if (e.field.at(cx, cy) < clear) continue;
          let nearJ = false;
          for (const j of junc) if (Math.abs(j[0] - cx) < 36 * s && Math.abs(j[1] - cy) < 36 * s) { nearJ = true; break; }
          if (nearJ) continue;
          if (r() < .10 + (1 - dens) * .35) continue;
          const kp = r();
          items.push({ x: cx, y: cy, a: side > 0 ? o.a + Math.PI : o.a, w, d: dp, side, kind: kp < .60 ? 1 : kp < .82 ? 0 : 2, ph: r() });
        }
      }
    }
    // 房子：沿街两排（房子局部 +y 一律朝街）
    for (const it of items) {
      g.save();
      g.translate(it.x, it.y);
      g.rotate(it.a);
      oldHouse(g, it.w, it.d, it.kind, r);
      g.restore();
    }
    // 交叉口的树
    for (const j of junc) {
      if (r() > .42) continue;
      const x = j[0] + (r() - .5) * 40, y = j[1] + (r() - .5) * 40;
      if (x < 16 || y < 16 || x > W - 16 || y > H - 16) continue;
      if (e.field.at(x, y) < clear) continue;
      oldTree(g, x, y, (7 + r() * 5) * s, r);
    }
    // 做旧 + 颗粒
    aging(g, e, U.clamp(P.age, 0, 1), OLD.stain);
    U.vignette(g, W, H, '#6b4a2f', .13);
    U.grain(g, W, H, .06);

    // 马车和行人的路线：街道段
    const movers = [];
    const traffic = U.clamp(P.traffic, 0, 4);
    const carts = Math.round(traffic * 1.6), folks = Math.round(traffic * 1.1);
    const usable = roadSegs.filter(sg => polyLen(sg.pts) > 110 * s).map(sg => prepare(sg.pts));
    for (let i = 0; i < carts + folks && usable.length; i++) {
      const P3 = usable[(i * 7 + 3) % usable.length];
      movers.push({
        path: P3, dir: i % 2 ? -1 : 1,
        off: r() * P3.len, sp: (13 + r() * 9) * s,
        cart: i < carts, sc: (.9 + r() * .25) * s, ph: r() * 6.28
      });
    }
    e.st.map = { moves: movers };
  }
  // 小马车
  function oldCart(g, s, ink) {
    g.fillStyle = U.rgba('#4d3524', .16);
    g.beginPath(); g.ellipse(-3.2 * s, 3.1 * s, 8 * s, 2.4 * s, 0, 0, TAU); g.fill();
    g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round';
    // 马
    g.lineWidth = 1.5 * s;
    g.beginPath(); g.ellipse(6.2 * s, -2.4 * s, 3.2 * s, 1.7 * s, -.08, 0, TAU); g.fill();
    g.beginPath();
    g.moveTo(8.6 * s, -3.2 * s); g.lineTo(10.4 * s, -5.6 * s);       // 脖子
    g.stroke();
    g.beginPath(); g.arc(10.7 * s, -6 * s, 1.15 * s, 0, TAU); g.fill();  // 头
    g.lineWidth = 1.1 * s;
    g.beginPath();
    g.moveTo(4.6 * s, -.9 * s); g.lineTo(4.1 * s, 2.5 * s);
    g.moveTo(7.6 * s, -.9 * s); g.lineTo(7.9 * s, 2.5 * s);
    g.stroke();
    // 车斗
    g.lineWidth = 1.1 * s;
    g.fillStyle = '#fdf8ea';
    g.fillRect(-7.4 * s, -4 * s, 8.2 * s, 5.4 * s);
    g.strokeRect(-7.4 * s, -4 * s, 8.2 * s, 5.4 * s);
    // 轮
    g.beginPath();
    g.arc(-6.1 * s, 2.1 * s, 1.9 * s, 0, TAU);
    g.moveTo(-1.4 * s + 1.9 * s, 2.1 * s);
    g.arc(-1.4 * s, 2.1 * s, 1.9 * s, 0, TAU);
    g.stroke();
    // 车夫
    g.beginPath(); g.arc(-4.6 * s, -5.6 * s, 1.25 * s, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(-4.6 * s, -4.4 * s); g.lineTo(-4.6 * s, -3.2 * s); g.stroke();
  }
  function oldWalker(g, s, ink, ph) {
    const sw = Math.sin(ph) * 2.2 * s;
    g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round';
    g.lineWidth = 1.15 * s;
    g.beginPath(); g.arc(0, -5.2 * s, 1.5 * s, 0, TAU); g.fill();
    g.beginPath();
    g.moveTo(0, -3.6 * s); g.lineTo(0, -.4 * s);
    g.moveTo(0, -.4 * s); g.lineTo(sw, 2.6 * s);
    g.moveTo(0, -.4 * s); g.lineTo(-sw, 2.6 * s);
    g.moveTo(0, -2.6 * s); g.lineTo(2.4 * s, -1.2 * s + sw * .3);
    g.moveTo(0, -2.6 * s); g.lineTo(-2.4 * s, -1.4 * s - sw * .3);
    g.stroke();
    g.fillStyle = U.rgba('#4d3524', .14);
    g.beginPath(); g.ellipse(0, 3.1 * s, 3.4 * s, 1.1 * s, 0, 0, TAU); g.fill();
  }
  function mapPaint(g, e) {
    const st = e.st.map, t = e.t;
    if (!st || !st.moves.length) return;
    for (const m of st.moves) {
      const d = m.off + t * m.sp * m.dir;
      const o = atLen(m.path, d, {});
      const u = (((d % m.path.len) + m.path.len) % m.path.len) / m.path.len;
      const fade = Math.min(1, u / .05, (1 - u) / .05);
      if (fade <= .02) continue;
      g.save();
      g.globalAlpha = fade;
      g.translate(o.x, o.y);
      g.rotate(o.a + (m.dir < 0 ? Math.PI : 0));
      if (m.cart) oldCart(g, m.sc, OLD.ink);
      else oldWalker(g, m.sc, OLD.ink, t * 5.5 + m.ph);
      g.restore();
    }
  }

  /* ================================================================== */
  SCENES.map = {
    title: '手绘城市',
    defaults: { sigma: 60, houses: .7, traffic: 2, age: .5 },
    paintStatic: mapStatic,
    paint: mapPaint
  };

  /* ==================================================================
     2 · 彩色城市：红橙屋顶 + 黄粉蓝的墙，运河、桥、人行横道、小车
     ================================================================== */
  const CITY = {
    street: '#fbf6e9', walk: '#e8deca', block: '#efe6d4',
    water: '#8ecfe2', waterD: '#5fa6c2', waterL: '#c6e9f0', bank: '#ded1b8',
    park: '#93c76c', parkD: '#5f9a4c', parkL: '#badb8e',
    ink: '#5b4636',
    roofs: ['#d9503c', '#e0663f', '#c8452f', '#e8874b', '#cf5a44', '#d97b4a'],
    walls: ['#f2c33f', '#eda6b6', '#94c2da', '#f6ecd8', '#bad29a', '#f0b06a'],
    cars: ['#ef5b4c', '#f6c945', '#5aa9d6', '#f4f1e8', '#7fbf6a', '#e08a5a']
  };
  function distToPath(P, x, y) {
    let best = 1e9;
    const pts = P.pts;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1];
      const dx = pts[i][0] - ax, dy = pts[i][1] - ay;
      const L2 = dx * dx + dy * dy || 1;
      let t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      if (d < best) best = d;
    }
    return best;
  }
  function insetQuad(Q, k) {
    const cx = (Q[0][0] + Q[1][0] + Q[2][0] + Q[3][0]) / 4;
    const cy = (Q[0][1] + Q[1][1] + Q[2][1] + Q[3][1]) / 4;
    return Q.map(p => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]);
  }
  function quadPath(g, Q) {
    g.beginPath();
    g.moveTo(Q[0][0], Q[0][1]);
    for (let i = 1; i < Q.length; i++) g.lineTo(Q[i][0], Q[i][1]);
    g.closePath();
  }
  // 彩色城市的小楼：墙块 + 屋顶 + 一点高光和窗
  function cityHouse(g, x, y, w, h, roofC, wallC, r) {
    const sh = 3.2, rw = w - 2.4, rh = h - 5;
    // 影子
    g.fillStyle = 'rgba(97,79,60,.20)';
    g.fillRect(x + 3.4, y + 4, w, h);
    // 墙
    g.fillStyle = wallC;
    g.fillRect(x, y + sh, w, h - sh + 1);
    // 墙上的小窗
    if (w > 22 && r() < .7) {
      g.fillStyle = 'rgba(70,55,45,.35)';
      g.fillRect(x + 3, y + h - 4.2, 2.6, 2.6);
      g.fillRect(x + w - 6, y + h - 4.2, 2.6, 2.6);
    }
    // 屋顶
    g.fillStyle = roofC;
    g.fillRect(x, y, rw, rh);
    // 屋脊（沿长边一分为二，另一半稍暗）
    if (rw > 14 && rh > 12) {
      g.fillStyle = U.rgba('#c9b49c', .22);
      if (rw > rh) g.fillRect(x, y + rh * .58, rw, rh * .42);
      else g.fillRect(x + rw * .58, y, rw * .42, rh);
      g.strokeStyle = 'rgba(70,48,34,.22)'; g.lineWidth = .9;
      g.beginPath();
      if (rw > rh) { g.moveTo(x + 1, y + rh * .58); g.lineTo(x + rw - 1, y + rh * .58); }
      else { g.moveTo(x + rw * .58, y + 1); g.lineTo(x + rw * .58, y + rh - 1); }
      g.stroke();
    }
    // 屋顶轮廓 + 高光
    g.strokeStyle = 'rgba(70,48,34,.30)'; g.lineWidth = .9;
    g.strokeRect(x, y, rw, rh);
    g.strokeStyle = 'rgba(255,255,255,.34)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x + 1, y + 1); g.lineTo(x + rw - 1, y + 1); g.stroke();
    // 屋顶上的小东西：天窗 / 水箱
    if (rw > 24 && rh > 18 && r() < .4) {
      g.fillStyle = 'rgba(250,244,230,.85)';
      g.fillRect(x + rw * .25, y + rh * .22, 3.4, 3);
      g.strokeStyle = 'rgba(70,48,34,.35)'; g.lineWidth = .7;
      g.strokeRect(x + rw * .25, y + rh * .22, 3.4, 3);
    }
  }
  // 街心公园：草地、小路、树
  function cityPark(g, e, Q, s, r) {
    quadPath(g, Q);
    g.fillStyle = CITY.park; g.fill();
    g.save();
    quadPath(g, Q); g.clip();
    // 草地明暗
    g.fillStyle = CITY.parkL;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of Q) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    }
    g.fillRect(minX, minY, maxX - minX, (maxY - minY) * .34);
    // 小路
    g.strokeStyle = '#f0e4c8'; g.lineWidth = 5 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(minX - 10, (minY + maxY) * .55);
    g.quadraticCurveTo((minX + maxX) * .5, (minY + maxY) * .3, maxX + 10, (minY + maxY) * .48);
    g.stroke();
    // 树
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const tx = minX + 14 + r() * (maxX - minX - 28);
      const ty = minY + 12 + r() * (maxY - minY - 24);
      const rad = (5 + r() * 4) * s;
      g.fillStyle = 'rgba(70,90,50,.18)';
      g.beginPath(); g.arc(tx + rad * .3, ty + rad * .35, rad, 0, TAU); g.fill();
      g.fillStyle = r() < .5 ? CITY.parkD : '#4f8b46';
      g.beginPath(); g.arc(tx, ty, rad, 0, TAU); g.fill();
      g.fillStyle = 'rgba(210,235,160,.45)';
      g.beginPath(); g.arc(tx - rad * .25, ty - rad * .28, rad * .55, 0, TAU); g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(70,90,50,.25)'; g.lineWidth = 1.2;
    quadPath(g, Q); g.stroke();
  }
  // 城市里的一块小广场：石板地 + 四个花坛 + 中间的小喷泉
  function citySquare(g, e, Q, s, r) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of Q) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    }
    g.save();
    quadPath(g, Q);
    g.fillStyle = '#efe6d2'; g.fill();
    g.clip();
    g.strokeStyle = 'rgba(120,100,78,.08)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = minX; x < maxX; x += 13) { g.moveTo(x, minY); g.lineTo(x, maxY); }
    for (let y = minY; y < maxY; y += 13) { g.moveTo(minX, y); g.lineTo(maxX, y); }
    g.stroke();
    // 四个角的花坛
    const bw = Math.min(20 * s, (maxX - minX) * .24), bh = Math.min(18 * s, (maxY - minY) * .24);
    for (const [px, py] of [[minX + 4, minY + 4], [maxX - bw - 4, minY + 4], [minX + 4, maxY - bh - 4], [maxX - bw - 4, maxY - bh - 4]]) {
      g.fillStyle = '#e4dcc6'; g.fillRect(px, py, bw, bh);
      g.fillStyle = CITY.park; g.fillRect(px + 1.6, py + 1.6, bw - 3.2, bh - 3.2);
      g.fillStyle = CITY.parkD;
      g.beginPath(); g.arc(px + bw / 2, py + bh / 2, Math.min(bw, bh) * .3, 0, TAU); g.fill();
    }
    // 喷泉
    const fx = (minX + maxX) / 2, fy = (minY + maxY) / 2, fr = Math.min(13 * s, (maxX - minX) * .2);
    g.fillStyle = '#dfeef0'; g.strokeStyle = 'rgba(95,166,194,.7)'; g.lineWidth = 1.4;
    g.beginPath(); g.ellipse(fx, fy, fr, fr * .68, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#bfe3ea';
    g.beginPath(); g.ellipse(fx, fy, fr * .62, fr * .4, 0, 0, TAU); g.fill();
    g.fillStyle = '#f7f1e4';
    g.beginPath(); g.arc(fx, fy - 1.5 * s, 2.4 * s, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(150,205,220,.8)'; g.lineWidth = 1.1;
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU + .4;
      g.moveTo(fx, fy - 2);
      g.quadraticCurveTo(fx + Math.cos(a) * fr * .3, fy - fr * .5, fx + Math.cos(a) * fr * .55, fy + Math.sin(a) * fr * .3);
    }
    g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(120,100,78,.28)'; g.lineWidth = 1.2;
    quadPath(g, Q); g.stroke();
  }
  // 广场：图标站的地方，外面一圈环形车道
  function cityPlazas(g, e, s, r) {
    const margin = e.P.sigma * .50;
    const loops = isoLoops(e, margin - e.P.sigma, 7, 14, .012).filter(l => l.length > 6);
    if (!loops.length) return [];
    // 广场外环车道（画在广场边上，一半压在城市地面上；太大的广场不放环道）
    for (const lp of loops) {
      if (polyLen(lp) > (e.W + e.H) * .95) continue;
      const out = outwardSign(lp);
      const ring = offsetPts(lp, out, true);
      g.save();
      g.lineJoin = 'round';
      g.strokeStyle = '#ddd0b8'; g.lineWidth = 20;
      pathLoops(g, [ring]); g.stroke();
      g.strokeStyle = CITY.street; g.lineWidth = 16;
      pathLoops(g, [ring]); g.stroke();
      g.strokeStyle = 'rgba(120,100,78,.16)'; g.lineWidth = 1;
      pathLoops(g, [ring]); g.stroke();
      g.restore();
    }
    // 广场铺地
    g.save();
    g.fillStyle = '#f4eee0';
    pathLoops(g, loops); g.fill();
    g.strokeStyle = '#d8cbb4'; g.lineWidth = 5;
    pathLoops(g, loops); g.stroke();
    g.strokeStyle = U.rgba(CITY.ink, .26); g.lineWidth = 1.2;
    pathLoops(g, loops); g.stroke();
    // 铺装（避开图标）
    U.mask(g, cg => {
      cg.save();
      pathLoops(cg, loops); cg.clip();
      cg.strokeStyle = 'rgba(120,100,78,.16)'; cg.lineWidth = 1;
      cg.beginPath();
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const lp of loops) for (const p of lp) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      }
      for (let x = minX; x < maxX; x += 15) { cg.moveTo(x, minY); cg.lineTo(x, maxY); }
      for (let y = minY; y < maxY; y += 15) { cg.moveTo(minX, y); cg.lineTo(maxX, y); }
      cg.stroke();
      // 几丛绿化
      for (const lp of loops) {
        const P2 = prepare(lp), L = P2.len, sgn = Math.sign(outwardSign(lp)) || 1;
        for (let d = 60; d < L; d += 120 * s) {
          const o = atLen(P2, d, {});
          const i = Math.min(lp.length - 1, Math.max(1, Math.round(d / L * lp.length)));
          const a = lp[i - 1], b = lp[i];
          const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
          const nx = -dy / l, ny = dx / l;
          const tx = o.x - nx * sgn * 30, ty = o.y - ny * sgn * 30;
          cg.fillStyle = 'rgba(120,150,88,.20)';
          cg.beginPath(); cg.ellipse(tx, ty, 13 * s, 8 * s, o.a, 0, TAU); cg.fill();
        }
      }
      cg.restore();
    }, U.iconHoles(e, .3));
    // 广场里的树和长椅
    for (const lp of loops) {
      const P2 = prepare(lp), L = P2.len, sgn = Math.sign(outwardSign(lp)) || 1;
      const n = Math.max(2, Math.round(L / (82 * s)));
      for (let k = 0; k < n; k++) {
        if (r() < .3) continue;
        const d = ((k + .1 + r() * .7) / n) * L;
        const o = atLen(P2, d, {});
        const i = Math.min(lp.length - 1, Math.max(1, Math.round(d / L * lp.length)));
        const a = lp[i - 1], b = lp[i];
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l, ny = dx / l;
        const tx = o.x - nx * sgn * (12 + r() * 12), ty = o.y - ny * sgn * (12 + r() * 12);
        // 树要离图标至少 10px（图标本身是空的），也不能出画布
        if (e.field.at(tx, ty) < e.P.sigma * -1 + 10) continue;
        if (tx < 12 || ty < 12 || tx > e.W - 12 || ty > e.H - 12) continue;
        const rad = (4.5 + r() * 4) * s;
        g.fillStyle = 'rgba(70,90,50,.16)';
        g.beginPath(); g.arc(tx + rad * .3, ty + rad * .35, rad, 0, TAU); g.fill();
        g.fillStyle = r() < .5 ? CITY.parkD : '#6aa84f';
        g.beginPath(); g.arc(tx, ty, rad, 0, TAU); g.fill();
        g.fillStyle = 'rgba(210,235,160,.4)';
        g.beginPath(); g.arc(tx - rad * .25, ty - rad * .28, rad * .5, 0, TAU); g.fill();
      }
    }
    g.restore();
    // 环道中心线（给小车用）
    const rings = [];
    for (const lp of loops) {
      if (polyLen(lp) > (e.W + e.H) * .95) continue;
      const ring = offsetPts(lp, outwardSign(lp), true);
      ring.push(ring[0]);
      rings.push(prepare(ring));
    }
    return rings;
  }
  // 等值线朝外是哪个方向
  function outwardSign(lp) {
    let cx = 0, cy = 0;
    for (const p of lp) { cx += p[0]; cy += p[1]; }
    cx /= lp.length; cy /= lp.length;
    const o = offsetPts(lp, 5, true);
    let d0 = 0, d1 = 0;
    const st = Math.max(1, (lp.length / 18) | 0);
    for (let i = 0; i < lp.length; i += st) {
      d0 += Math.hypot(lp[i][0] - cx, lp[i][1] - cy);
      d1 += Math.hypot(o[i][0] - cx, o[i][1] - cy);
    }
    return d1 > d0 ? 5 : -5;
  }
  // 运河中心线
  function canalPath(e) {
    const { W, H } = e;
    const pts = [];
    const x0 = W * .615;
    for (let y = -60; y <= H + 60; y += 20) {
      const k = y / H;
      pts.push([x0 + Math.sin(k * 3.2 + .8) * W * .028 + (e.noise.n(k * 3.4 + 7.7, 2.3) - .5) * W * .05, y]);
    }
    return prepare(pts);
  }
  function cityStatic(g, e) {
    const { W, H, P } = e, r = U.rng(e.seed ^ 0xC17), s = U.clamp(Math.min(W, H) / 880, .76, 1.3);
    const sat = U.clamp(P.color, 0, 1);
    const dens = U.clamp(P.houses, 0, 1);
    // 纸（街道底色）
    g.fillStyle = CITY.street; g.fillRect(0, 0, W, H);
    fibers(g, e, '#c9b79b', .07, 260);
    const canal = canalPath(e);
    const cw = 17 * s;                                   // 运河半宽
    // 网格
    const stepX = 136 * s, stepY = 118 * s;
    const cols = Math.ceil(W / stepX) + 3, rows = Math.ceil(H / stepY) + 3;
    const nodes = [];
    for (let i = 0; i < cols; i++) {
      nodes.push([]);
      for (let j = 0; j < rows; j++) {
        nodes[i].push([
          -stepX + i * stepX + (e.noise.n(i * .62 + 2.3, j * .62 + 5.1) - .5) * 22 * s,
          -stepY + j * stepY + (e.noise.n(i * .62 + 17.7, j * .62 + 9.4) - .5) * 20 * s
        ]);
      }
    }
    // 桥：运河上的两个路口
    const bridges = [];
    for (const fy of [.34, .71]) {
      let best = null, bd = 1e9;
      for (const p of canal.pts) {
        const d = Math.abs(p[1] - H * fy);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) bridges.push([best[0], H * fy]);
    }
    const clear = P.sigma * .58 + 12 * s;                // 图标空地：广场
    // 街区
    const blockList = [];
    for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows - 1; j++) {
      const Q = [nodes[i][j], nodes[i + 1][j], nodes[i + 1][j + 1], nodes[i][j + 1]];
      const cx = (Q[0][0] + Q[1][0] + Q[2][0] + Q[3][0]) / 4;
      const cy = (Q[0][1] + Q[1][1] + Q[2][1] + Q[3][1]) / 4;
      if (cx < -40 || cy < -40 || cx > W + 40 || cy > H + 40) continue;
      const fv = e.field.at(cx, cy);
      if (fv < clear + 12) continue;                     // 留给广场
      if (distToPath(canal, cx, cy) < cw + 46 * s) continue;
      const P1 = insetQuad(Q, .905);
      const P2 = insetQuad(Q, .888);
      const r0 = r();
      if (r0 < .115) cityPark(g, e, P2, s, r);
      else if (r0 < .16) citySquare(g, e, P2, s, r);
      else {
        // 街区底（楼间的地面）
        quadPath(g, P1);
        g.fillStyle = '#e7dcc6'; g.fill();
        g.strokeStyle = 'rgba(120,100,78,.14)'; g.lineWidth = 1; g.stroke();
        g.save();
        quadPath(g, P2); g.clip();
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (const p of P2) {
          minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
          minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        }
        g.fillStyle = '#e9dfca'; g.fillRect(minX, minY, maxX - minX, maxY - minY);
        // 有些街区中间留一个小院
        let yard = null;
        if (r() < .26 && maxX - minX > 80 * s && maxY - minY > 70 * s) {
          const yw = (maxX - minX) * (.28 + r() * .16), yh = (maxY - minY) * (.28 + r() * .16);
          yard = {
            x: minX + (maxX - minX - yw) * (.25 + r() * .5),
            y: minY + (maxY - minY - yh) * (.25 + r() * .5),
            w: yw, h: yh
          };
        }
        for (let x = minX + 2.5 * s; x < maxX - 12 * s;) {
          const bw = (19 + r() * 22) * s;
          for (let y = minY + 2.5 * s; y < maxY - 9 * s;) {
            const bh = (15 + r() * 18) * s;
            if (yard && x < yard.x + yard.w + 3 && x + bw > yard.x - 3 &&
              y < yard.y + yard.h + 3 && y + bh > yard.y - 3) {
              y += 7 * s;
              continue;
            }
            const roof = U.mix(CITY.roofs[(r() * CITY.roofs.length) | 0], '#ddd0bb', (1 - sat) * .22);
            const wall = U.mix(CITY.walls[(r() * CITY.walls.length) | 0], '#efe6d4', (1 - sat) * .3);
            // houses 越小，空出来的院子 / 空地越多（只空小房子，街区轮廓还是满的）
            if (bh < 26 * s && r() < (1 - dens) * .22) { y += bh + (1.4 + r() * 2.4) * s; continue; }
            cityHouse(g, x, y, bw, bh, roof, wall, r);
            y += bh + (1.4 + r() * 2.4) * s;
          }
          x += bw + (1.6 + r() * 2.4) * s;
        }
        // 小院里的树
        if (yard) {
          g.fillStyle = '#efe6d2';
          g.fillRect(yard.x, yard.y, yard.w, yard.h);
          g.strokeStyle = 'rgba(120,100,78,.22)'; g.lineWidth = 1;
          g.strokeRect(yard.x + .5, yard.y + .5, yard.w - 1, yard.h - 1);
          const tn = 1 + Math.round(r() * 2);
          for (let k = 0; k < tn; k++) {
            const tx = yard.x + 9 + r() * (yard.w - 18), ty = yard.y + 8 + r() * (yard.h - 16);
            const rad = (4.5 + r() * 3) * s;
            g.fillStyle = 'rgba(70,90,50,.18)';
            g.beginPath(); g.arc(tx + rad * .3, ty + rad * .35, rad, 0, TAU); g.fill();
            g.fillStyle = '#5f9a4c';
            g.beginPath(); g.arc(tx, ty, rad, 0, TAU); g.fill();
            g.fillStyle = 'rgba(200,230,150,.45)';
            g.beginPath(); g.arc(tx - rad * .25, ty - rad * .28, rad * .5, 0, TAU); g.fill();
          }
        }
        g.restore();
        blockList.push(P2);
      }
    }
    // 运河（盖住街区）
    U.mask(g, cg => {
      cg.save();
      cg.lineCap = 'round'; cg.lineJoin = 'round';
      cg.strokeStyle = CITY.bank; cg.lineWidth = cw * 2 + 10 * s; strokePts(cg, canal.pts);
      cg.strokeStyle = 'rgba(110,90,68,.35)'; cg.lineWidth = cw * 2 + 2.6; strokePts(cg, canal.pts);
      cg.strokeStyle = CITY.water; cg.lineWidth = cw * 2; strokePts(cg, canal.pts);
      cg.strokeStyle = U.rgba(CITY.waterL, .55); cg.lineWidth = cw * .9; strokePts(cg, canal.pts);
      // 水纹
      cg.strokeStyle = U.rgba('#ffffff', .38); cg.lineWidth = 1.4; cg.lineCap = 'round';
      cg.beginPath();
      for (let d = 40; d < canal.len; d += 46) {
        const o = atLen(canal, d, {});
        const nx = Math.cos(o.a + Math.PI / 2), ny = Math.sin(o.a + Math.PI / 2);
        for (let k = -1; k <= 1; k++) {
          const px = o.x + nx * k * cw * .5, py = o.y + ny * k * cw * .5;
          cg.moveTo(px - 5, py);
          cg.quadraticCurveTo(px, py - 2.4, px + 5, py);
        }
      }
      cg.stroke();
      // 两条小船
      for (let i = 0; i < 2; i++) {
        const o = atLen(canal, (i + .55) * canal.len * .5, {});
        cg.save(); cg.translate(o.x, o.y); cg.rotate(o.a);
        cg.fillStyle = 'rgba(70,55,40,.18)';
        cg.beginPath(); cg.ellipse(0, 2, 11 * s, 3.4 * s, 0, 0, TAU); cg.fill();
        cg.fillStyle = '#f7efdd'; cg.strokeStyle = 'rgba(90,72,52,.6)'; cg.lineWidth = 1;
        cg.beginPath(); cg.ellipse(0, 0, 11 * s, 3.6 * s, 0, 0, TAU); cg.fill(); cg.stroke();
        cg.fillStyle = CITY.roofs[0];
        cg.fillRect(-3.4 * s, -2.6 * s, 6.8 * s, 5.2 * s);
        cg.restore();
      }
      cg.restore();
    }, U.iconHoles(e, .55));
    // 桥
    for (const b of bridges) {
      const half = (cw + 9 * s) * 1.35, th = 13 * s;
      g.save();
      g.fillStyle = 'rgba(70,55,40,.20)';
      g.fillRect(b[0] - half + 3, b[1] - th + 4, half * 2, th * 2);
      g.fillStyle = '#f6eedc'; g.strokeStyle = 'rgba(110,88,64,.45)'; g.lineWidth = 1.4;
      g.fillRect(b[0] - half, b[1] - th, half * 2, th * 2);
      g.strokeRect(b[0] - half, b[1] - th, half * 2, th * 2);
      g.strokeStyle = 'rgba(110,88,64,.30)'; g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const px = b[0] - half + 4 + k * (half * 2 - 8) / 5;
        g.moveTo(px, b[1] - th + 3); g.lineTo(px, b[1] + th - 3);
      }
      g.stroke();
      g.strokeStyle = 'rgba(110,88,64,.5)'; g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(b[0] - half + 2, b[1] - th + 1.5); g.lineTo(b[0] + half - 2, b[1] - th + 1.5);
      g.moveTo(b[0] - half + 2, b[1] + th - 1.5); g.lineTo(b[0] + half - 2, b[1] + th - 1.5);
      g.stroke();
      g.restore();
    }
    // 运河边的行道树
    for (let d = 80; d < canal.len; d += 64 * s) {
      if (r() < .3) continue;
      const o = atLen(canal, d, {});
      const nx = Math.cos(o.a + Math.PI / 2), ny = Math.sin(o.a + Math.PI / 2);
      for (const side of [-1, 1]) {
        if (r() < .25) continue;
        const tx = o.x + nx * (cw + (10 + r() * 8) * s) * side, ty = o.y + ny * (cw + (10 + r() * 8) * s) * side;
        if (tx < 14 || ty < 14 || tx > W - 14 || ty > H - 14) continue;
        if (e.field.at(tx, ty) < clear) continue;
        const rad = (4 + r() * 3) * s;
        g.fillStyle = 'rgba(70,90,50,.16)';
        g.beginPath(); g.arc(tx + rad * .3, ty + rad * .35, rad, 0, TAU); g.fill();
        g.fillStyle = '#5f9a4c';
        g.beginPath(); g.arc(tx, ty, rad, 0, TAU); g.fill();
        g.fillStyle = 'rgba(200,230,150,.45)';
        g.beginPath(); g.arc(tx - rad * .25, ty - rad * .28, rad * .5, 0, TAU); g.fill();
      }
    }
    // 人行横道：挑几个路口
    for (let i = 1; i < cols - 1; i++) for (let j = 1; j < rows - 1; j++) {
      if (r() > .34) continue;
      const p = nodes[i][j];
      if (e.field.at(p[0], p[1]) < clear + 20) continue;
      if (distToPath(canal, p[0], p[1]) < cw + 26 * s) continue;
      const a = Math.atan2(nodes[i + 1][j][1] - nodes[i - 1][j][1], nodes[i + 1][j][0] - nodes[i - 1][j][0]);
      g.save();
      g.translate(p[0], p[1]);
      g.rotate(a + Math.PI / 2);
      g.fillStyle = 'rgba(255,255,255,.72)';
      for (let k = -2; k <= 2; k++) g.fillRect(-5 * s, k * 3.6 * s - 1 * s, 10 * s, 1.8 * s);
      g.restore();
    }
    // 广场（盖在城区上）
    const rings = cityPlazas(g, e, s, r);
    // 颗粒
    U.vignette(g, W, H, '#6b5540', .12);
    U.grain(g, W, H, .05);

    // 车道：网格线 + 广场环道
    const lanes = [];
    for (let j = 0; j < rows; j++) {
      const pts = [];
      for (let i = 0; i < cols; i++) pts.push(nodes[i][j]);
      lanes.push(pts);
    }
    for (let i = 0; i < cols; i++) {
      const pts = [];
      for (let j = 0; j < rows; j++) pts.push(nodes[i][j]);
      lanes.push(pts);
    }
    const lanePaths = [];
    for (const pts of lanes) {
      let cur = null;
      for (const p of pts) {
        const onBridge = bridges.some(b => Math.hypot(b[0] - p[0], b[1] - p[1]) < 40 * s);
        const ok = (distToPath(canal, p[0], p[1]) > cw + 8 * s || onBridge) && e.field.at(p[0], p[1]) > clear - 4;
        if (ok) {
          if (!cur) { cur = []; lanePaths.push(cur); }
          cur.push(p);
        } else cur = null;
      }
    }
    const usable = lanePaths.filter(a => polyLen(a) > 120 * s).map(a => prepare(a));
    const cars = [];
    const carN = Math.round(3 + U.clamp(P.traffic, 0, 4) * 2.4);
    for (let i = 0; i < carN && usable.length; i++) {
      const path = usable[(i * 5 + 2) % usable.length];
      cars.push({
        path, off: r() * path.len, sp: (20 + r() * 16) * s, dir: i % 2 ? -1 : 1,
        col: CITY.cars[(r() * CITY.cars.length) | 0], sc: (.85 + r() * .3) * s
      });
    }
    for (const ring of rings) {
      cars.push({
        path: ring, off: r() * ring.len, sp: (18 + r() * 8) * s, dir: r() < .5 ? 1 : -1,
        col: CITY.cars[(r() * CITY.cars.length) | 0], sc: .9 * s
      });
    }
    // 鸟
    const birds = [];
    for (let i = 0; i < 5; i++) birds.push({ x: r(), y: .1 + r() * .5, ph: r() * 6.28, sp: .02 + r() * .02, sc: .6 + r() * .5 });
    e.st.city = { cars, birds };
  }
  function cityCar(g, s, col) {
    g.fillStyle = 'rgba(70,55,40,.22)';
    g.beginPath(); g.ellipse(1.4 * s, 2.6 * s, 8.2 * s, 3.6 * s, 0, 0, TAU); g.fill();
    g.fillStyle = col;
    U.roundRect(g, -8 * s, -4 * s, 16 * s, 8 * s, 2.6 * s); g.fill();
    g.fillStyle = U.mix(col, '#ffffff', .38);
    U.roundRect(g, -2.6 * s, -3.1 * s, 7.4 * s, 6.2 * s, 1.6 * s); g.fill();
    g.fillStyle = 'rgba(64,88,104,.6)';
    g.fillRect(2.2 * s, -2.4 * s, 1.8 * s, 4.8 * s);
    g.fillStyle = 'rgba(45,36,28,.6)';
    g.fillRect(-6.6 * s, -4.6 * s, 2.6 * s, 1.3 * s);
    g.fillRect(4.2 * s, -4.6 * s, 2.6 * s, 1.3 * s);
    g.fillRect(-6.6 * s, 3.6 * s, 2.6 * s, 1.3 * s);
    g.fillRect(4.2 * s, 3.6 * s, 2.6 * s, 1.3 * s);
  }
  function cityPaint(g, e) {
    const st = e.st.city, t = e.t;
    if (!st) return;
    for (const c of st.cars) {
      const d = c.off + t * c.sp * c.dir;
      const o = atLen(c.path, d, {});
      const u = (((d % c.path.len) + c.path.len) % c.path.len) / c.path.len;
      const fade = Math.min(1, u / .04, (1 - u) / .04);
      if (fade <= .02) continue;
      g.save();
      g.globalAlpha = fade;
      g.translate(o.x, o.y);
      g.rotate(o.a + (c.dir < 0 ? Math.PI : 0));
      cityCar(g, c.sc, c.col);
      g.restore();
    }
    // 鸟：两三笔画出的海鸥
    for (const b of st.birds) {
      const x = ((b.x + t * b.sp * .12) % 1.2 - .1) * e.W;
      const y = b.y * e.H + Math.sin(t * .7 + b.ph) * 12;
      const sc = b.sc * (1 + Math.sin(t * 2.2 + b.ph) * .12);
      g.strokeStyle = 'rgba(72,62,54,.42)';
      g.lineWidth = 1.5 * sc;
      g.beginPath();
      g.moveTo(x - 7 * sc, y);
      g.quadraticCurveTo(x - 3 * sc, y - 4 * sc, x, y - .6 * sc);
      g.quadraticCurveTo(x + 3 * sc, y - 4 * sc, x + 7 * sc, y);
      g.stroke();
    }
  }
  SCENES.citymap = {
    title: '彩色城市',
    defaults: { sigma: 60, houses: .7, traffic: 2, color: .8 },
    paintStatic: cityStatic,
    paint: cityPaint
  };

  /* ==================================================================
     3 · 老地图：羊皮纸大陆，墨线海岸 + 平行排线，山脉、森林、城镇、马车
     图标所在的空地直接变成海/湖，海岸线绕开图标，所以图标总在安静的水面上。
     ================================================================== */
  const WM = {
    paper: '#ddc492', land: '#ddc492', landHi: '#e8d6ad', landLo: '#cfb57f',
    sea: '#f8eed3', ink: '#553d20', ink2: '#7d6038', coast: '#4a3418',
    green: '#b4b183', greenD: '#7f7d4e', red: '#a8562f', stain: '#8a6432'
  };
  function inwardSign(lp) {
    let cx = 0, cy = 0;
    for (const p of lp) { cx += p[0]; cy += p[1]; }
    cx /= lp.length; cy /= lp.length;
    const o = offsetPts(lp, 5, true);
    let d0 = 0, d1 = 0;
    for (let i = 0; i < lp.length; i += 3) {
      d0 += Math.hypot(lp[i][0] - cx, lp[i][1] - cy);
      d1 += Math.hypot(o[i][0] - cx, o[i][1] - cy);
    }
    return d1 < d0 ? 5 : -5;
  }
  // 老地图的小山：三角形，右坡背光，斜排线
  function wmPeak(g, x, y, w, h, r) {
    const px = x + (r() - .5) * w * .22;
    const L = [x - w / 2, y], R = [x + w / 2, y], T = [px, y - h];
    g.fillStyle = U.rgba(WM.coast, .10);
    g.beginPath(); g.ellipse(x + w * .06, y + 2.4, w * .52, 3.6, 0, 0, TAU); g.fill();
    U.poly(g, [L, T, R], '#eddcb4');
    // 背光的右坡
    g.save();
    g.beginPath(); g.moveTo(px, y - h); g.lineTo(x + w / 2, y); g.lineTo(x, y); g.closePath();
    g.clip();
    g.fillStyle = '#dcc79c'; g.fillRect(x, y - h, w, h);
    g.strokeStyle = U.rgba(WM.coast, .38); g.lineWidth = .8;
    g.beginPath();
    for (let i = -h; i < w; i += 3.4) { g.moveTo(x + i, y - h); g.lineTo(x + i + h, y); }
    g.stroke();
    g.restore();
    // 轮廓 + 山脊
    g.strokeStyle = U.rgba(WM.ink, .85); g.lineWidth = 1.15;
    g.beginPath(); g.moveTo(L[0], L[1]); g.lineTo(T[0], T[1]); g.lineTo(R[0], R[1]); g.stroke();
    g.strokeStyle = U.rgba(WM.ink, .35); g.lineWidth = .8;
    g.beginPath(); g.moveTo(px, y - h + 2); g.lineTo(px + w * .04, y - 1); g.stroke();
    g.strokeStyle = U.rgba(WM.ink, .55); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(L[0] - 1, L[1]); g.lineTo(R[0] + 1, R[1]); g.stroke();
  }
  // 老地图的树：一小团墨线树冠 + 树干
  function wmTree(g, x, y, s, r) {
    g.strokeStyle = U.rgba(WM.coast, .55); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 2.6 * s); g.stroke();
    g.fillStyle = WM.green;
    g.beginPath();
    g.moveTo(x - 3.4 * s, y - 2.6 * s);
    g.arc(x - 1.8 * s, y - 3.2 * s, 1.9 * s, Math.PI, 0);
    g.arc(x + .4 * s, y - 4.2 * s, 2.2 * s, Math.PI, 0);
    g.arc(x + 2.4 * s, y - 3.1 * s, 1.8 * s, Math.PI, 0);
    g.lineTo(x + 3.4 * s, y - 2.6 * s);
    g.closePath();
    g.fill();
    g.strokeStyle = U.rgba(WM.greenD, .6); g.lineWidth = .9;
    g.beginPath(); g.arc(x - 1.8 * s, y - 3.2 * s, 1.9 * s, Math.PI, 0); g.stroke();
    g.beginPath(); g.arc(x + .4 * s, y - 4.2 * s, 2.2 * s, Math.PI, 0); g.stroke();
    g.strokeStyle = U.rgba(WM.coast, .45);
    g.beginPath(); g.moveTo(x - 2.8 * s, y - 1.6 * s); g.lineTo(x + 2.8 * s, y - 1.6 * s); g.stroke();
  }
  // 老地图的城镇：几栋小房子 + 一座教堂塔
  function wmTown(g, x, y, s, r) {
    const n = 4 + Math.round(r() * 4);
    g.fillStyle = U.rgba(WM.coast, .10);
    g.beginPath(); g.ellipse(x + 3, y + 3, 15 * s, 5 * s, 0, 0, TAU); g.fill();
    // 教堂塔
    const tx = x - 9 * s, ty = y - 6 * s;
    g.fillStyle = '#f3e7c8'; g.strokeStyle = U.rgba(WM.ink, .8); g.lineWidth = 1;
    g.fillRect(tx - 2.6 * s, ty, 5.2 * s, 12 * s);
    g.strokeRect(tx - 2.6 * s, ty, 5.2 * s, 12 * s);
    g.beginPath(); g.moveTo(tx - 3.4 * s, ty); g.lineTo(tx, ty - 7 * s); g.lineTo(tx + 3.4 * s, ty);
    g.closePath(); g.fillStyle = '#e8d7ae'; g.fill(); g.stroke();
    g.fillStyle = U.rgba(WM.red, .7);
    g.beginPath(); g.arc(tx, ty - 1.4 * s, 1.1 * s, 0, TAU); g.fill();
    // 一排小房子
    for (let i = 0; i < n; i++) {
      const bx = x - 4 * s + (i - n / 2) * 6.4 * s;
      const by = y + (r() - .5) * 12 * s;
      const bw = 5.4 * s, bh = 5.4 * s;
      g.fillStyle = '#f7edd2'; g.strokeStyle = U.rgba(WM.ink, .75); g.lineWidth = 1;
      g.fillRect(bx, by, bw, bh);
      g.strokeRect(bx, by, bw, bh);
      g.fillStyle = r() < .55 ? U.rgba(WM.red, .55) : '#e0cda2';
      g.beginPath(); g.moveTo(bx - .8 * s, by); g.lineTo(bx + bw / 2, by - 4 * s); g.lineTo(bx + bw + .8 * s, by);
      g.closePath(); g.fill();
      g.strokeStyle = U.rgba(WM.ink, .7); g.stroke();
      g.fillStyle = U.rgba(WM.ink, .45);
      g.fillRect(bx + bw * .36, by + bh * .45, 1.5 * s, 2.8 * s);
    }
  }
  // 罗盘玫瑰
  function wmCompass(g, x, y, rad, r) {
    g.save();
    g.strokeStyle = U.rgba(WM.ink, .5); g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
    g.strokeStyle = U.rgba(WM.ink, .3); g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, rad * .74, 0, TAU); g.stroke();
    g.fillStyle = U.rgba(WM.ink, .06);
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU - Math.PI / 2;
      const big = i % 2 === 0;
      const len = big ? rad * .94 : rad * .6;
      const half = big ? .16 : .12;
      const b1 = [x + Math.cos(a - half) * rad * .16, y + Math.sin(a - half) * rad * .16];
      const b2 = [x + Math.cos(a + half) * rad * .16, y + Math.sin(a + half) * rad * .16];
      const tip = [x + Math.cos(a) * len, y + Math.sin(a) * len];
      // 两半：一半填墨，一半留白
      g.beginPath(); g.moveTo(x, y); g.lineTo(b1[0], b1[1]); g.lineTo(tip[0], tip[1]); g.closePath();
      g.fillStyle = U.rgba(WM.ink, big ? .68 : .46); g.fill();
      g.strokeStyle = U.rgba(WM.ink, .75); g.lineWidth = .9; g.stroke();
      g.beginPath(); g.moveTo(x, y); g.lineTo(b2[0], b2[1]); g.lineTo(tip[0], tip[1]); g.closePath();
      g.fillStyle = '#f6ecd0'; g.fill(); g.stroke();
    }
    g.fillStyle = U.rgba(WM.ink, .8);
    g.beginPath(); g.arc(x, y, rad * .09, 0, TAU); g.fill();
    g.fillStyle = '#f6ecd0';
    g.beginPath(); g.arc(x, y, rad * .04, 0, TAU); g.fill();
    g.restore();
  }
  // 海怪：三个驼峰 + 探出来的头
  function wmSerpent(g, x, y, s) {
    g.save();
    g.strokeStyle = U.rgba(WM.ink, .9); g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - 46 * s, y + 4 * s);
    g.bezierCurveTo(x - 34 * s, y - 14 * s, x - 22 * s, y + 14 * s, x - 8 * s, y + 2 * s);
    g.bezierCurveTo(x + 4 * s, y - 12 * s, x + 14 * s, y + 12 * s, x + 26 * s, y + 2 * s);
    g.stroke();
    // 驼峰上的水纹
    g.strokeStyle = U.rgba(WM.ink, .55); g.lineWidth = 1.2;
    g.beginPath();
    for (const [hx, hy] of [[x - 30 * s, y + 3 * s], [x - 14 * s, y + 4 * s], [x + 6 * s, y + 3 * s]]) {
      g.moveTo(hx - 8 * s, hy + 6 * s);
      g.quadraticCurveTo(hx - 4 * s, hy + 3 * s, hx, hy + 6 * s);
      g.quadraticCurveTo(hx + 4 * s, hy + 9 * s, hx + 8 * s, hy + 6 * s);
    }
    g.stroke();
    // 头
    const hx = x - 46 * s, hy = y + 4 * s;
    g.fillStyle = '#f1e2bd';
    g.beginPath();
    g.ellipse(hx - 5 * s, hy - 7 * s, 8 * s, 5.4 * s, -.5, 0, TAU);
    g.fill();
    g.strokeStyle = U.rgba(WM.ink, .9); g.lineWidth = 1.8;
    g.stroke();
    g.fillStyle = WM.ink;
    g.beginPath(); g.arc(hx - 7 * s, hy - 9 * s, 1.1 * s, 0, TAU); g.fill();
    g.strokeStyle = U.rgba(WM.ink, .8); g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(hx - 12 * s, hy - 4 * s); g.lineTo(hx - 16 * s, hy - 2 * s); g.stroke();
    g.restore();
  }
  function worldStatic(g, e) {
    const { W, H, P } = e, r = U.rng(e.seed ^ 0x77A1);
    const s = U.clamp(Math.min(W, H) / 880, .78, 1.35);
    // 羊皮纸
    U.paper(g, W, H, WM.paper, [[WM.landHi, .5, 7], [WM.landLo, .4, 6], ['#d9bf8c', .28, 4]], (e.seed ^ 0x31) >>> 0);
    fibers(g, e, WM.ink2, .07, 420);
    // 大陆上大片平坦的深浅（不用渐变，只叠很淡的色块）
    for (let i = 0; i < 10; i++) {
      const x = r() * W, y = r() * H, rx = 90 + r() * 160, ry = rx * (.4 + r() * .45);
      g.fillStyle = U.rgba(r() < .5 ? WM.landHi : WM.landLo, .055 + r() * .04);
      U.blob(g, x, y, rx, ry, 11, .4, r); g.fill();
    }
    // 沙地的点刻
    g.fillStyle = U.rgba(WM.coast, .18);
    for (let i = 0; i < 1400; i++) {
      const x = r() * W, y = r() * H;
      g.beginPath(); g.arc(x, y, .7 + r() * .8, 0, TAU); g.fill();
    }
    const seaLevel = P.sigma * .8 - P.sigma;
    const inSea = (x, y, pad) => e.field.at(x, y) < seaLevel + (pad || 0);
    // 海
    const sea = isoLoops(e, seaLevel, 8, 52, .0075).filter(l => l.length > 6);
    g.fillStyle = WM.sea;
    pathLoops(g, sea); g.fill();
    // 近岸的平行排线（往海里收）
    g.save();
    pathLoops(g, sea); g.clip();
    for (const lp of sea) {
      const sgn = Math.sign(inwardSign(lp)) || 1;
      for (let k = 1; k <= 3; k++) {
        const off = offsetPts(lp, sgn * (2 + k * 4.5), true);
        g.strokeStyle = U.rgba(WM.coast, .26 - k * .06);
        g.lineWidth = .9;
        g.beginPath();
        g.moveTo(off[0][0], off[0][1]);
        for (let i = 1; i < off.length; i++) g.lineTo(off[i][0], off[i][1]);
        g.closePath(); g.stroke();
      }
    }
    g.restore();
    // 海岸的短排线（铜版画的味道）
    g.strokeStyle = U.rgba(WM.coast, .26); g.lineWidth = .8;
    g.beginPath();
    for (const lp of sea) {
      const P2 = prepare(lp), L = P2.len, sgn = Math.sign(inwardSign(lp)) || 1;
      for (let d = 0; d < L; d += 5.5) {
        const o = atLen(P2, d, {});
        const nx = -Math.sin(o.a), ny = Math.cos(o.a);
        const len = 3 + ((d * 7) % 5);
        g.moveTo(o.x, o.y);
        g.lineTo(o.x + nx * sgn * len, o.y + ny * sgn * len);
      }
    }
    g.stroke();
    // 海岸线
    g.strokeStyle = WM.coast; g.lineWidth = 2.1;
    g.lineJoin = 'round'; g.lineCap = 'round';
    pathLoops(g, sea); g.stroke();
    g.strokeStyle = U.rgba(WM.coast, .28); g.lineWidth = .9;
    pathLoops(g, sea); g.stroke();

    // 海面细节：波纹、海怪
    g.strokeStyle = U.rgba(WM.coast, .32); g.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const x = r() * W, y = r() * H;
      if (!inSea(x, y, -12)) continue;
      const w = 5 + r() * 8;
      g.beginPath();
      g.moveTo(x - w, y);
      g.quadraticCurveTo(x - w * .4, y - 2.6, x, y);
      g.quadraticCurveTo(x + w * .4, y + 2.6, x + w, y);
      g.stroke();
    }
    // 海里的点刻
    g.fillStyle = U.rgba(WM.coast, .2);
    for (let i = 0; i < 700; i++) {
      const x = r() * W, y = r() * H;
      if (!inSea(x, y, -8)) continue;
      g.beginPath(); g.arc(x, y, .6 + r() * .7, 0, TAU); g.fill();
    }
    // 海怪
    {
      let best = null, bestD = -1e9;
      for (let i = 0; i < 60; i++) {
        const x = W * (.1 + r() * .8), y = H * (.15 + r() * .7);
        const d = e.field.at(x, y);
        if (d < bestD) continue;
        if (!inSea(x, y, -50)) continue;
        if (x < 120 || x > W - 120 || y < 100 || y > H - 100) continue;
        bestD = d; best = [x, y];
      }
      if (best) wmSerpent(g, best[0], best[1], s * 1.5);
    }
    // 占位：放东西前先看看有没有冲突
    const spots = [];
    const free = (x, y, rad) => {
      if (x < rad || y < rad || x > W - rad || y > H - rad) return false;
      for (const p of spots) if (Math.hypot(p[0] - x, p[1] - y) < p[2] + rad) return false;
      return true;
    };
    /* ---- 山脉：沿着山脊线排一列，前后叠着 ---- */
    const peakPts = [];
    const chains = [
      [[.14, .30], [.30, .22], [.42, .32], [.50, .28]],
      [[.30, .64], [.44, .70], [.58, .62]],
      [[.64, .16], [.76, .24], [.88, .18]],
      [[.68, .52], [.80, .58], [.90, .52]],
      [[.46, .84], [.58, .78], [.66, .86]]
    ];
    for (const ch of chains) {
      const pts = U.spline(ch.map(([x, y]) => [W * x, H * y]), 10);
      g.strokeStyle = U.rgba(WM.coast, .28); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.stroke();
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acc < 19 * s) continue;
        acc = 0;
        const p = pts[i];
        const w = (30 + r() * 22) * s, h = (26 + r() * 28) * s;
        if (inSea(p[0], p[1], 16)) continue;
        wmPeak(g, p[0], p[1], w, h, r);
        // 前面再压一座小一点的
        if (r() < .6) wmPeak(g, p[0] + w * .48, p[1] + 5 * s, w * .62, h * .52, r);
        spots.push([p[0], p[1], 18 * s]);
        peakPts.push([p[0], p[1], w * .5]);
      }
    }
    /* ---- 森林 ---- */
    for (let i = 0; i < 62; i++) {
      const x = r() * W, y = r() * H;
      if (inSea(x, y, 34)) continue;
      if (!free(x, y, 26 * s)) continue;
      spots.push([x, y, 24 * s]);
      const n = 4 + Math.round(r() * 7);
      for (let k = 0; k < n; k++) {
        const tx = x + (r() - .5) * 44 * s, ty = y + (r() - .5) * 26 * s;
        if (inSea(tx, ty, 26)) continue;
        wmTree(g, tx, ty, (1.05 + r() * .55) * s, r);
      }
    }
    /* ---- 零星的树和土丘 ---- */
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H;
      if (inSea(x, y, 28)) continue;
      wmTree(g, x, y, (.75 + r() * .45) * s, r);
    }
    for (let i = 0; i < 34; i++) {
      const x = r() * W, y = r() * H;
      if (inSea(x, y, 30)) continue;
      const rad = (5 + r() * 8) * s;
      g.strokeStyle = U.rgba(WM.coast, .38); g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, rad, Math.PI, 0); g.stroke();
      g.beginPath(); g.arc(x + rad * .8, y, rad * .55, Math.PI, 0); g.stroke();
      g.strokeStyle = U.rgba(WM.coast, .22);
      g.beginPath();
      for (let k = 1; k < 3; k++) {
        g.moveTo(x - rad * .5 + k * rad * .3, y + 1);
        g.lineTo(x - rad * .5 + k * rad * .3, y + 4 * s);
      }
      g.stroke();
    }
    /* ---- 城镇 ---- */
    const towns = [];
    const townN = Math.round(4 + U.clamp(P.towns, 0, 1) * 14);
    for (let i = 0; i < 140 && towns.length < townN; i++) {
      const x = W * (.05 + r() * .9), y = H * (.09 + r() * .82);
      if (inSea(x, y, 58)) continue;
      if (!free(x, y, 46 * s)) continue;
      spots.push([x, y, 40 * s]);
      wmTown(g, x, y, s * 1.15, r);
      towns.push([x, y]);
    }
    /* ---- 商路：城镇之间弯曲的虚线 ---- */
    const roads = [];
    const built = new Set();
    const pairs = [];
    for (let i = 0; i < towns.length; i++) {
      const near = towns
        .map((t, j) => ({ j, d: Math.hypot(t[0] - towns[i][0], t[1] - towns[i][1]) }))
        .filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
      for (const o of near) {
        const key = Math.min(i, o.j) + ':' + Math.max(i, o.j);
        if (built.has(key)) continue;
        built.add(key);
        pairs.push([i, o.j]);
      }
    }
    for (const [i, j] of pairs) {
      const a = towns[i], b = towns[j];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      let pts = null;
      // 换几种弯法，挑一条不落水的
      for (const bendK of [0, .18, -.18, .34, -.34]) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const bend = bendK * L;
        const c1 = [mx - dy / L * bend, my + dx / L * bend];
        const cand = U.spline([a, c1, b], 12);
        let ok = true;
        for (const p of cand) {
          if (inSea(p[0], p[1], 8)) { ok = false; break; }
          // 不从山顶上翻过去
          for (const q of peakPts) {
            if (Math.hypot(p[0] - q[0], p[1] - q[1]) < q[2] * .8) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (ok) { pts = cand; break; }
      }
      if (!pts) continue;
      // 虚线商路
      g.save();
      g.strokeStyle = U.rgba(WM.ink, .8); g.lineWidth = 1.7;
      g.setLineDash([6, 5]); g.lineCap = 'round';
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
      g.setLineDash([]);
      // 每隔一段画一个小点，像商路上的驿站
      g.fillStyle = U.rgba(WM.ink, .6);
      for (let k = 5; k < pts.length; k += 15) {
        g.beginPath(); g.arc(pts[k][0], pts[k][1], 1.5, 0, TAU); g.fill();
      }
      g.restore();
      roads.push(prepare(pts));
    }
    /* ---- 罗盘玫瑰：挑一个空着的角 ---- */
    const corners = [[W * .86, H * .82], [W * .14, H * .14], [W * .86, H * .16], [W * .14, H * .84]];
    let bestC = null, bestScore = -1e9;
    for (const c of corners) {
      const rad = 58 * s;
      if (c[0] < rad || c[1] < rad || c[0] > W - rad || c[1] > H - rad) continue;
      if (inSea(c[0], c[1], -10)) continue;
      let sc = e.field.at(c[0], c[1]);
      for (const p of spots) sc -= Math.max(0, 1 - Math.hypot(p[0] - c[0], p[1] - c[1]) / (p[2] + rad)) * 400;
      if (sc > bestScore) { bestScore = sc; bestC = c; }
    }
    if (bestC) {
      // 罗盘底下垫一块干净的纸，压住商路和山的排线
      g.fillStyle = WM.paper;
      g.beginPath(); g.arc(bestC[0], bestC[1], 70 * s, 0, TAU); g.fill();
      g.strokeStyle = U.rgba(WM.coast, .25); g.lineWidth = 1;
      g.beginPath(); g.arc(bestC[0], bestC[1], 70 * s, 0, TAU); g.stroke();
      wmCompass(g, bestC[0], bestC[1], 56 * s, r);
    }
    /* ---- 做旧、颗粒 ---- */
    aging(g, e, U.clamp(P.age, 0, 1), WM.stain);
    U.vignette(g, W, H, '#4c3517', .24);
    U.grain(g, W, H, .08);

    // 马车
    const wagons = [];
    const wn = Math.round(U.clamp(P.wagons, 0, 5) * 1.6);
    for (let i = 0; i < wn && roads.length; i++) {
      const path = roads[(i * 3 + 1) % roads.length];
      wagons.push({
        path, off: r() * path.len, sp: (11 + r() * 8) * s, sc: (.95 + r() * .2) * s
      });
    }
    e.st.world = { wagons };
  }
  function wmWagon(g, s, ink) {
    g.fillStyle = 'rgba(70,50,26,.18)';
    g.beginPath(); g.ellipse(-2 * s, 2.6 * s, 7.4 * s, 2 * s, 0, 0, TAU); g.fill();
    g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round';
    // 牛
    g.lineWidth = 1.4 * s;
    g.beginPath(); g.ellipse(6.6 * s, -2 * s, 3.2 * s, 1.7 * s, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(8.8 * s, -2.8 * s); g.lineTo(10.2 * s, -4.6 * s); g.stroke();
    g.beginPath(); g.arc(10.5 * s, -5 * s, 1.1 * s, 0, TAU); g.fill();
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(5 * s, -.8 * s); g.lineTo(4.6 * s, 2.2 * s);
    g.moveTo(8 * s, -.8 * s); g.lineTo(8.4 * s, 2.2 * s);
    g.stroke();
    // 车
    g.fillStyle = '#f3e6c4';
    g.fillRect(-7.6 * s, -3.8 * s, 8 * s, 5 * s);
    g.strokeRect(-7.6 * s, -3.8 * s, 8 * s, 5 * s);
    g.beginPath();
    g.arc(-6 * s, 2 * s, 1.8 * s, 0, TAU);
    g.moveTo(-1.8 * s, 2 * s);
    g.arc(-3.6 * s, 2 * s, 1.8 * s, 0, TAU);
    g.stroke();
    // 车篷
    g.beginPath();
    g.arc(-3.6 * s, -3.8 * s, 3.8 * s, Math.PI, 0);
    g.stroke();
  }
  function worldPaint(g, e) {
    const st = e.st.world, t = e.t;
    if (!st) return;
    for (const m of st.wagons) {
      const period = m.path.len * 2;
      let u = (m.off + t * m.sp) % period;
      let dir = 1;
      if (u > m.path.len) { u = period - u; dir = -1; }
      const o = atLen(m.path, u, {});
      const edge = Math.min(1, Math.min(u, m.path.len - u) / 26);
      g.save();
      g.globalAlpha = .35 + .65 * edge;
      g.translate(o.x, o.y);
      g.rotate(o.a + (dir < 0 ? Math.PI : 0));
      g.scale(1, .9 + .1 * Math.sin(t * 3 + m.off));
      wmWagon(g, m.sc, WM.ink);
      g.restore();
    }
  }
  SCENES.worldmap = {
    title: '老地图',
    defaults: { sigma: 70, towns: .6, wagons: 2, age: .6 },
    paintStatic: worldStatic,
    paint: worldPaint
  };

  /* ==================================================================
     4 · 航海地图：羊皮纸海图。上下两边是陆地（岸线跟着图标退让），
     港口、灯塔、罗盘玫瑰与放射的恒向线，测深数字、波浪、帆船和鲸鱼。
     ================================================================== */
  const NAUT = {
    paper: '#f1e2bd', land: '#e0c995', landHi: '#ebd8af',
    ink: '#48351d', ink2: '#6f5636', coast: '#3d2b14',
    red: '#a8562f', green: '#9a9a6a', stain: '#8a6432'
  };
  // 帆船（侧视）：船身 + 三根桅杆和方帆
  function nauShip(g, s, t, ph) {
    g.strokeStyle = NAUT.ink; g.lineWidth = 1.15;
    g.fillStyle = '#f7edd4';
    g.beginPath();
    g.moveTo(-11 * s, 0);
    g.quadraticCurveTo(-9 * s, 5 * s, -3 * s, 5.4 * s);
    g.lineTo(6 * s, 5.4 * s);
    g.quadraticCurveTo(10 * s, 4.6 * s, 12 * s, -.4 * s);
    g.quadraticCurveTo(8 * s, 1.8 * s, 0, 1.9 * s);
    g.quadraticCurveTo(-8 * s, 1.9 * s, -11 * s, 0);
    g.closePath(); g.fill(); g.stroke();
    // 船尾的小楼
    g.fillRect(-10.5 * s, -4.4 * s, 3.6 * s, 4.6 * s);
    g.strokeRect(-10.5 * s, -4.4 * s, 3.6 * s, 4.6 * s);
    // 桅杆和帆
    for (let i = 0; i < 3; i++) {
      const mx = (-6 + i * 5.6) * s;
      const mh = (13 + i * 3 + Math.sin(i * 1.7) * 2) * s;
      g.beginPath(); g.moveTo(mx, 1.4 * s); g.lineTo(mx, -mh); g.stroke();
      const sw = (4.6 - i * .4) * s;
      g.fillStyle = '#fbf3dc';
      g.beginPath();
      g.moveTo(mx - sw, -mh + 2.4 * s);
      g.quadraticCurveTo(mx, -mh + 9 * s, mx + sw, -mh + 2.4 * s);
      g.lineTo(mx + sw * .8, -mh + 1.6 * s);
      g.quadraticCurveTo(mx, -mh + 6 * s, mx - sw * .8, -mh + 1.6 * s);
      g.closePath(); g.fill(); g.stroke();
      // 帆上的横线
      g.strokeStyle = U.rgba(NAUT.ink, .32); g.lineWidth = .7;
      g.beginPath();
      for (let k = 1; k < 3; k++) {
        const yy = -mh + 2 * s + k * 2.4 * s;
        g.moveTo(mx - sw * .7, yy); g.lineTo(mx + sw * .7, yy);
      }
      g.stroke();
      g.strokeStyle = NAUT.ink; g.lineWidth = 1.15;
    }
    // 旗
    const flag = Math.sin(t * 3 + ph) > 0 ? 1 : -1;
    g.fillStyle = NAUT.red;
    g.beginPath();
    g.moveTo(0, -28 * s);
    g.lineTo(flag * 5 * s, -26 * s);
    g.lineTo(0, -24 * s);
    g.closePath(); g.fill();
  }
  // 鲸鱼：墨线画的背和尾巴
  function nauWhale(g, x, y, s) {
    g.save();
    g.fillStyle = '#e6d4ab';
    g.strokeStyle = U.rgba(NAUT.ink, .9); g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(x - 52 * s, y);
    g.bezierCurveTo(x - 44 * s, y - 20 * s, x - 8 * s, y - 22 * s, x + 12 * s, y - 8 * s);
    g.bezierCurveTo(x + 20 * s, y - 3 * s, x + 26 * s, y + 2 * s, x + 30 * s, y + 6 * s);
    g.bezierCurveTo(x + 20 * s, y + 4 * s, x + 10 * s, y + 7 * s, x + 2 * s, y + 10 * s);
    g.bezierCurveTo(x - 22 * s, y + 18 * s, x - 44 * s, y + 12 * s, x - 52 * s, y);
    g.closePath();
    g.fill(); g.stroke();
    // 尾巴
    g.beginPath();
    g.moveTo(x + 28 * s, y + 4 * s);
    g.bezierCurveTo(x + 40 * s, y - 6 * s, x + 46 * s, y - 22 * s, x + 48 * s, y - 24 * s);
    g.bezierCurveTo(x + 50 * s, y - 10 * s, x + 52 * s, y + 4 * s, x + 58 * s, y - 2 * s);
    g.stroke();
    // 肚子上的线
    g.strokeStyle = U.rgba(NAUT.ink, .45); g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const yy = y + (3 + i * 2.4) * s;
      g.moveTo(x - 36 * s, yy);
      g.quadraticCurveTo(x - 10 * s, yy + 4 * s, x + 8 * s, yy + 1 * s);
    }
    g.stroke();
    // 眼睛和嘴
    g.fillStyle = NAUT.ink;
    g.beginPath(); g.arc(x - 42 * s, y - 5 * s, 1.6 * s, 0, TAU); g.fill();
    g.strokeStyle = U.rgba(NAUT.ink, .7); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - 52 * s, y + 2 * s); g.quadraticCurveTo(x - 46 * s, y + 5 * s, x - 40 * s, y + 3 * s); g.stroke();
    // 水花
    g.strokeStyle = U.rgba(NAUT.ink, .45); g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x - 54 * s, y + 2 * s);
    g.quadraticCurveTo(x - 58 * s, y - 2 * s, x - 62 * s, y + 1 * s);
    g.moveTo(x + 26 * s, y + 8 * s);
    g.quadraticCurveTo(x + 32 * s, y + 11 * s, x + 38 * s, y + 8 * s);
    g.stroke();
    g.restore();
  }
  function nauticalStatic(g, e) {
    const { W, H, P } = e, r = U.rng(e.seed ^ 0x5EA1);
    const s = U.clamp(Math.min(W, H) / 880, .78, 1.35);
    const depth = U.clamp(P.depth, 0, 1);
    // 羊皮纸
    U.paper(g, W, H, NAUT.paper, [[NAUT.landHi, .2, 7], ['#e7d3a5', .16, 6], ['#d8bf8c', .12, 5]], (e.seed ^ 0x9D) >>> 0);
    fibers(g, e, NAUT.ink2, .06, 380);
    // 岸线离图标至少这么远（图标是"安静的海面"）
    const seaMargin = P.sigma * .82;
    const clearField = 20 - P.sigma;
    // 上下两条岸线：靠图标太近就往纸边退
    const top = [], bot = [];
    for (let x = -30; x <= W + 30; x += 10) {
      let y = H * (.115 + Math.sin(x * .0045 + 1.3) * .028 + (e.noise.n(x * .003 + 2.2, 3.1) - .5) * .055);
      for (let k = 0; k < 40 && y > 1 && e.field.at(x, y) < seaMargin; k++) y -= 7;
      top.push([x, Math.max(-4, y)]);
      let b = H - H * (.11 + Math.sin(x * .0052 + 4.1) * .03 + (e.noise.n(x * .003 + 9.7, 7.3) - .5) * .05);
      for (let k = 0; k < 40 && b < H - 1 && e.field.at(x, b) < seaMargin; k++) b += 7;
      bot.push([x, Math.min(H + 4, b)]);
    }
    // 陆地
    g.fillStyle = NAUT.land;
    g.beginPath();
    g.moveTo(-30, -30); g.lineTo(W + 30, -30);
    for (let i = top.length - 1; i >= 0; i--) g.lineTo(top[i][0], top[i][1]);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(-30, H + 30); g.lineTo(W + 30, H + 30);
    for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
    g.closePath(); g.fill();
    // 陆地上的深浅
    g.save();
    g.beginPath();
    g.moveTo(-30, -30); g.lineTo(W + 30, -30);
    for (let i = top.length - 1; i >= 0; i--) g.lineTo(top[i][0], top[i][1]);
    g.closePath();
    g.clip();
    for (let i = 0; i < 8; i++) {
      g.fillStyle = U.rgba(NAUT.landHi, .12);
      U.blob(g, r() * W, r() * H * .12, 60 + r() * 120, 18 + r() * 30, 10, .3, r); g.fill();
    }
    g.restore();
    // 岸线：墨线 + 朝海一面的一排短排线
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = NAUT.coast; g.lineWidth = 2;
    strokePts(g, top); strokePts(g, bot);
    g.strokeStyle = U.rgba(NAUT.coast, .3); g.lineWidth = .9;
    strokePts(g, offsetPts(top, 5, false));
    strokePts(g, offsetPts(bot, -5, false));
    // 短排线
    g.strokeStyle = U.rgba(NAUT.coast, .34); g.lineWidth = .9;
    g.beginPath();
    for (let i = 0; i < top.length; i += 2) {
      const p = top[i], q = top[Math.min(top.length - 1, i + 1)];
      const nx = -(q[1] - p[1]), ny = q[0] - p[0], L = Math.hypot(nx, ny) || 1;
      const len = 4 + ((i * 13) % 6);
      g.moveTo(p[0], p[1]);
      g.lineTo(p[0] + nx / L * len, p[1] + Math.abs(ny / L) * len + 1.5);
    }
    for (let i = 0; i < bot.length; i += 2) {
      const p = bot[i], q = bot[Math.min(bot.length - 1, i + 1)];
      const nx = -(q[1] - p[1]), ny = q[0] - p[0], L = Math.hypot(nx, ny) || 1;
      const len = 4 + ((i * 17) % 6);
      g.moveTo(p[0], p[1]);
      g.lineTo(p[0] + nx / L * len, p[1] - Math.abs(ny / L) * len - 1.5);
    }
    g.stroke();
    // 海岸的平行阴影线
    g.strokeStyle = U.rgba(NAUT.coast, .2); g.lineWidth = .9;
    for (const d of [12, 19]) {
      strokePts(g, offsetPts(top, d, false));
      strokePts(g, offsetPts(bot, -d, false));
    }
    // 岸线的采样函数（找港口、灯塔用）
    const yTop = x => {
      const i = U.clamp(Math.round((x + 30) / 10), 0, top.length - 1);
      return top[i][1];
    };
    const yBot = x => {
      const i = U.clamp(Math.round((x + 30) / 10), 0, bot.length - 1);
      return bot[i][1];
    };
    /* ---- 港口小镇 + 栈桥（上下两条海岸都放） ---- */
    const ports = [];
    const portAt = (cx, y, dir) => {
      // dir = 1：海在下方；dir = -1：海在上方
      if (y < 8 || y > H - 8) return false;
      if (e.field.at(cx, y - dir * 16) < seaMargin) return false;
      if (e.field.at(cx, y + dir * 26) < seaMargin) return false;
      if (ports.some(p => Math.hypot(p[0] - cx, p[1] - y) < 130 * s)) return false;
      for (let k = 0; k < 5; k++) {
        const bx = cx + (k - 2) * 12 * s + (r() - .5) * 4;
        const by = y - dir * (6 + r() * 10 * s);
        g.fillStyle = '#f7efd8'; g.strokeStyle = U.rgba(NAUT.ink, .8); g.lineWidth = 1;
        g.fillRect(bx - 3 * s, by - 4 * s, 6 * s, 4 * s);
        g.strokeRect(bx - 3 * s, by - 4 * s, 6 * s, 4 * s);
        g.fillStyle = r() < .6 ? U.rgba(NAUT.red, .6) : '#ddc79c';
        g.beginPath();
        g.moveTo(bx - 4 * s, by - 4 * s); g.lineTo(bx, by - 8 * s); g.lineTo(bx + 4 * s, by - 4 * s);
        g.closePath(); g.fill();
        g.strokeStyle = U.rgba(NAUT.ink, .7); g.stroke();
      }
      // 栈桥
      g.strokeStyle = U.rgba(NAUT.ink, .8); g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, y + dir * 1); g.lineTo(cx + 7 * s, y + dir * 20 * s); g.stroke();
      g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 1; k <= 4; k++) {
        const px = cx + k * 1.8 * s, py = y + dir * (1 + k * 4.8 * s);
        g.moveTo(px - 2.4 * s, py); g.lineTo(px + 2.4 * s, py);
      }
      g.stroke();
      // 系在栈桥边的小船
      g.strokeStyle = NAUT.ink; g.fillStyle = '#f7ecd2'; g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx + 15 * s, y + dir * 20 * s, 7 * s, 2.6 * s, dir * .12, 0, TAU);
      g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx + 15 * s, y + dir * 20 * s); g.lineTo(cx + 15 * s, y + dir * 11 * s); g.stroke();
      ports.push([cx, y]);
      return true;
    };
    for (const cx of [W * .22, W * .47, W * .68, W * .84]) portAt(cx, yTop(cx), 1);
    for (const cx of [W * .34, W * .58, W * .78]) portAt(cx, yBot(cx), -1);
    /* ---- 灯塔 ---- */
    let lh = null, lhBest = -1;
    for (let x = 40 * s; x < W - 40 * s; x += 14) {
      const y = yTop(x);
      if (y < 24 || e.field.at(x, y - 20) < seaMargin) continue;
      const sc = e.field.at(x, y - 20) - Math.abs(y - H * .1);
      if (sc > lhBest) { lhBest = sc; lh = [x, y]; }
    }
    if (lh) {
      const x = lh[0], y = lh[1];
      // 岩石
      g.fillStyle = '#cdb88a'; g.strokeStyle = U.rgba(NAUT.ink, .6); g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - 18 * s, y + 2);
      g.lineTo(x - 10 * s, y - 4 * s);
      g.lineTo(x + 8 * s, y - 3 * s);
      g.lineTo(x + 17 * s, y + 2);
      g.closePath(); g.fill(); g.stroke();
      // 塔身
      const tw = 5 * s;
      const h = 30 * s;
      g.fillStyle = '#f8efd8';
      g.beginPath();
      g.moveTo(x - tw, y - 3 * s);
      g.lineTo(x - tw * .62, y - h);
      g.lineTo(x + tw * .62, y - h);
      g.lineTo(x + tw, y - 3 * s);
      g.closePath(); g.fill();
      g.strokeStyle = U.rgba(NAUT.ink, .85); g.lineWidth = 1.2; g.stroke();
      // 红白条
      g.fillStyle = U.rgba(NAUT.red, .75);
      g.fillRect(x - tw * .92, y - 15 * s, tw * 1.84, 4 * s);
      g.fillRect(x - tw * .78, y - 25 * s, tw * 1.56, 3.4 * s);
      // 灯室
      g.fillStyle = '#f3e4bb'; g.strokeStyle = U.rgba(NAUT.ink, .9);
      g.fillRect(x - tw * .8, y - h - 5 * s, tw * 1.6, 5 * s);
      g.strokeRect(x - tw * .8, y - h - 5 * s, tw * 1.6, 5 * s);
      g.beginPath(); g.moveTo(x - tw * 1.1, y - h - 5 * s); g.lineTo(x, y - h - 9 * s); g.lineTo(x + tw * 1.1, y - h - 5 * s);
      g.closePath(); g.fillStyle = U.rgba(NAUT.red, .8); g.fill();
      g.strokeStyle = U.rgba(NAUT.ink, .85); g.stroke();
      // 灯光：两道淡淡的扇形
      g.save();
      g.strokeStyle = U.rgba('#f0c060', .5); g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y - h - 2 * s); g.lineTo(x - 70 * s, y - h + 26 * s);
      g.moveTo(x, y - h - 2 * s); g.lineTo(x - 82 * s, y - h + 10 * s);
      g.stroke();
      g.restore();
    }
    /* ---- 罗盘玫瑰 + 恒向线 ---- */
    const candidates = [
      [W * .70, H * .62], [W * .82, H * .74], [W * .56, H * .78],
      [W * .76, H * .38], [W * .60, H * .34], [W * .88, H * .58]
    ];
    let cpos = null, cbest = -1e9;
    for (const c of candidates) {
      if (c[0] < 90 || c[0] > W - 90 || c[1] < 90 || c[1] > H - 90) continue;
      const sc = e.field.at(c[0], c[1]) + Math.min(c[0], c[1], W - c[0], H - c[1]) * .2;
      if (sc > cbest) { cbest = sc; cpos = c; }
    }
    if (cpos) {
      const cx = cpos[0], cy = cpos[1], rad = 58 * s;
      // 恒向线（避开图标）
      U.mask(g, cg => {
        cg.save();
        cg.strokeStyle = U.rgba(NAUT.ink, .16); cg.lineWidth = 1;
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * TAU - Math.PI / 2;
          cg.beginPath();
          cg.moveTo(cx + Math.cos(a) * rad * .8, cy + Math.sin(a) * rad * .8);
          cg.lineTo(cx + Math.cos(a) * Math.hypot(W, H), cy + Math.sin(a) * Math.hypot(W, H));
          cg.stroke();
        }
        cg.restore();
      }, U.iconHoles(e, .4));
      // 外圈的刻度
      g.strokeStyle = U.rgba(NAUT.ink, .4); g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke();
      g.beginPath();
      for (let i = 0; i < 64; i++) {
        const a = i / 64 * TAU;
        const l = i % 8 === 0 ? 6 : i % 4 === 0 ? 4 : 2.2;
        g.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        g.lineTo(cx + Math.cos(a) * (rad + l), cy + Math.sin(a) * (rad + l));
      }
      g.stroke();
      wmCompass(g, cx, cy, rad * .92, r);
      // 罗盘中心的十字线延长到画面外
      g.strokeStyle = U.rgba(NAUT.ink, .12); g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx - Math.hypot(W, H), cy); g.lineTo(cx + Math.hypot(W, H), cy);
      g.moveTo(cx, cy - Math.hypot(W, H)); g.lineTo(cx, cy + Math.hypot(W, H));
      g.stroke();
    }
    /* ---- 测深数字 + 波浪 ---- */
    const inWater = (x, y, pad) =>
      y > yTop(x) + (pad || 0) + 6 && y < yBot(x) - (pad || 0) - 6 && e.field.at(x, y) > clearField;
    // 港口之间的航线（细点线）
    for (let i = 0; i + 1 < ports.length; i += 2) {
      const a = ports[i], b = ports[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const c1 = [mx - dy / L * L * .16, my + dx / L * L * .16];
      const pts = U.spline([a, c1, b], 10);
      let ok = true;
      for (const p of pts) if (!inWater(p[0], p[1], 6)) { ok = false; break; }
      if (!ok) continue;
      g.save();
      g.strokeStyle = U.rgba(NAUT.ink, .35); g.lineWidth = 1.3;
      g.setLineDash([1.6, 5.2]); g.lineCap = 'round';
      strokePts(g, pts);
      g.restore();
    }
    g.strokeStyle = U.rgba(NAUT.ink, .7); g.lineWidth = .7;
    const soundN = Math.round(40 + depth * 130);
    for (let i = 0; i < soundN * 3; i++) {
      const x = r() * W, y = r() * H;
      if (!inWater(x, y, 12)) continue;
      if (r() > .34) continue;
      const v = 3 + ((r() * 46) | 0);
      numGlyph(g, x, y, v, 7.2 * s, NAUT.ink, .5);
      g.strokeStyle = U.rgba(NAUT.ink, .28);
      g.beginPath(); g.moveTo(x + 1, y + 9.6 * s); g.lineTo(x + 1, y + 11.6 * s); g.stroke();
      g.strokeStyle = U.rgba(NAUT.ink, .7);
    }
    // 波浪：小的墨线弧
    g.strokeStyle = U.rgba(NAUT.ink, .3); g.lineWidth = 1;
    const waveN = Math.round(70 + depth * 160);
    for (let i = 0; i < waveN; i++) {
      const x = r() * W, y = r() * H;
      if (!inWater(x, y, 8)) continue;
      const w = (5 + r() * 9) * s;
      g.beginPath();
      g.moveTo(x - w, y);
      g.quadraticCurveTo(x - w * .35, y - 3.2 * s, x, y);
      g.quadraticCurveTo(x + w * .35, y + 3.2 * s, x + w, y);
      g.stroke();
    }
    // 暗礁：几个带排线的小圈
    for (let i = 0; i < 16; i++) {
      const x = r() * W, y = r() * H;
      if (!inWater(x, y, 24)) continue;
      const rad = (3 + r() * 4) * s;
      g.strokeStyle = U.rgba(NAUT.ink, .5); g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
      g.beginPath();
      for (let k = -1; k <= 1; k++) {
        g.moveTo(x - rad * .7, y + k * rad * .5);
        g.lineTo(x + rad * .7, y + k * rad * .5);
      }
      g.stroke();
      g.fillStyle = U.rgba(NAUT.ink, .5);
      g.beginPath(); g.arc(x, y, .9, 0, TAU); g.fill();
    }
    // 沙洲：贴着海岸的一小片点
    for (let i = 0; i < 7; i++) {
      const x = r() * W;
      const topSide = r() < .5;
      const y = topSide ? yTop(x) + (14 + r() * 30) : yBot(x) - (14 + r() * 30);
      if (!inWater(x, y, 2)) continue;
      g.fillStyle = U.rgba(NAUT.ink, .28);
      for (let k = 0; k < 26; k++) {
        const px = x + (r() - .5) * 54 * s, py = y + (r() - .5) * 18 * s;
        g.beginPath(); g.arc(px, py, .7 + r() * 1.1, 0, TAU); g.fill();
      }
    }
    /* ---- 鲸鱼 ---- */
    let whaleSpot = null;
    for (let i = 0; i < 80; i++) {
      const x = W * .2 + r() * W * .7, y = H * .3 + r() * H * .45;
      if (!inWater(x, y, 40)) continue;
      if (e.field.at(x, y) < clearField + 30) continue;
      whaleSpot = [x, y];
      break;
    }
    if (whaleSpot) nauWhale(g, whaleSpot[0], whaleSpot[1], s);
    /* ---- 图框：双线，遇到图标断开 ---- */
    U.mask(g, cg => {
      cg.strokeStyle = U.rgba(NAUT.ink, .45); cg.lineWidth = 2;
      cg.strokeRect(9.5, 9.5, W - 19, H - 19);
      cg.strokeStyle = U.rgba(NAUT.ink, .3); cg.lineWidth = 1;
      cg.strokeRect(15.5, 15.5, W - 31, H - 31);
    }, U.iconHoles(e, .3));
    /* ---- 做旧 ---- */
    aging(g, e, U.clamp(P.age, 0, 1), NAUT.stain);
    U.vignette(g, W, H, '#4a3214', .2);
    U.grain(g, W, H, .07);

    /* ---- 帆船的航线：找圈不碰图标的开阔水面 ---- */
    const ships = [];
    const want = Math.round(U.clamp(P.ships, 0, 5));
    const loops = [];
    for (let i = 0; i < 90 && loops.length < want; i++) {
      const cx = W * (.28 + r() * .58), cy = H * (.34 + r() * .38);
      const rx = (60 + r() * 130) * s, ry = (34 + r() * 70) * s;
      if (cx - rx < 20 || cx + rx > W - 20 || cy - ry < 20 || cy + ry > H - 20) continue;
      let ok = true;
      for (let k = 0; k < 28; k++) {
        const a = k / 28 * TAU;
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        if (!inWater(x, y, 16)) { ok = false; break; }
        // 不压着罗盘和鲸鱼
        if (cpos && Math.hypot(x - cpos[0], y - cpos[1]) < 96 * s) { ok = false; break; }
        if (whaleSpot && Math.hypot(x - whaleSpot[0], y - whaleSpot[1]) < 90 * s) { ok = false; break; }
      }
      if (!ok) continue;
      if (loops.some(l => Math.hypot(l.cx - cx, l.cy - cy) < (l.rx + rx) * .9)) continue;
      const pts = [];
      for (let k = 0; k <= 48; k++) {
        const a = k / 48 * TAU;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      }
      loops.push({ cx, cy, rx, ry, path: prepare(pts) });
    }
    for (let i = 0; i < want && loops.length; i++) {
      const L = loops[i % loops.length];
      ships.push({ path: L.path, off: r() * L.path.len, sp: (7 + r() * 5) * s, ph: r() * 6.28 });
    }
    e.st.naut = { ships, whale: whaleSpot };
  }
  function nauticalPaint(g, e) {
    const st = e.st.naut, t = e.t;
    if (!st) return;
    // 帆船：船身 + 尾迹 + 上下轻轻晃（船身永远是正着的，按航向左右翻转）
    for (const sh of st.ships) {
      const d = sh.off + t * sh.sp;
      const o = atLen(sh.path, d, {});
      const bob = Math.sin(t * 1.3 + sh.ph);
      const vx = Math.cos(o.a), vy = Math.sin(o.a);
      const nx = -vy, ny = vx;
      g.strokeStyle = U.rgba(NAUT.ink, .2); g.lineWidth = 1.2; g.lineCap = 'round';
      g.beginPath();
      for (const k of [-1, 1]) {
        g.moveTo(o.x - vx * 10, o.y - vy * 10);
        g.quadraticCurveTo(o.x - vx * 26 + nx * k * 5, o.y - vy * 26 + ny * k * 5,
          o.x - vx * 48 + nx * k * 13, o.y - vy * 48 + ny * k * 13);
      }
      g.stroke();
      g.save();
      g.translate(o.x, o.y + bob * 1.4);
      g.rotate(Math.sin(t * 1.1 + sh.ph) * .04);
      if (vx < 0) g.scale(-1, 1);
      nauShip(g, 1, t, sh.ph);
      g.restore();
    }
    // 鲸鱼喷的水柱
    if (st.whale) {
      const wx = st.whale[0], wy = st.whale[1];
      const cyc = (t * .55) % 1;
      if (cyc < .55) {
        const k = cyc / .55;
        g.strokeStyle = U.rgba(NAUT.ink, .5 * (1 - k * .5));
        g.lineWidth = 1.4;
        g.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i - 1) * .38;
          const len = 10 + k * 30;
          g.moveTo(wx - 46 + (i - 1) * 2, wy - 8);
          g.quadraticCurveTo(
            wx - 46 + Math.cos(a) * len * .6 + (i - 1) * 10,
            wy - 8 + Math.sin(a) * len * .8,
            wx - 46 + Math.cos(a) * len + (i - 1) * 16,
            wy - 8 + Math.sin(a) * len
          );
        }
        g.stroke();
        // 落下的水滴
        g.fillStyle = U.rgba(NAUT.ink, .4);
        for (let i = 0; i < 3; i++) {
          const px = wx - 60 + i * 12 - k * 8, py = wy - 20 - k * 22 + k * k * 26;
          g.beginPath(); g.arc(px, py, 1.2, 0, TAU); g.fill();
        }
      }
    }
  }
  SCENES.nauticalmap = {
    title: '航海地图',
    defaults: { sigma: 70, ships: 3, depth: .6, age: .5 },
    paintStatic: nauticalStatic,
    paint: nauticalPaint
  };
})();
