'use strict';
/* ======================================================================
   Deskland · 水景三题
   ----------------------------------------------------------------------
   马尔代夫：俯视环礁湖，深蓝外海、亮青浅滩、奶油沙洲；
             图标坐在白沙岛上，礁石、小鱼群、阳光碎金和一条带尾迹的小船。
   湖泊：    水彩草甸围着一片清水湖，芦苇、野花、卵石、草簇；
             圆鼓鼓的云影落在湖面，鸭子划水，涟漪一圈圈散开。
   荷塘：    俯视深绿池塘，带缺口和放射叶脉的荷叶、粉色荷花；
             锦鲤摆尾游动，蜻蜓和细碎光点。
   说明：静态层负责所有重活；每帧只画鱼、船、鸭、锦鲤、涟漪和光点。
   ====================================================================== */
(function () {
  const TAU = Math.PI * 2;

  function inRect(icons, x, y, m) {
    for (const ic of icons) {
      if (x > ic.x - m && x < ic.x + ic.w + m && y > ic.y - m && y < ic.y + ic.h + m) return true;
    }
    return false;
  }
  function inEllipse(x, y, cx, cy, rx, ry) {
    const dx = (x - cx) / Math.max(1, rx), dy = (y - cy) / Math.max(1, ry);
    return dx * dx + dy * dy < 1;
  }
  function onScreen(W, H, x, y, m) { return x > m && x < W - m && y > m && y < H - m; }

  /* ====================================================================
     一、马尔代夫
     ==================================================================== */
  const BP = {
    deep: '#0c6f9e', deep2: '#0a628f', mid: '#12a7bd', mid2: '#1bc4c7',
    lagoon: '#43d9cf', shoal: '#8beade', pale: '#bdf4e6', foam: '#fffdf2',
    sand: '#f2e4c2', sandDry: '#fcf5e2', sandWet: '#e3d1a9', sandSpeck: '#decca4',
    reef: '#2c6f68', reefDeep: '#174f52', reef2: '#1d5a57', reef3: '#3d8576',
    coral: '#ef8872', coralLight: '#f8b59e',
    palm: '#2f7d52', palmLight: '#54a267', palmDark: '#1f5f43', trunk: '#8a6a45',
    boat: '#fdf3df', boatTrim: '#ef816b', boatDark: '#c9b28b', ink: '#21454c',
    fishA: '#fff4d2', fishB: '#f7b49d', glint: '#fffbeb',
    vig: '#083a55', grain: .065
  };

  // 图标岛：按聚簇画一整块沙洲（图标密的时候按单个图标画会露出一排蛋形）
  // 一团包住整簇的椭圆 + 几团外缘凸起，全部并进同一条路径，一次填满。
  function islandPath(g, e, grow, seed, jit) {
    const r = U.rng(seed);
    g.beginPath();
    for (const c of e.clusters) {
      const rx = c.w * .5 + grow + 18, ry = c.h * .5 + grow + 18;
      U.blobAdd(g, c.cx, c.cy, rx, ry, 18, jit == null ? .065 : jit, r);
      const bumps = 2 + Math.min(4, Math.round((c.w + c.h) / 300));
      for (let k = 0; k < bumps; k++) {
        const a = r() * TAU;
        U.blobAdd(g, c.cx + Math.cos(a) * rx * .72, c.cy + Math.sin(a) * ry * .72,
          rx * (.16 + r() * .12), ry * (.15 + r() * .10), 10, .15, r);
      }
    }
  }
  function extraBankPath(g, b, kx, ky, seed) {
    const r = U.rng(seed);
    g.beginPath();
    U.blobAdd(g, b.x, b.y, b.rx * kx, b.ry * ky, 14, .13, r);
    // 两团圆润的凸起，让沙洲不是一个光溜溜的蛋
    U.blobAdd(g, b.x + b.rx * .52 * kx, b.y - b.ry * .18 * ky,
      b.rx * .48 * kx, b.ry * .58 * ky, 10, .16, r);
    U.blobAdd(g, b.x - b.rx * .46 * kx, b.y + b.ry * .22 * ky,
      b.rx * .42 * kx, b.ry * .54 * ky, 10, .16, r);
  }

  // 几何：先算好沙洲、礁石、鱼道、航道、光点、棕榈的位置，后面按这个画
  function buildBeachGeo(e) {
    const { W, H, P, icons, clusters } = e;
    const r = U.rng((e.seed ^ 0xB34C9E) >>> 0);
    const geo = { banks: [], reefs: [], palms: [], schools: [], glints: [], boat: null };

    // 水里的额外小沙洲（不承担图标）
    for (let i = 0; i < 160 && geo.banks.length < 3; i++) {
      const rx = 46 + r() * 52, ry = 34 + r() * 42;
      const x = W * (.12 + r() * .76), y = H * (.12 + r() * .76);
      if (!onScreen(W, H, x, y, Math.max(rx, ry) + 26)) continue;
      if (e.field.at(x, y) < Math.max(rx, ry) + 74) continue;
      if (geo.banks.some(b => Math.hypot(b.x - x, b.y - y) < b.rx + rx + 70)) continue;
      geo.banks.push({ x, y, rx, ry, seed: (e.seed + i * 7919) >>> 0 });
    }

    // 深色礁石
    const reefN = Math.max(0, Math.round(P.reef * 12));
    for (let i = 0; i < 220 && geo.reefs.length < reefN; i++) {
      const rad = 24 + r() * 58;
      const x = W * (.04 + r() * .92), y = H * (.05 + r() * .9);
      if (!onScreen(W, H, x, y, rad + 18)) continue;
      if (e.field.at(x, y) < rad + 62) continue;
      if (geo.banks.some(b => inEllipse(x, y, b.x, b.y, b.rx + rad + 26, b.ry + rad + 26))) continue;
      if (geo.reefs.some(q => Math.hypot(q.x - x, q.y - y) < q.rad + rad + 34)) continue;
      geo.reefs.push({ x, y, rad, seed: (e.seed ^ ((i + 5) * 2654435761)) >>> 0, rot: r() * TAU });
    }

    // 小鱼群：椭圆形洄游路线，整条路线都避开图标和沙洲
    const wantFish = Math.max(0, Math.round(P.fish * 6));
    for (let i = 0; i < 260 && geo.schools.length < wantFish; i++) {
      const rr = 25 + r() * 33, x = W * (.08 + r() * .84), y = H * (.1 + r() * .8);
      if (!onScreen(W, H, x, y, rr + 40)) continue;
      if (e.field.at(x, y) < rr + 52) continue;
      if (geo.banks.some(b => inEllipse(x, y, b.x, b.y, b.rx + rr + 30, b.ry + rr + 30))) continue;
      let ok = true;
      for (let k = 0; k < 18 && ok; k++) {
        const a = k / 18 * TAU;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * .72;
        if (e.field.at(px, py) < 34) ok = false;
        if (geo.banks.some(b => inEllipse(px, py, b.x, b.y, b.rx + 34, b.ry + 34))) ok = false;
      }
      if (!ok) continue;
      if (geo.schools.some(s => Math.hypot(s.x - x, s.y - y) < 145)) continue;
      geo.schools.push({
        x, y, rx: rr, ry: rr * .72, speed: .18 + r() * .16, phase: r() * TAU,
        dir: r() < .5 ? -1 : 1, n: 9 + (r() * 5 | 0)
      });
    }

    // 小船：在开阔水里找一条椭圆航道（起点、方向随机）
    let best = null;
    for (let i = 0; i < 220; i++) {
      const cx = W * (.24 + r() * .52), cy = H * (.26 + r() * .48);
      const rx = 64 + r() * 132, ry = 38 + r() * 68, rot = (r() - .5) * .55;
      let clear = 1e9, ok = true;
      for (let k = 0; k < 22 && ok; k++) {
        const a = k / 22 * TAU;
        const px = cx + Math.cos(a) * rx * Math.cos(rot) - Math.sin(a) * ry * Math.sin(rot);
        const py = cy + Math.cos(a) * rx * Math.sin(rot) + Math.sin(a) * ry * Math.cos(rot);
        if (!onScreen(W, H, px, py, 46)) { ok = false; break; }
        const f = e.field.at(px, py);
        if (f < 44) { ok = false; break; }
        if (geo.banks.some(b => inEllipse(px, py, b.x, b.y, b.rx + 26, b.ry + 26))) { ok = false; break; }
        clear = Math.min(clear, f);
      }
      if (ok && (!best || clear > best.clear))
        best = { cx, cy, rx, ry, rot, clear, speed: .032 + r() * .022, phase: r() * TAU };
    }
    geo.boat = best;

    // 水面亮斑
    for (let i = 0; i < 300 && geo.glints.length < 30; i++) {
      const x = W * (.04 + r() * .92), y = H * (.05 + r() * .9);
      if (!onScreen(W, H, x, y, 22)) continue;
      if (e.field.at(x, y) < 24) continue;
      if (geo.banks.some(b => inEllipse(x, y, b.x, b.y, b.rx + 10, b.ry + 10))) continue;
      geo.glints.push({ x, y, s: 2 + r() * 3.2, ph: r() * TAU, sp: .5 + r() * .9 });
    }

    // 棕榈：只种在比较大的沙洲边缘，避开图标
    const groups = [];
    for (const c of clusters) {
      const cands = [];
      for (let k = 0; k < 22 && cands.length < 3; k++) {
        const a = r() * TAU;
        const x = c.cx + Math.cos(a) * (c.w * .5 + 18 + r() * 7);
        const y = c.cy + Math.sin(a) * (c.h * .5 + 18 + r() * 7);
        if (!onScreen(W, H, x, y, 22) || inRect(icons, x, y, 20)) continue;
        if (e.field.at(x, y) > -7) continue;
        cands.push({ x, y });
      }
      if (cands.length) groups.push({ size: Math.hypot(c.w, c.h), cands, bank: false });
    }
    for (const b of geo.banks) {
      const cands = [];
      for (let k = 0; k < 8 && cands.length < 2; k++) {
        const a = r() * TAU;
        const x = b.x + Math.cos(a) * b.rx * .5, y = b.y + Math.sin(a) * b.ry * .5;
        if (!onScreen(W, H, x, y, 18) || inRect(icons, x, y, 18)) continue;
        cands.push({ x, y });
      }
      if (cands.length) groups.push({ size: Math.hypot(b.rx, b.ry) * .9, cands, bank: true });
    }
    groups.sort((a, b) => b.size - a.size);
    const wantPalms = Math.max(0, Math.round(P.palms));
    for (let pass = 0; pass < 2 && geo.palms.length < wantPalms; pass++) {
      for (const gp of groups) {
        if (geo.palms.length >= wantPalms) break;
        const c = gp.cands[pass % gp.cands.length];
        if (!c) continue;
        if (geo.palms.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 56)) continue;
        geo.palms.push({ x: c.x, y: c.y, s: 18 + r() * 9, rot: r() * TAU, seed: (e.seed + geo.palms.length * 3571) >>> 0 });
      }
    }
    return geo;
  }

  function beachWater(g, e) {
    const { W, H } = e, r = U.rng((e.seed ^ 0x51D3) >>> 0);
    g.fillStyle = BP.deep; g.fillRect(0, 0, W, H);
    // 外海深浅：几块平的暗色水域
    g.fillStyle = BP.deep2;
    U.blob(g, W * .84, H * .88, W * .32, H * .23, 16, .18, r); g.fill();
    U.blob(g, W * .12, H * .10, W * .30, H * .17, 16, .18, r); g.fill();
    U.blob(g, W * .97, H * .38, W * .20, H * .30, 14, .2, r); g.fill();
    // 中层碧海（偏青）
    g.fillStyle = BP.mid;
    U.blob(g, W * .48, H * .50, W * .58, H * .56, 20, .10, r); g.fill();
    g.fillStyle = BP.mid2;
    U.blob(g, W * .56, H * .48, W * .43, H * .42, 20, .11, r); g.fill();
    g.fillStyle = BP.lagoon;
    U.blob(g, W * .61, H * .55, W * .30, H * .30, 18, .13, r); g.fill();
    // 长条沙洲一样的浅色水道，让水面有流动感
    g.fillStyle = U.rgba(BP.shoal, .35);
    U.blob(g, W * .34, H * .70, W * .20, H * .07, 12, .2, r); g.fill();
    U.blob(g, W * .80, H * .30, W * .15, H * .055, 12, .22, r); g.fill();
    // 等深线：几圈很淡的闭合线
    for (let k = 0; k < 4; k++) {
      const cx = W * (.30 + .18 * k), cy = H * (.72 - .12 * k);
      const pts = [];
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU, wob = 1 + .12 * Math.sin(a * 3 + k) + .07 * Math.sin(a * 5 + k * 2);
        pts.push([cx + Math.cos(a) * W * .17 * wob, cy + Math.sin(a) * H * .13 * wob]);
      }
      U.strokePts(g, pts, true);
      g.strokeStyle = U.rgba('#d6fff7', .10); g.lineWidth = 1.4; g.stroke();
    }
    // 水面细碎的短线（静态，像印刷网点）
    for (let i = 0; i < 220; i++) {
      const x = r() * W, y = r() * H, a = -.5 + r() * 1.0, len = 2 + r() * 6;
      if (e.field.at(x, y) < 32) continue;
      g.strokeStyle = U.rgba('#ffffff', .05 + r() * .10);
      g.lineWidth = .8 + r() * .6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    // 水下的浅色沙脊：没有露出水面，只是让浅滩有层次
    for (let i = 0; i < 5; i++) {
      const x = W * (.18 + r() * .64), y = H * (.2 + r() * .6);
      const rx = W * (.03 + r() * .055), ry = H * (.012 + r() * .022);
      if (e.field.at(x, y) < rx + 40) continue;
      g.save(); g.translate(x, y); g.rotate((r() - .5) * .9);
      U.blob(g, 0, 0, rx, ry, 12, .18, r);
      g.fillStyle = U.rgba(BP.pale, .24); g.fill();
      g.strokeStyle = U.rgba(BP.foam, .18); g.lineWidth = 1.2; g.stroke();
      g.restore();
    }
    // 太阳碎金（静态的细长反光）
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = r() * H;
      if (e.field.at(x, y) < 36) continue;
      g.fillStyle = U.rgba(BP.glint, .18 + r() * .22);
      g.beginPath(); g.ellipse(x, y, 2 + r() * 5, .8 + r() * .9, -.4, 0, TAU); g.fill();
    }
  }

  function drawReef(g, rf) {
    const r = U.rng(rf.seed);
    // 礁盘外的浅水沙晕
    g.beginPath();
    U.blobAdd(g, rf.x, rf.y, rf.rad * 1.34, rf.rad * .94, 12, .16, r);
    g.fillStyle = U.rgba(BP.shoal, .28); g.fill();
    // 礁体：几层不规则深色块，边缘由大变小
    const layers = [
      [1.06, .38, BP.reefDeep], [.88, .95, BP.reef],
      [.64, .95, BP.reef2], [.34, .9, BP.reef3]
    ];
    for (const [k, a, col] of layers) {
      g.beginPath();
      U.blobAdd(g, rf.x, rf.y, rf.rad * k, rf.rad * k * .72, 12, .17, r);
      g.fillStyle = U.rgba(col, a); g.fill();
    }
    // 礁石伸出去的枝杈
    for (let b = 0; b < 4; b++) {
      const a = rf.rot + b / 4 * TAU, d = rf.rad * (.62 + r() * .58);
      g.beginPath();
      U.blobAdd(g, rf.x + Math.cos(a) * d, rf.y + Math.sin(a) * d * .62,
        rf.rad * (.2 + r() * .2), rf.rad * (.11 + r() * .1), 9, .22, r);
      g.fillStyle = U.rgba(b % 2 ? BP.reef : BP.reefDeep, .8); g.fill();
      // 枝杈头的浅色珊瑚
      if (b % 2 === 0) {
        g.fillStyle = U.rgba(BP.reef3, .8);
        g.beginPath(); g.arc(rf.x + Math.cos(a) * d * 1.05, rf.y + Math.sin(a) * d * .65, rf.rad * .07, 0, TAU); g.fill();
      }
    }
    // 珊瑚：分叉的鹿角珊瑚，不是一圈像眼睛的小点
    const colonies = 2 + (r() * 2 | 0);
    for (let c = 0; c < colonies; c++) {
      const a = r() * TAU, d = rf.rad * (.2 + r() * .45);
      const cx = rf.x + Math.cos(a) * d, cy = rf.y + Math.sin(a) * d * .7;
      g.strokeStyle = U.rgba(c % 2 ? BP.coral : BP.coralLight, .9);
      g.lineWidth = 1.6; g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const aa = c * 1.7 + i / 4 * TAU + .3;
        const len = 3 + r() * 6;
        const tx = cx + Math.cos(aa) * len, ty = cy + Math.sin(aa) * len * .8;
        g.beginPath(); g.moveTo(cx, cy);
        g.quadraticCurveTo(cx + Math.cos(aa + .4) * len * .5, cy + Math.sin(aa + .4) * len * .5, tx, ty);
        g.stroke();
        g.fillStyle = U.rgba(c % 2 ? BP.coral : BP.coralLight, .9);
        g.beginPath(); g.arc(tx, ty, 1.1 + r() * .8, 0, TAU); g.fill();
      }
    }
    // 礁石边的浅色沙点
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = rf.rad * (.5 + r() * .7);
      g.fillStyle = U.rgba(BP.sand, .55);
      g.beginPath(); g.arc(rf.x + Math.cos(a) * d, rf.y + Math.sin(a) * d * .7, 1 + r() * 1.6, 0, TAU); g.fill();
    }
  }

  function beachReefs(g, e, geo) {
    // 礁石层整体避开图标（沙岛后面还会盖一层，但这里先按规则挖掉图标区）
    U.mask(g, cg => {
      for (const rf of geo.reefs) drawReef(cg, rf);
    }, U.iconHoles(e, .5));
  }

  function sandDetail(g, e, seed, kx, ky) {
    const { W, H } = e, r = U.rng(seed);
    // 风纹：几组短短的沙脊线
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = r() * H, w = 18 + r() * 44, a = (r() - .5) * .35;
      g.strokeStyle = U.rgba(BP.sandWet, .22 + r() * .16); g.lineWidth = 1.2;
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.moveTo(-w / 2, 0);
      g.quadraticCurveTo(0, -3 - r() * 3, w / 2, 0); g.stroke();
      g.beginPath(); g.moveTo(-w * .42, 4);
      g.quadraticCurveTo(0, 1, w * .42, 4); g.stroke();
      g.restore();
    }
    // 沙滩小点、贝壳、海星
    for (let i = 0; i < 170; i++) {
      const x = r() * W, y = r() * H;
      g.fillStyle = U.rgba(BP.sandSpeck, .22 + r() * .32);
      g.beginPath(); g.arc(x, y, .5 + r() * 1.2, 0, TAU); g.fill();
    }
    for (let i = 0; i < 12; i++) {
      const x = r() * W, y = r() * H, s = 2 + r() * 2.4, a = r() * TAU;
      g.save(); g.translate(x, y); g.rotate(a);
      g.strokeStyle = U.rgba(i % 3 ? BP.sandWet : BP.coralLight, .82); g.lineWidth = 1.1;
      g.beginPath(); g.arc(0, 0, s, Math.PI * .15, Math.PI * .95); g.stroke();
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(k * s * .5, -s * .9); g.stroke(); }
      g.restore();
    }
    for (let i = 0; i < 5; i++) {
      const x = r() * W, y = r() * H, s = 3 + r() * 3;
      g.fillStyle = U.rgba(BP.coral, .72);
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k / 5 * TAU;
        g.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
        g.lineTo(x + Math.cos(a + .32) * s * .38, y + Math.sin(a + .32) * s * .38);
      }
      g.closePath(); g.fill();
    }
    // 两簇小灌木
    for (let i = 0; i < 2; i++) {
      const x = r() * W, y = r() * H, s = 4 + r() * 4;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * .38;
        g.strokeStyle = U.rgba(BP.palmDark, .55); g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * s * .5, y + Math.sin(a) * s * .7, x + Math.cos(a) * s, y + Math.sin(a) * s); g.stroke();
      }
    }
  }

  function drawExtraBank(g, e, b) {
    const seed = b.seed;
    // 浅滩光晕
    extraBankPath(g, b, 1.34, 1.3, seed); g.fillStyle = U.rgba(BP.shoal, .24); g.fill();
    extraBankPath(g, b, 1.14, 1.12, seed); g.fillStyle = U.rgba(BP.pale, .48); g.fill();
    extraBankPath(g, b, 1.04, 1.03, seed); g.fillStyle = BP.foam; g.fill();
    extraBankPath(g, b, 1.0, 1.0, seed); g.fillStyle = BP.sandWet; g.fill();
    extraBankPath(g, b, .9, .87, seed); g.fillStyle = BP.sandDry; g.fill();
    // 沙面细节只在干沙里
    g.save(); extraBankPath(g, b, .83, .79, seed); g.clip();
    sandDetail(g, e, seed ^ 0x77, 1, 1);
    g.restore();
    // 几簇海草和小石子
    const r = U.rng(seed ^ 0x21);
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU;
      const x = b.x + Math.cos(a) * b.rx * .55, y = b.y + Math.sin(a) * b.ry * .48;
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = U.rgba(BP.palmDark, .5); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x + k * 1.6, y);
        g.quadraticCurveTo(x + k * 2.4 - 1, y - 5, x + k * 2.8 + 1, y - 9 - r() * 4); g.stroke();
      }
    }
  }

  function drawIconIslands(g, e) {
    const { seed } = e, M = e.P.sigma * .20 + 6;
    // 外圈浅色潟湖光、泡沫、湿沙、干沙
    islandPath(g, e, M + 34, (seed ^ 0x15A0) >>> 0, .09);
    g.fillStyle = U.rgba(BP.shoal, .22); g.fill();
    islandPath(g, e, M + 18, (seed ^ 0x15A0) >>> 0, .085);
    g.fillStyle = U.rgba(BP.pale, .52); g.fill();
    islandPath(g, e, M + 5, (seed ^ 0x15A0) >>> 0, .075);
    g.fillStyle = BP.foam; g.fill();
    islandPath(g, e, M, (seed ^ 0x15A0) >>> 0, .07);
    g.fillStyle = BP.sandWet; g.fill();
    islandPath(g, e, M - 6, (seed ^ 0x15A0) >>> 0, .07);
    g.fillStyle = BP.sandDry; g.fill();
    // 沙面细节
    g.save();
    islandPath(g, e, M - 7, (seed ^ 0x15A0) >>> 0, .07);
    g.clip();
    sandDetail(g, e, (seed ^ 0x2C71) >>> 0, 1, 1);
    g.restore();
  }

  function palm(g, p) {
    const { x, y, seed } = p, s = p.s, r = U.rng(seed);
    // 浅浅的影子
    g.fillStyle = U.rgba(BP.ink, .14);
    g.beginPath(); g.ellipse(x + s * .3, y + s * .34, s * 1.05, s * .78, .45, 0, TAU); g.fill();
    // 俯视的棕榈：一圈向外弯的长叶片，深浅交替
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = p.rot + i / n * TAU + (r() - .5) * .12;
      const len = s * (.92 + r() * .38);
      const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      const bend = len * (.24 + r() * .08);
      // 叶片：从叶柄到叶尖两侧鼓起，形成细长的叶形
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * len * .45 + nx * bend, y + Math.sin(a) * len * .45 + ny * bend,
        x + Math.cos(a) * len * .72 + nx * bend * .5, y + Math.sin(a) * len * .72 + ny * bend * .5);
      g.quadraticCurveTo(x + Math.cos(a) * len * .88 + nx * bend * .2, y + Math.sin(a) * len * .88 + ny * bend * .2, ex, ey);
      g.quadraticCurveTo(x + Math.cos(a) * len * .70 - nx * bend * .35, y + Math.sin(a) * len * .70 - ny * bend * .35,
        x + Math.cos(a) * len * .42 - nx * bend * .5, y + Math.sin(a) * len * .42 - ny * bend * .5);
      g.quadraticCurveTo(x + Math.cos(a) * len * .2 - nx * bend * .35, y + Math.sin(a) * len * .2 - ny * bend * .35, x, y);
      g.fillStyle = i % 3 === 0 ? BP.palmLight : (i % 3 === 1 ? BP.palm : BP.palmDark);
      g.fill();
      g.strokeStyle = U.rgba(BP.palmLight, .35); g.lineWidth = .8;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(
        x + Math.cos(a) * len * .5, y + Math.sin(a) * len * .5, ex, ey); g.stroke();
    }
    // 树干与椰子
    g.fillStyle = BP.trunk; g.beginPath(); g.arc(x, y, s * .14, 0, TAU); g.fill();
    g.fillStyle = U.rgba(BP.palmDark, .85);
    for (let i = 0; i < 3; i++) {
      const a = p.rot + i / 3 * TAU;
      g.beginPath(); g.arc(x + Math.cos(a) * s * .18, y + Math.sin(a) * s * .18, s * .075, 0, TAU); g.fill();
    }
  }

  function beachStatic(g, e) {
    const { W, H } = e;
    const geo = buildBeachGeo(e);
    e.st.bgeo = geo;

    beachWater(g, e);
    beachReefs(g, e, geo);
    for (const b of geo.banks) drawExtraBank(g, e, b);
    drawIconIslands(g, e);
    // 沙岛外的一两圈水纹
    const M = e.P.sigma * .20 + 6;
    islandPath(g, e, M + 13, (e.seed ^ 0x44C1) >>> 0, .07);
    g.strokeStyle = U.rgba(BP.foam, .28); g.lineWidth = 2.2; g.stroke();
    islandPath(g, e, M + 25, (e.seed ^ 0x44C1) >>> 0, .07);
    g.strokeStyle = U.rgba(BP.foam, .14); g.lineWidth = 1.4; g.stroke();

    // 图标底下一层很淡的奶油光，让白色文件名在沙上更清楚
    for (const ic of e.icons)
      U.softEllipse(g, ic.x + ic.w / 2, ic.y + ic.h / 2, ic.w * .9 + e.P.sigma * .35, ic.h * .9 + e.P.sigma * .3, '#fffdf2', .05, .3);

    for (const p of geo.palms) palm(g, p);
    // 几条划过浅滩的透明水纹
    const r = U.rng((e.seed ^ 0x7A11) >>> 0);
    g.strokeStyle = U.rgba('#ffffff', .16); g.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const x = W * (.16 + r() * .7), y = H * (.2 + r() * .68);
      if (e.field.at(x, y) < 60) continue;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + W * .04, y + H * .01, x + W * .085, y - H * .005);
      g.stroke();
    }

    U.vignette(g, W, H, BP.vig, .16);
    U.grain(g, W, H, BP.grain);
  }

  function beachFish(g, x, y, ang, s, col, tail) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = tail;
    g.beginPath(); g.moveTo(-s * 1.05, 0); g.lineTo(-s * 2.15, -s * .9); g.lineTo(-s * 2.15, s * .9); g.closePath(); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.ellipse(0, 0, s * 1.35, s * .76, 0, 0, TAU); g.fill();
    g.strokeStyle = U.rgba(BP.ink, .45); g.lineWidth = .7; g.stroke();
    g.fillStyle = U.rgba(BP.ink, .7);
    g.beginPath(); g.arc(s * .62, 0, s * .17, 0, TAU); g.fill();
    g.restore();
  }

  function beachBoat(g, x, y, ang, s) {
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
    // 尾迹：几层向后散开的 V 形细线，越远越淡
    for (let k = 0; k < 3; k++) {
      const back = 22 + k * 12, spread = 8 + k * 6;
      g.strokeStyle = U.rgba(BP.foam, .42 - k * .1); g.lineWidth = 2.4 - k * .55; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-10, -3); g.quadraticCurveTo(-back * .6, -4 - spread * .5, -back, -spread); g.stroke();
      g.beginPath(); g.moveTo(-10, 3); g.quadraticCurveTo(-back * .6, 4 + spread * .5, -back, spread); g.stroke();
    }
    g.fillStyle = U.rgba(BP.foam, .45);
    for (let i = 0; i < 8; i++) {
      const k = i / 8, px = -13 - k * 42, py = (i % 2 ? 1 : -1) * (2.5 + k * 14);
      g.beginPath(); g.arc(px, py, .8 + k * 1.6, 0, TAU); g.fill();
    }
    // 船体
    g.fillStyle = BP.boatDark;
    g.beginPath(); g.moveTo(16, 0); g.quadraticCurveTo(5, -7.4, -8, -5.6); g.lineTo(-10.5, 0);
    g.lineTo(-8, 5.6); g.quadraticCurveTo(5, 7.4, 16, 0); g.fill();
    g.fillStyle = BP.boat;
    g.beginPath(); g.moveTo(14.5, 0); g.quadraticCurveTo(4, -6, -7.5, -4.4); g.lineTo(-9, 0);
    g.lineTo(-7.5, 4.4); g.quadraticCurveTo(4, 6, 14.5, 0); g.fill();
    // 船舱和船头
    g.fillStyle = BP.boatTrim;
    g.beginPath(); g.ellipse(-1, 0, 6.2, 2.8, 0, 0, TAU); g.fill();
    g.fillStyle = U.rgba(BP.ink, .55);
    g.beginPath(); g.ellipse(-1, 0, 3.2, 1.3, 0, 0, TAU); g.fill();
    g.fillStyle = BP.boat;
    g.beginPath(); g.moveTo(14.5, 0); g.lineTo(9, -1.8); g.lineTo(9, 1.8); g.fill();
    g.restore();
  }

  function beachPaint(g, e) {
    const geo = e.st.bgeo;
    if (!geo) return;
    const t = e.t;

    // 小鱼群：整群沿椭圆洄游，鱼在群里排成松散的一小簇
    for (let si = 0; si < geo.schools.length; si++) {
      const s = geo.schools[si];
      const a0 = s.phase + s.dir * t * s.speed;
      const cx = s.x + Math.cos(a0) * s.rx;
      const cy = s.y + Math.sin(a0) * s.ry;
      const dx = -Math.sin(a0) * s.rx * s.dir, dy = Math.cos(a0) * s.ry * s.dir;
      const head = Math.atan2(dy, dx);
      if (e.field.at(cx, cy) < 24) continue;
      const ca = Math.cos(head), sa = Math.sin(head);
      for (let i = 0; i < s.n; i++) {
        const row = i % 3 - 1, col = (i / 3 | 0) - 1;
        const lx = col * 7.4 - row * 2.4 + Math.sin(t * 1.4 + i * 1.7) * 1.1;
        const ly = row * 5.6 + Math.cos(t * 1.2 + i * 2.3) * 1.2;
        const px = cx + ca * lx - sa * ly;
        const py = cy + sa * lx + ca * ly;
        if (e.field.at(px, py) < 18) continue;
        const ang = head + Math.sin(t * 3 + i * 2.1) * .18;
        const size = 2.8 + (i % 3) * .45;
        beachFish(g, px, py, ang, size, i % 2 === 0 ? BP.fishB : BP.fishA, U.rgba(BP.ink, .62));
      }
    }

    // 光点闪烁
    for (const gl of geo.glints) {
      const a = .16 + .5 * Math.max(0, Math.sin(t * gl.sp + gl.ph));
      if (a <= .2) continue;
      g.save(); g.translate(gl.x, gl.y); g.rotate(.3);
      g.strokeStyle = U.rgba(BP.ink, a * .16); g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-gl.s + 1, 1); g.lineTo(gl.s + 1, 1);
      g.moveTo(1, -gl.s * .55 + 1); g.lineTo(1, gl.s * .55 + 1); g.stroke();
      g.strokeStyle = U.rgba(BP.glint, a); g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-gl.s, 0); g.lineTo(gl.s, 0);
      g.moveTo(0, -gl.s * .55); g.lineTo(0, gl.s * .55); g.stroke();
      g.restore();
    }

    // 小船：慢慢沿着开阔的椭圆航道走
    if (geo.boat) {
      const b = geo.boat, a = b.phase + t * b.speed;
      const px = b.cx + Math.cos(a) * b.rx * Math.cos(b.rot) - Math.sin(a) * b.ry * Math.sin(b.rot);
      const py = b.cy + Math.cos(a) * b.rx * Math.sin(b.rot) + Math.sin(a) * b.ry * Math.cos(b.rot);
      const dx = -Math.sin(a) * b.rx * Math.cos(b.rot) - Math.cos(a) * b.ry * Math.sin(b.rot);
      const dy = -Math.sin(a) * b.rx * Math.sin(b.rot) + Math.cos(a) * b.ry * Math.cos(b.rot);
      beachBoat(g, px, py, Math.atan2(dy, dx), 1.15 + Math.min(e.W, e.H) / 1400);
    }
  }

  SCENES['beach-turquoise'] = {
    title: '马尔代夫',
    defaults: { sigma: 70, fish: .6, reef: .6, palms: 4 },
    paintStatic: beachStatic,
    paint: beachPaint
  };

  /* ====================================================================
     二、湖泊
     ==================================================================== */
  const LP = {
    meadow: '#8fae5e', washA: '#a5c274', washB: '#789952', washC: '#b7cf86', washD: '#688a49',
    bankRim: '#9bb866', bank: '#c6dc93', bankLight: '#d9eaaa', moss: '#88aa5d',
    edge: '#b5d292', shallow: '#86d9c5', lake: '#5bc4bd', deep: '#40b0b2', deep2: '#319fa6',
    reflect: '#d5eee3', reflect2: '#bde4d8',
    reed: '#466f39', reedLight: '#67924c', cattail: '#785838',
    pebble: '#bbb896', pebbleDark: '#8e8b76',
    flowerA: '#fff7df', flowerB: '#eeadbf', flowerC: '#eeca58',
    duck: '#c7a06b', duckDark: '#a67f52', duckHead: '#245d3e', beak: '#e9a63f',
    wake: '#eafaf2', ripple: '#e2f8ef', vig: '#374d2b', grain: .075
  };

  // 湖面边界：一圈带正弦起伏的椭圆，边缘平滑
  function lakeInfo(W, H) {
    return {
      cx: W * .55, cy: H * .43, rx: W * .48, ry: H * .42,
      wob(a) { return 1 + .10 * Math.sin(a * 3 + 1.1) + .065 * Math.sin(a * 5 + 2.4) + .035 * Math.sin(a * 7 + .7); }
    };
  }
  function lakePath(g, geo, scale) {
    const pts = [];
    for (let i = 0; i < 56; i++) {
      const a = i / 56 * TAU, w = geo.wob(a);
      pts.push([geo.cx + Math.cos(a) * geo.rx * scale * w, geo.cy + Math.sin(a) * geo.ry * scale * w]);
    }
    g.beginPath();
    U.smoothClosed(g, pts);
  }
  function insideLake(geo, x, y, k) {
    const dx = (x - geo.cx) / geo.rx, dy = (y - geo.cy) / geo.ry;
    return Math.hypot(dx, dy) < geo.wob(Math.atan2(dy, dx)) * (k == null ? .98 : k);
  }

  function lakeMeadow(g, e) {
    const { W, H } = e, r = U.rng((e.seed ^ 0x71A3) >>> 0);
    g.fillStyle = LP.meadow; g.fillRect(0, 0, W, H);
    // 水彩草甸：几块平涂的深浅绿，边缘清楚，不糊
    const washes = [LP.washA, LP.washB, LP.washC, LP.washD];
    for (let i = 0; i < 18; i++) {
      const x = r() * W, y = r() * H, rx = W * (.08 + r() * .22), ry = H * (.05 + r() * .16);
      U.blob(g, x, y, rx, ry, 14, .22, r);
      g.fillStyle = U.rgba(washes[i % 4], .18 + r() * .18); g.fill();
    }
    // 阳光照到的浅色草斑
    for (let i = 0; i < 7; i++) {
      U.blob(g, r() * W, r() * H, W * (.06 + r() * .12), H * (.04 + r() * .09), 12, .25, r);
      g.fillStyle = U.rgba(LP.washC, .22); g.fill();
    }
  }

  // 湖面上圆鼓鼓的云影：平涂的浅色块，不用渐变
  function reflectCloud(g, x, y, w, h, fill, shade) {
    g.beginPath();
    U.blobAdd(g, x, y, w * .31, h * .52, 10, .10, U.rng(3));
    U.blobAdd(g, x + w * .27, y - h * .16, w * .25, h * .45, 10, .10, U.rng(5));
    U.blobAdd(g, x - w * .28, y + h * .04, w * .24, h * .40, 10, .10, U.rng(7));
    U.blobAdd(g, x + w * .04, y + h * .22, w * .30, h * .30, 8, .12, U.rng(13));
    g.fillStyle = U.rgba(shade, .5); g.fill();
    g.beginPath();
    U.blobAdd(g, x - w * .04, y - h * .08, w * .25, h * .38, 10, .10, U.rng(9));
    U.blobAdd(g, x + w * .18, y - h * .20, w * .19, h * .28, 10, .12, U.rng(11));
    g.fillStyle = U.rgba(fill, .55); g.fill();
  }

  function lakeWater(g, e, geo) {
    const { W, H } = e, r = U.rng((e.seed ^ 0x2A6D) >>> 0);
    // 湿泥岸 → 浅浅的青绿 → 湖心
    lakePath(g, geo, 1.045); g.fillStyle = U.rgba(LP.edge, .9); g.fill();
    lakePath(g, geo, 1.0); g.fillStyle = LP.shallow; g.fill();
    lakePath(g, geo, .973); g.fillStyle = LP.lake; g.fill();

    g.save();
    lakePath(g, geo, .973); g.clip();
    // 湖心的深色水团（平涂色块，边缘由大块到小块）
    g.fillStyle = LP.deep;
    U.blob(g, W * .62, H * .47, W * .27, H * .22, 16, .16, r); g.fill();
    g.fillStyle = LP.deep2;
    U.blob(g, W * .70, H * .34, W * .17, H * .13, 14, .18, r); g.fill();
    g.fillStyle = U.rgba(LP.deep, .55);
    U.blob(g, W * .47, H * .58, W * .18, H * .11, 14, .2, r); g.fill();
    g.fillStyle = U.rgba(LP.lake, .7);
    U.blob(g, W * .31, H * .56, W * .16, H * .12, 14, .2, r); g.fill();
    // 云的倒影
    reflectCloud(g, W * .46, H * .21, W * .22, H * .075, LP.reflect, LP.reflect2);
    reflectCloud(g, W * .70, H * .29, W * .13, H * .050, LP.reflect2, LP.reflect);
    reflectCloud(g, W * .58, H * .60, W * .17, H * .060, LP.reflect, LP.reflect2);
    // 静态的细涟漪：很多短的弧线
    for (let i = 0; i < 90; i++) {
      const x = W * (.12 + r() * .76), y = H * (.08 + r() * .70);
      const w = 8 + r() * 30;
      g.strokeStyle = U.rgba('#ffffff', .10 + r() * .12); g.lineWidth = 1;
      g.beginPath(); g.ellipse(x, y, w, w * .18, (r() - .5) * .25, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    }
    // 浅水里的卵石，被水色盖住
    for (let i = 0; i < 34; i++) {
      const a = r() * TAU, k = .86 + r() * .12;
      const x = geo.cx + Math.cos(a) * geo.rx * k * geo.wob(a);
      const y = geo.cy + Math.sin(a) * geo.ry * k * geo.wob(a);
      g.fillStyle = U.rgba(i % 3 ? LP.pebble : LP.pebbleDark, .45);
      g.beginPath(); g.ellipse(x, y, 2 + r() * 4, 1.5 + r() * 2.6, r() * TAU, 0, TAU); g.fill();
    }
    g.restore();

    // 岸线：先一条湿泥和卵石带，再一条浅色水边
    lakePath(g, geo, 1.02);
    g.strokeStyle = U.rgba('#cfd8a4', .55); g.lineWidth = 9; g.stroke();
    lakePath(g, geo, 1.0);
    g.strokeStyle = U.rgba(LP.edge, .95); g.lineWidth = 3; g.stroke();
    lakePath(g, geo, .994);
    g.strokeStyle = U.rgba(LP.reflect, .5); g.lineWidth = 1.2; g.stroke();
  }

  // 图标所在的草岸：包住整簇图标，水边自然弯过去
  function bankPath(g, e, grow, size, seed) {
    const r = U.rng(seed);
    g.beginPath();
    for (const c of e.clusters) {
      const rx = c.w * .5 + grow + size, ry = c.h * .5 + grow + size;
      U.blobAdd(g, c.cx, c.cy, rx, ry, 18, .06, r);
      const bumps = 2 + Math.min(3, Math.round((c.w + c.h) / 360));
      for (let k = 0; k < bumps; k++) {
        const a = r() * TAU;
        U.blobAdd(g, c.cx + Math.cos(a) * rx * .7, c.cy + Math.sin(a) * ry * .7,
          rx * (.16 + r() * .1), ry * (.13 + r() * .1), 10, .15, r);
      }
    }
  }
  function lakeBanks(g, e, geo) {
    const { seed } = e, M = 12 + e.P.sigma * .12;
    // 岸边的浅水光，只画在湖里
    g.save();
    lakePath(g, geo, .985); g.clip();
    bankPath(g, e, M + 22, 14, (seed ^ 0x1B77) >>> 0);
    g.fillStyle = U.rgba('#c9f2e5', .55); g.fill();
    g.restore();
    // 草岸：深一点的边、亮一点的岸面、最亮的草地
    bankPath(g, e, M + 5, 14, (seed ^ 0x1B77) >>> 0);
    g.fillStyle = LP.bankRim; g.fill();
    bankPath(g, e, M, 13, (seed ^ 0x1B77) >>> 0);
    g.fillStyle = LP.bank; g.fill();
    bankPath(g, e, M - 12, 11, (seed ^ 0x1B77) >>> 0);
    g.fillStyle = LP.bankLight; g.fill();
    // 岸边的苔藓斑
    const r = U.rng((seed ^ 0x5C31) >>> 0);
    g.save();
    bankPath(g, e, M - 10, 11, (seed ^ 0x5C31) >>> 0); g.clip();
    for (let i = 0; i < 18; i++) {
      U.blob(g, r() * e.W, r() * e.H, 8 + r() * 24, 5 + r() * 14, 10, .25, r);
      g.fillStyle = U.rgba(LP.moss, .16 + r() * .12); g.fill();
    }
    g.restore();
  }

  function onBank(e, x, y) {
    const M = 12 + e.P.sigma * .12;
    for (const c of e.clusters) {
      const rx = c.w * .5 + M + 11, ry = c.h * .5 + M + 11;
      const dx = (x - c.cx) / rx, dy = (y - c.cy) / ry;
      if (dx * dx + dy * dy < .96) return true;
    }
    return false;
  }

  // 草叶、野花：只在草甸和草岸上长
  function groundDetail(g, e, geo) {
    const { W, H } = e, r = U.rng((e.seed ^ 0x6E2B) >>> 0);
    // 草簇
    for (let i = 0; i < 520; i++) {
      const x = r() * W, y = r() * H;
      if (insideLake(geo, x, y, .96) && !onBank(e, x, y)) continue;
      const h = 3 + r() * 9, base = U.rgba(r() < .5 ? LP.reed : LP.reedLight, .35 + r() * .3);
      g.strokeStyle = base; g.lineWidth = .9 + r() * .5; g.lineCap = 'round';
      g.beginPath();
      for (let k = -2; k <= 2; k++) {
        g.moveTo(x + k, y);
        g.quadraticCurveTo(x + k * 1.6, y - h * .6, x + k * 2.6, y - h * (.6 + r() * .5));
      }
      g.stroke();
    }
    // 草岸上再点一些草丛，让岸不是一块空地（贴着岸缘，避开图标）
    for (let i = 0; i < 150; i++) {
      const c = e.clusters[i % e.clusters.length];
      if (!c) break;
      const a = r() * TAU, M = 12 + e.P.sigma * .12;
      const x = c.cx + Math.cos(a) * (c.w * .5 + M + 4 + r() * 7);
      const y = c.cy + Math.sin(a) * (c.h * .5 + M + 4 + r() * 7);
      if (!onScreen(W, H, x, y, 8) || inRect(e.icons, x, y, 16)) continue;
      const h = 4 + r() * 10;
      g.strokeStyle = U.rgba(r() < .5 ? LP.reed : LP.reedLight, .45 + r() * .3);
      g.lineWidth = 1; g.beginPath();
      for (let k = -2; k <= 2; k++) {
        g.moveTo(x + k * 1.2, y);
        g.quadraticCurveTo(x + k * 2, y - h * .6, x + k * 3.2, y - h * (.55 + r() * .45));
      }
      g.stroke();
    }
    // 野花：小簇的圆花瓣
    const cols = [LP.flowerA, LP.flowerB, LP.flowerC];
    for (let i = 0; i < 60; i++) {
      const bx = r() * W, by = r() * H;
      if (insideLake(geo, bx, by, .96) && !onBank(e, bx, by)) continue;
      const n = 2 + (r() * 4 | 0), col = cols[i % 3];
      for (let q = 0; q < n; q++) {
        const x = bx + (r() - .5) * 22, y = by + (r() - .5) * 14, s = 1.3 + r() * 1.7;
        for (let p = 0; p < 5; p++) {
          const a = p / 5 * TAU + r() * .2;
          g.fillStyle = U.rgba(col, .85);
          g.beginPath(); g.arc(x + Math.cos(a) * s, y + Math.sin(a) * s, s * .72, 0, TAU); g.fill();
        }
        g.fillStyle = U.rgba('#e2a83e', .9);
        g.beginPath(); g.arc(x, y, s * .55, 0, TAU); g.fill();
      }
    }
    // 草丛边的野花
    for (let i = 0; i < 26; i++) {
      const c = e.clusters[i % e.clusters.length];
      if (!c) break;
      const a = r() * TAU, M = 12 + e.P.sigma * .12;
      const x = c.cx + Math.cos(a) * (c.w * .5 + M + 6 + r() * 8);
      const y = c.cy + Math.sin(a) * (c.h * .5 + M + 6 + r() * 8);
      if (!onScreen(W, H, x, y, 8) || inRect(e.icons, x, y, 14)) continue;
      const col = cols[i % 3], s = 1.7 + r() * 1.5;
      for (let p = 0; p < 5; p++) {
        const aa = p / 5 * TAU;
        g.fillStyle = U.rgba(col, .9);
        g.beginPath(); g.arc(x + Math.cos(aa) * s, y + Math.sin(aa) * s, s * .72, 0, TAU); g.fill();
      }
      g.fillStyle = U.rgba('#e2a83e', .9);
      g.beginPath(); g.arc(x, y, s * .5, 0, TAU); g.fill();
    }
    // 岸边卵石
    for (let i = 0; i < 46; i++) {
      const a = r() * TAU;
      const x = geo.cx + Math.cos(a) * geo.rx * 1.012 * geo.wob(a);
      const y = geo.cy + Math.sin(a) * geo.ry * 1.012 * geo.wob(a);
      if (!onScreen(W, H, x, y, 6) || inRect(e.icons, x, y, 10)) continue;
      const s = 1.6 + r() * 3.4;
      g.fillStyle = U.rgba(LP.pebbleDark, .8);
      g.beginPath(); g.ellipse(x + .7, y + 1, s, s * .72, r() * TAU, 0, TAU); g.fill();
      g.fillStyle = U.rgba(LP.pebble, .95);
      g.beginPath(); g.ellipse(x, y, s, s * .7, r() * TAU, 0, TAU); g.fill();
    }
    // 几处集中的卵石滩
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU;
      const bx = geo.cx + Math.cos(a) * geo.rx * 1.008 * geo.wob(a);
      const by = geo.cy + Math.sin(a) * geo.ry * 1.008 * geo.wob(a);
      if (!onScreen(W, H, bx, by, 14) || inRect(e.icons, bx, by, 12)) continue;
      for (let k = 0; k < 4; k++) {
        const x = bx + (r() - .5) * 20, y = by + (r() - .5) * 9, s = 1.4 + r() * 2.6;
        g.fillStyle = U.rgba(LP.pebbleDark, .75);
        g.beginPath(); g.ellipse(x + .6, y + .8, s, s * .7, r() * TAU, 0, TAU); g.fill();
        g.fillStyle = U.rgba(LP.pebble, .95);
        g.beginPath(); g.ellipse(x, y, s, s * .68, r() * TAU, 0, TAU); g.fill();
      }
    }
    // 几株稍微大一点的草
    for (let i = 0; i < 24; i++) {
      const x = r() * W, y = r() * H;
      if (insideLake(geo, x, y, .96) && !onBank(e, x, y)) continue;
      const h = 10 + r() * 12;
      g.strokeStyle = U.rgba(LP.reed, .5); g.lineWidth = 1.2;
      g.beginPath();
      for (let k = -2; k <= 2; k++) {
        g.moveTo(x, y);
        g.quadraticCurveTo(x + k * 3, y - h * .55, x + k * 5, y - h * (.4 + r() * .4));
      }
      g.stroke();
    }
  }

  // 芦苇丛：静态层只记位置，每帧轻轻摆动
  function buildLakeGeo(e) {
    const { W, H, P, icons } = e;
    const geo = lakeInfo(W, H);
    const r = U.rng((e.seed ^ 0xA11) >>> 0);
    geo.reeds = []; geo.ducks = []; geo.ripples = [];

    const wantReeds = Math.max(0, Math.round(P.reeds * 38));
    for (let i = 0; i < 400 && geo.reeds.length < wantReeds; i++) {
      const a = r() * TAU, w = geo.wob(a);
      const x = geo.cx + Math.cos(a) * geo.rx * 1.01 * w;
      const y = geo.cy + Math.sin(a) * geo.ry * 1.01 * w;
      if (!onScreen(W, H, x, y, 10) || inRect(icons, x, y, 22)) continue;
      // 芦苇在岸上，稍微离开水边
      const dx = x - geo.cx, dy = y - geo.cy, d = Math.hypot(dx, dy) || 1;
      const px = x + dx / d * (5 + r() * 14), py = y + dy / d * (5 + r() * 14);
      if (!onScreen(W, H, px, py, 10) || inRect(icons, px, py, 24)) continue;
      if (geo.reeds.some(q => Math.hypot(q.x - px, q.y - py) < 42)) continue;
      geo.reeds.push({ x: px, y: py, s: .8 + r() * .7, seed: (e.seed + i * 3517) >>> 0 });
    }

    const wantDucks = Math.max(0, Math.round(P.ducks));
    for (let i = 0; i < 260 && geo.ducks.length < wantDucks; i++) {
      const x = W * (.25 + r() * .5), y = H * (.24 + r() * .42);
      if (!insideLake(geo, x, y, .6) || e.field.at(x, y) < 80) continue;
      const rx = 18 + r() * 16, ry = rx * (.55 + r() * .25);
      let ok = true;
      for (let k = 0; k < 12 && ok; k++) {
        const a = k / 12 * TAU;
        const px = x + Math.cos(a) * rx, py = y + Math.sin(a) * ry;
        if (!insideLake(geo, px, py, .82)) ok = false;
        if (e.field.at(px, py) < 34) ok = false;
      }
      if (!ok) continue;
      if (geo.ducks.some(d => Math.hypot(d.x - x, d.y - y) < 100)) continue;
      if (geo.reeds.some(q => Math.hypot(q.x - x, q.y - y) < 55)) continue;
      geo.ducks.push({ x, y, rx, ry, speed: .10 + r() * .07, phase: r() * TAU, dir: r() < .5 ? -1 : 1, s: 1.2 + r() * .3 });
    }

    for (let i = 0; i < 260 && geo.ripples.length < 14; i++) {
      const x = W * (.18 + r() * .64), y = H * (.14 + r() * .62);
      if (!insideLake(geo, x, y, .88) || e.field.at(x, y) < 40) continue;
      if (geo.ripples.some(q => Math.hypot(q.x - x, q.y - y) < 50)) continue;
      geo.ripples.push({ x, y, ph: r() * TAU, sp: .7 + r() * .7 });
    }

    // 水面上漂着的几片叶子
    geo.leaves = [];
    for (let i = 0; i < 200 && geo.leaves.length < 10; i++) {
      const x = W * (.16 + r() * .68), y = H * (.12 + r() * .64);
      if (!insideLake(geo, x, y, .72) || e.field.at(x, y) < 30) continue;
      if (geo.ducks.some(d => Math.hypot(d.x - x, d.y - y) < 70)) continue;
      if (geo.leaves.some(q => Math.hypot(q.x - x, q.y - y) < 70)) continue;
      geo.leaves.push({ x, y, s: 3 + r() * 3, rot: r() * TAU, ph: r() * TAU });
    }
    return geo;
  }

  function drawLakeLeaf(g, l) {
    g.save(); g.translate(l.x, l.y); g.rotate(l.rot);
    g.fillStyle = U.rgba('#4c7a3c', .75);
    g.beginPath(); g.ellipse(0, 0, l.s, l.s * .46, 0, 0, TAU); g.fill();
    g.strokeStyle = U.rgba('#86ad62', .55); g.lineWidth = .8;
    g.beginPath(); g.moveTo(-l.s * .8, 0); g.lineTo(l.s * .8, 0); g.stroke();
    g.restore();
    g.strokeStyle = U.rgba(LP.ripple, .12); g.lineWidth = 1;
    g.beginPath(); g.ellipse(l.x, l.y, l.s + 3, l.s * .55 + 2, 0, 0, TAU); g.stroke();
  }

  function lakeStatic(g, e) {
    const { W, H } = e;
    const geo = buildLakeGeo(e);
    e.st.lgeo = geo;
    lakeMeadow(g, e);
    lakeWater(g, e, geo);
    lakeBanks(g, e, geo);
    // 草与花用图标洞挖掉，标签周围留干净
    U.mask(g, cg => groundDetail(cg, e, geo), U.iconHoles(e, .18));
    for (const l of geo.leaves) drawLakeLeaf(g, l);
    // 图标底下一层非常淡的暖光
    for (const ic of e.icons)
      U.softEllipse(g, ic.x + ic.w / 2, ic.y + ic.h / 2, ic.w * .92 + e.P.sigma * .3, ic.h * .92 + e.P.sigma * .26, '#f9f5d8', .05, .3);
    U.vignette(g, W, H, LP.vig, .14);
    U.grain(g, W, H, LP.grain);
  }

  function drawReeds(g, e, geo, t) {
    const wind = e.P.wind;
    for (const cl of geo.reeds) {
      const r = U.rng(cl.seed), n = 4 + (r() * 4 | 0), base = cl.s;
      for (let i = 0; i < n; i++) {
        const ox = (r() - .5) * 16 * base, oy = (r() - .5) * 5;
        const h = (18 + r() * 18) * base;
        const sway = Math.sin(t * (.9 + i * .16) + cl.x * .02 + i * 1.7) * (1.2 + wind * 2.2) * base;
        const x0 = cl.x + ox, y0 = cl.y + oy;
        g.strokeStyle = U.rgba(i % 2 ? LP.reed : LP.reedLight, .85);
        g.lineWidth = 1.2 + r() * 1.0; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0);
        g.quadraticCurveTo(x0 + sway * .4, y0 - h * .55, x0 + sway, y0 - h);
        g.stroke();
        if (i === 0) {
          // 香蒲棒
          g.fillStyle = U.rgba(LP.cattail, .92);
          g.beginPath(); g.ellipse(x0 + sway, y0 - h - 2, 1.8, 4.6, 0, 0, TAU); g.fill();
        }
        // 一两片叶子
        if (i % 2 === 0) {
          g.strokeStyle = U.rgba(LP.reedLight, .7); g.lineWidth = 1.3;
          g.beginPath(); g.moveTo(x0, y0 - h * .25);
          g.quadraticCurveTo(x0 + 9 * base, y0 - h * .5, x0 + 14 * base + sway * .4, y0 - h * .55); g.stroke();
        }
      }
    }
  }

  function lakeDuck(g, e, d, t) {
    const a = d.phase + t * d.speed * d.dir;
    const x = d.x + Math.cos(a) * d.rx, y = d.y + Math.sin(a) * d.ry;
    const dx = -Math.sin(a) * d.rx * d.dir, dy = Math.cos(a) * d.ry * d.dir;
    const ang = Math.atan2(dy, dx), s = d.s;
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
    // 涟漪
    for (let k = 0; k < 2; k++) {
      const rr = 10 + k * 7 + Math.sin(t * 1.6 + k) * 1.2;
      g.strokeStyle = U.rgba(LP.wake, .12 - k * .04); g.lineWidth = 1;
      g.beginPath(); g.ellipse(0, 0, rr, rr * .58, 0, 0, TAU); g.stroke();
    }
    // 尾迹
    g.strokeStyle = U.rgba(LP.wake, .3); g.lineWidth = 1.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-6, -2); g.quadraticCurveTo(-15, -4, -24, -8); g.stroke();
    g.beginPath(); g.moveTo(-6, 2); g.quadraticCurveTo(-15, 4, -24, 8); g.stroke();
    g.fillStyle = U.rgba(LP.wake, .28);
    for (let i = 0; i < 4; i++) {
      const k = i / 4;
      g.beginPath(); g.arc(-9 - k * 15, (i % 2 ? 1 : -1) * (2 + k * 4), .8 + k * .6, 0, TAU); g.fill();
    }
    // 身体、翅膀、头和嘴
    g.fillStyle = U.rgba(LP.reed, .14);
    g.beginPath(); g.ellipse(1, 2.6, 9.4, 6.6, 0, 0, TAU); g.fill();
    g.fillStyle = LP.duck;
    g.beginPath(); g.ellipse(-1, 0, 9.4, 6.4, 0, 0, TAU); g.fill();
    g.strokeStyle = U.rgba(LP.wake, .2); g.lineWidth = 1;
    g.beginPath(); g.ellipse(-1, 0, 9.4, 6.4, 0, 0, TAU); g.stroke();
    g.fillStyle = LP.duckDark;
    g.beginPath(); g.ellipse(-2, 0, 4.9, 4.3, .2, 0, TAU); g.fill();
    g.strokeStyle = U.rgba(LP.wake, .42); g.lineWidth = .8;
    g.beginPath(); g.moveTo(-5.2, -2.2); g.quadraticCurveTo(-2, -3.2, 1.6, -1.4); g.stroke();
    g.beginPath(); g.moveTo(-5.2, 1.8); g.quadraticCurveTo(-2, .8, 1.4, 2.1); g.stroke();
    // 尾巴
    g.fillStyle = LP.duckDark;
    g.beginPath(); g.moveTo(-9, 0); g.lineTo(-15.5, -3.4); g.lineTo(-14, 3.6); g.closePath(); g.fill();
    g.fillStyle = U.rgba(LP.wake, .7);
    g.beginPath(); g.moveTo(-12, 0); g.lineTo(-15, -1.4); g.lineTo(-15, 1.6); g.closePath(); g.fill();
    // 白色颈环 + 绿头
    g.fillStyle = U.rgba('#f6eedb', .95);
    g.beginPath(); g.ellipse(4.7, 0, 2.1, 3.3, 0, 0, TAU); g.fill();
    g.fillStyle = LP.duckHead;
    g.beginPath(); g.arc(7.4, 0, 3.5, 0, TAU); g.fill();
    g.fillStyle = U.rgba('#ffffff', .85);
    g.beginPath(); g.arc(7.9, -1.1, .85, 0, TAU); g.fill();
    g.fillStyle = U.rgba('#1c3327', .95);
    g.beginPath(); g.arc(8.5, -1.25, .45, 0, TAU); g.fill();
    g.fillStyle = LP.beak;
    g.beginPath(); g.moveTo(10.2, 0); g.lineTo(13.4, -1.1); g.lineTo(13.4, 1.1); g.closePath(); g.fill();
    g.restore();
  }

  function lakePaint(g, e) {
    const geo = e.st.lgeo;
    if (!geo) return;
    const t = e.t, wind = e.P.wind;
    // 水面涟漪：两圈错开扩散
    for (const rp of geo.ripples) {
      for (let k = 0; k < 2; k++) {
        const u = ((t * (.10 + rp.sp * .06) * (0.7 + wind * .3) + rp.ph + k * .5) % 1);
        const rr = 3 + u * (13 + rp.sp * 8);
        g.strokeStyle = U.rgba(LP.ripple, (1 - u) * .4);
        g.lineWidth = 1.3;
        g.beginPath(); g.ellipse(rp.x, rp.y, rr, rr * .58, 0, 0, TAU); g.stroke();
      }
    }
    // 芦苇与鸭子
    drawReeds(g, e, geo, t);
    for (const d of geo.ducks) lakeDuck(g, e, d, t);

    // 风里飘的草籽
    if (wind > .02) {
      const n = Math.round(4 + wind * 12);
      for (let i = 0; i < n; i++) {
        const sp = 6 + (i % 4) * 3 + wind * 8;
        const x = ((i * 173 + t * sp) % (e.W + 80)) - 40;
        const y = (i * 97 % (e.H * .7)) + e.H * .14 + Math.sin(t * .6 + i) * 10;
        if (e.field.at(x, y) < 10) continue;
        g.strokeStyle = U.rgba(LP.flowerA, .32);
        g.lineWidth = .9;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 3); g.stroke();
        g.fillStyle = U.rgba(LP.flowerA, .5);
        g.beginPath(); g.arc(x - 3, y - 3, 1.1, 0, TAU); g.fill();
      }
    }
  }

  SCENES['lake'] = {
    title: '湖泊',
    defaults: { sigma: 80, reeds: .5, ducks: 2, wind: 1 },
    paintStatic: lakeStatic,
    paint: lakePaint
  };

  /* ====================================================================
     三、荷塘
     ==================================================================== */
  const NP = {
    water: '#215a54', water2: '#1b4e49', water3: '#2b6a60', water4: '#194642',
    padRim: '#2f6b4f', padA: '#5a9b5c', padB: '#6aae63', padC: '#4f8f55', padD: '#7cba6a',
    vein: '#3c7a4e', padLight: '#a8d98c',
    petal: '#f2a3b8', petalDeep: '#dd7f9b', petalLight: '#f8c9d4', bud: '#ee97b0',
    center: '#f4cf5b', centerDot: '#d9a53b',
    koiOrange: '#f18a3d', koiOrangeDark: '#d96b28', koiWhite: '#f4ecdc', koiBlack: '#2b3033',
    koiCream: '#f7e0c5', koiFin: '#e8d8c0', koiFinDark: '#c9b89c',
    dragon: '#244f4c', wing: '#d8f0f2', sparkle: '#fff3cd',
    vig: '#0a2521', grain: .075
  };

  // 到最近图标的距离（iconHoles 的外沿约等于图标边 + sigma * grow）
  function iconDist(e, x, y) { return e.field.at(x, y) + e.P.sigma; }

  function pondWater(g, e) {
    const { W, H } = e, r = U.rng((e.seed ^ 0x0F0A) >>> 0);
    g.fillStyle = NP.water; g.fillRect(0, 0, W, H);
    // 水下的深浅：许多块中等大小的平涂色块，不用一整块大陆
    const tones = [NP.water2, NP.water3, NP.water4, '#2f7368'];
    for (let i = 0; i < 15; i++) {
      U.blob(g, r() * W, r() * H, 55 + r() * 170, 35 + r() * 105, 14, .22, r);
      g.fillStyle = U.rgba(tones[i % 4], .22 + r() * .20); g.fill();
    }
    // 更小的暗斑与亮斑，让水底有层次
    for (let i = 0; i < 10; i++) {
      U.blob(g, r() * W, r() * H, 26 + r() * 70, 18 + r() * 44, 12, .24, r);
      g.fillStyle = U.rgba(i % 3 ? NP.water4 : '#3a7d70', .12 + r() * .12); g.fill();
    }
    // 水下的水波光：一小段一小段的弧
    for (let i = 0; i < 190; i++) {
      const x = r() * W, y = r() * H, w = 6 + r() * 26;
      g.strokeStyle = U.rgba('#bfeee3', .04 + r() * .07); g.lineWidth = 1;
      g.beginPath(); g.ellipse(x, y, w, w * .22, (r() - .5) * .4, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    }
  }

  // 荷叶：带缺口的圆，放射叶脉
  function padNotch(g, x, y, r, rot, gap) {
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, r, rot + gap * .5, rot + TAU - gap * .5);
    g.closePath();
  }
  function drawPad(g, p, e) {
    const r = p.r, x = p.x, y = p.y;
    // 水下阴影
    g.fillStyle = U.rgba('#0b2e2a', .22);
    g.beginPath(); g.ellipse(x + 2.2, y + 3, r, r * .96, 0, 0, TAU); g.fill();
    // 深色边
    padNotch(g, x, y, r + 2.4, p.rot, p.gap);
    g.fillStyle = p.rim; g.fill();
    // 叶面
    padNotch(g, x, y, r, p.rot, p.gap);
    g.fillStyle = p.col; g.fill();
    // 放射叶脉
    g.strokeStyle = U.rgba(NP.vein, .38); g.lineWidth = 1;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = p.rot + p.gap * .5 + (i + .5) / n * (TAU - p.gap);
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r * .12, y + Math.sin(a) * r * .12);
      g.lineTo(x + Math.cos(a) * r * .88, y + Math.sin(a) * r * .88);
      g.stroke();
    }
    // 叶心与高光
    g.fillStyle = U.rgba(NP.vein, .55);
    g.beginPath(); g.arc(x, y, r * .07, 0, TAU); g.fill();
    g.strokeStyle = U.rgba(NP.padLight, .5); g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, r * .72, p.rot + 2.4, p.rot + 3.6); g.stroke();
    // 水珠
    if (p.drop) {
      const a = p.rot + 2.1, d = r * .45;
      const dx = x + Math.cos(a) * d, dy = y + Math.sin(a) * d;
      g.fillStyle = U.rgba(NP.padLight, .55);
      g.beginPath(); g.ellipse(dx, dy, 2.2, 1.5, -.4, 0, TAU); g.fill();
      g.fillStyle = U.rgba('#ffffff', .8);
      g.beginPath(); g.arc(dx - .4, dy - .4, .8, 0, TAU); g.fill();
    }
  }
  function drawFlower(g, f) {
    const { x, y, r, rot } = f;
    // 尖头花瓣：外圈深粉，内圈浅粉，一圈圈叠上去
    for (let ring = 0; ring < 3; ring++) {
      const n = ring === 0 ? 9 : ring === 1 ? 7 : 5;
      const rr = r * (ring === 0 ? 1 : ring === 1 ? .76 : .52);
      const off = ring * .34;
      for (let i = 0; i < n; i++) {
        const a = rot + i / n * TAU + off;
        const col = ring === 0 ? (i % 2 ? NP.petalDeep : NP.petal)
          : ring === 1 ? (i % 2 ? NP.petal : NP.petalLight) : NP.petalLight;
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(r * .12, 0);
        g.quadraticCurveTo(rr * .52, rr * .30, rr * .94, 0);
        g.quadraticCurveTo(rr * .52, -rr * .30, r * .12, 0);
        g.fill();
        g.restore();
      }
    }
    g.fillStyle = NP.center; g.beginPath(); g.arc(x, y, r * .22, 0, TAU); g.fill();
    g.fillStyle = U.rgba(NP.centerDot, .9);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + .4;
      g.beginPath(); g.arc(x + Math.cos(a) * r * .12, y + Math.sin(a) * r * .12, r * .04, 0, TAU); g.fill();
    }
  }
  function drawBud(g, b) {
    const { x, y, r, rot } = b;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = U.rgba(NP.padRim, .9);
    g.beginPath(); g.ellipse(0, r * .22, r * .4, r * .55, 0, 0, TAU); g.fill();
    g.fillStyle = NP.petalDeep;
    g.beginPath(); g.ellipse(0, -.1, r * .42, r * .68, 0, 0, TAU); g.fill();
    g.fillStyle = NP.petal;
    g.beginPath(); g.ellipse(-r * .12, -.2, r * .26, r * .52, -.2, 0, TAU); g.fill();
    g.restore();
  }

  function buildLotusGeo(e) {
    const { W, H, P, icons } = e;
    const r = U.rng((e.seed ^ 0x1005) >>> 0);
    const geo = { pads: [], koi: [], flowers: [], buds: [], dragonflies: [], sparkles: [], petals: [] };

    // 1) 先给锦鲤留出环形泳道，荷叶再绕着泳道长
    const wantKoi = Math.max(0, Math.round(P.koi));
    for (let i = 0; i < 500 && geo.koi.length < wantKoi; i++) {
      const R = 24 + r() * 22;
      const x = W * (.10 + r() * .80), y = H * (.10 + r() * .80);
      if (!onScreen(W, H, x, y, R + 40)) continue;
      if (iconDist(e, x, y) < R + 20) continue;
      let ok = true;
      for (let k = 0; k < 20 && ok; k++) {
        const a = k / 20 * TAU;
        const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
        if (!onScreen(W, H, px, py, 20) || iconDist(e, px, py) < 22) ok = false;
      }
      if (!ok) continue;
      if (geo.koi.some(q => Math.hypot(q.x - x, q.y - y) < q.R + R + 26)) continue;
      geo.koi.push({
        x, y, R, phase: r() * TAU, speed: .12 + r() * .12, dir: r() < .5 ? -1 : 1,
        kind: geo.koi.length % 3, len: 27 + r() * 9, wig: 2 + r() * 1.2
      });
    }

    // 2) 荷叶：成簇 + 零星，避开图标洞和锦鲤泳道
    const wantPads = Math.max(0, Math.round(P.pads * 130));
    const clusters = [];
    const nClusters = Math.round(P.pads * 12);
    // 几个固定的簇，防止画面中间空出一大片
    if (P.pads > .03) for (const [fx, fy] of [[.47, .54], [.33, .70], [.64, .70], [.39, .32]]) {
      const x = W * fx, y = H * fy;
      if (!onScreen(W, H, x, y, 50) || iconDist(e, x, y) < 66) continue;
      if (clusters.some(c => Math.hypot(c.x - x, c.y - y) < 100)) continue;
      clusters.push({ x, y });
    }
    for (let i = 0; i < 300 && clusters.length < nClusters; i++) {
      const x = W * (.08 + r() * .84), y = H * (.08 + r() * .84);
      if (!onScreen(W, H, x, y, 50)) continue;
      if (iconDist(e, x, y) < 70) continue;
      if (clusters.some(c => Math.hypot(c.x - x, c.y - y) < 105)) continue;
      clusters.push({ x, y });
    }
    const laneBlocked = (x, y, pr) => geo.koi.some(k => Math.abs(Math.hypot(x - k.x, y - k.y) - k.R) < pr + 22);
    const padOK = (x, y, pr) => onScreen(W, H, x, y, 12) && iconDist(e, x, y) > pr + e.P.sigma * .32 + 3 && !laneBlocked(x, y, pr);
    const cols = [NP.padA, NP.padB, NP.padC, NP.padD];
    for (const c of clusters) {
      const n = 5 + (r() * 7 | 0);
      for (let i = 0; i < n; i++) {
        for (let tries = 0; tries < 14; tries++) {
          const a = r() * TAU, d = r() * 82;
          const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d * .82;
          const pr = 12 + r() * 29;
          if (!padOK(x, y, pr)) continue;
          geo.pads.push({
            x, y, r: pr, rot: r() * TAU, gap: .30 + r() * .22, col: cols[(r() * 4) | 0],
            rim: NP.padRim, drop: r() < .16, seed: (e.seed + geo.pads.length * 7919) >>> 0, flower: false
          });
          break;
        }
      }
    }
    for (let i = 0; i < 400 && geo.pads.length < wantPads; i++) {
      const x = W * (.03 + r() * .94), y = H * (.05 + r() * .90), pr = 9 + r() * 25;
      if (!padOK(x, y, pr)) continue;
      geo.pads.push({
        x, y, r: pr, rot: r() * TAU, gap: .28 + r() * .24, col: cols[(r() * 4) | 0],
        rim: NP.padRim, drop: r() < .14, seed: (e.seed + geo.pads.length * 7919) >>> 0, flower: false
      });
    }
    geo.pads.sort((a, b) => b.r - a.r);

    // 3) 荷花与花苞：落在较大的荷叶上，花之间留距离
    const bloom = Math.max(0, Math.round(P.bloom * 15));
    const bigs = geo.pads.filter(p => p.r > 19);
    for (let i = 0; i < bigs.length && geo.flowers.length < bloom; i++) {
      const p = bigs[(i * 7 + 3) % bigs.length];
      if (p.flower) continue;
      if (geo.flowers.some(f => Math.hypot(f.x - p.x, f.y - p.y) < 62)) continue;
      p.flower = true;
      geo.flowers.push({ x: p.x, y: p.y, r: 10 + p.r * .34, rot: r() * TAU, seed: p.seed });
    }
    const buds = Math.max(0, Math.round(P.bloom * 5));
    for (let i = 0; i < bigs.length && geo.buds.length < buds; i++) {
      const p = bigs[(i * 11 + 5) % bigs.length];
      if (p.flower) continue;
      if (geo.flowers.some(f => Math.hypot(f.x - p.x, f.y - p.y) < 44)) continue;
      if (geo.buds.some(f => Math.hypot(f.x - p.x, f.y - p.y) < 44)) continue;
      p.flower = true;
      geo.buds.push({ x: p.x, y: p.y, r: 5 + p.r * .16, rot: r() * TAU });
    }

    // 4) 蜻蜓与水面光点
    for (let i = 0; i < 240 && geo.dragonflies.length < 4; i++) {
      const x = W * (.15 + r() * .70), y = H * (.12 + r() * .70);
      if (!onScreen(W, H, x, y, 50) || iconDist(e, x, y) < 40) continue;
      if (geo.dragonflies.some(q => Math.hypot(q.x - x, q.y - y) < 150)) continue;
      geo.dragonflies.push({ x, y, ph: r() * TAU, sp: .5 + r() * .5 });
    }
    for (let i = 0; i < 300 && geo.sparkles.length < 28; i++) {
      const x = W * (.04 + r() * .92), y = H * (.05 + r() * .90);
      if (!onScreen(W, H, x, y, 16) || iconDist(e, x, y) < 12) continue;
      if (geo.pads.some(p => Math.hypot(p.x - x, p.y - y) < p.r + 5)) continue;
      geo.sparkles.push({ x, y, s: 1.2 + r() * 2, ph: r() * TAU, sp: .6 + r() * .9 });
    }
    // 水面上漂着的几片花瓣
    for (let i = 0; i < 260 && geo.petals.length < 18; i++) {
      const x = W * (.05 + r() * .9), y = H * (.06 + r() * .86);
      if (!onScreen(W, H, x, y, 14) || iconDist(e, x, y) < 16) continue;
      geo.petals.push({ x, y, r: 2.4 + r() * 2.6, rot: r() * TAU });
    }
    return geo;
  }

  function drawPetal(g, p) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
    g.fillStyle = U.rgba(NP.petalDeep, .82);
    g.beginPath(); g.ellipse(0, 0, p.r, p.r * .5, 0, 0, TAU); g.fill();
    g.fillStyle = U.rgba(NP.petalLight, .8);
    g.beginPath(); g.ellipse(-p.r * .15, -.3, p.r * .58, p.r * .28, -.1, 0, TAU); g.fill();
    g.restore();
  }

  function lotusStatic(g, e) {
    const { W, H } = e;
    const geo = buildLotusGeo(e);
    e.st.legeo = geo;
    pondWater(g, e);
    // 荷叶和花整体避开图标（用图标洞挖掉）
    U.mask(g, cg => {
      for (const p of geo.pads) drawPad(cg, p, e);
      for (const f of geo.flowers) drawFlower(cg, f);
      for (const b of geo.buds) drawBud(cg, b);
      for (const p of geo.petals) drawPetal(cg, p);
    }, U.iconHoles(e, .30));
    // 图标底下一圈极淡的水光，标签仍然清楚
    for (const ic of e.icons)
      U.softEllipse(g, ic.x + ic.w / 2, ic.y + ic.h / 2, ic.w * .9 + e.P.sigma * .3, ic.h * .9 + e.P.sigma * .28, '#bff1e4', .045, .3);
    U.vignette(g, W, H, NP.vig, .20);
    U.grain(g, W, H, NP.grain);
  }

  // —— 锦鲤 ——
  function koiColors(kind) {
    if (kind === 1) return { body: NP.koiWhite, fin: NP.koiFin, patch: NP.koiOrange };
    if (kind === 2) return { body: NP.koiBlack, fin: NP.koiFinDark, patch: NP.koiWhite };
    return { body: NP.koiOrange, fin: NP.koiOrangeDark, patch: NP.koiCream };
  }
  function drawKoi(g, k, x, y, head, t) {
    const c = koiColors(k.kind), L = k.len, Wd = L * .27;
    const N = 11, pts = [], hw = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const d = L * (.5 - u);
      const lat = Math.sin(t * k.wig + u * 4.6 + k.phase) * (u * u) * L * .16;
      const ca = Math.cos(head), sa = Math.sin(head);
      pts.push([x + ca * d - sa * lat, y + sa * d + ca * lat]);
      hw.push(Wd * Math.sin(Math.PI * (.10 + .86 * u)) * (.35 + .65 * Math.min(1, u * 3.2)));
    }
    // 身体轮廓
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(N, i + 1)];
      let nx = -(next[1] - prev[1]), ny = next[0] - prev[0];
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const px = p[0] + nx * hw[i], py = p[1] + ny * hw[i];
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    for (let i = N; i >= 0; i--) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(N, i + 1)];
      let nx = -(next[1] - prev[1]), ny = next[0] - prev[0];
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      g.lineTo(p[0] - nx * hw[i], p[1] - ny * hw[i]);
    }
    g.closePath();
    g.fillStyle = c.body; g.fill();
    g.strokeStyle = U.rgba('#f6f2e2', .16); g.lineWidth = .9; g.stroke();
    // 圆一点的头部
    g.fillStyle = c.body;
    g.beginPath(); g.arc(pts[0][0], pts[0][1], hw[1] * 1.35, 0, TAU); g.fill();
    // 尾巴：两片薄纱
    const tail = pts[N], tp = pts[N - 1];
    const ta = Math.atan2(tail[1] - tp[1], tail[0] - tp[0]);
    g.save(); g.translate(tail[0], tail[1]); g.rotate(ta);
    g.fillStyle = U.rgba(c.fin, .9);
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(L * .10, -L * .14, L * .30, -L * .20);
    g.quadraticCurveTo(L * .16, -L * .04, L * .12, 0);
    g.quadraticCurveTo(L * .16, L * .04, L * .30, L * .20);
    g.quadraticCurveTo(L * .10, L * .14, 0, 0);
    g.fill();
    g.restore();
    // 胸鳍
    const fp = pts[Math.round(N * .34)];
    g.fillStyle = U.rgba(c.fin, .65);
    g.save(); g.translate(fp[0], fp[1]); g.rotate(head + .8);
    g.beginPath(); g.ellipse(0, Wd * .8, Wd * .55, Wd * .22, .2, 0, TAU); g.fill();
    g.restore();
    g.save(); g.translate(fp[0], fp[1]); g.rotate(head - .8);
    g.beginPath(); g.ellipse(0, -Wd * .8, Wd * .55, Wd * .22, -.2, 0, TAU); g.fill();
    g.restore();
    // 斑块
    g.fillStyle = c.patch;
    for (let i = 0; i < 3; i++) {
      const u = .18 + i * .25;
      const idx = Math.round(u * N), p = pts[idx];
      const prev = pts[Math.max(0, idx - 1)], next = pts[Math.min(N, idx + 1)];
      const ang = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
      g.save(); g.translate(p[0] - Math.sin(ang) * hw[idx] * .35, p[1] + Math.cos(ang) * hw[idx] * .35); g.rotate(ang);
      g.beginPath(); g.ellipse(0, 0, L * (.07 + i * .012), Wd * .55, 0, 0, TAU); g.fill();
      g.restore();
    }
    // 眼睛
    const hp = pts[2], h0 = pts[0];
    const ha = Math.atan2(hp[1] - h0[1], hp[0] - h0[0]);
    g.fillStyle = U.rgba('#f5f2e4', .9);
    g.beginPath(); g.arc(h0[0] + Math.cos(ha + 1.2) * Wd * .6, h0[1] + Math.sin(ha + 1.2) * Wd * .6, 1.1, 0, TAU); g.fill();
    g.fillStyle = U.rgba('#111817', .9);
    g.beginPath(); g.arc(h0[0] + Math.cos(ha + 1.2) * Wd * .6, h0[1] + Math.sin(ha + 1.2) * Wd * .6, .55, 0, TAU); g.fill();
  }

  function lotusPaint(g, e) {
    const geo = e.st.legeo;
    if (!geo) return;
    const t = e.t;

    // 锦鲤：沿泳道慢慢游，身体轻轻摆
    for (const k of geo.koi) {
      const a = k.phase + t * k.speed * k.dir;
      const x = k.x + Math.cos(a) * k.R, y = k.y + Math.sin(a) * k.R * .86;
      const dx = -Math.sin(a) * k.R * k.dir, dy = Math.cos(a) * k.R * .86 * k.dir;
      const head = Math.atan2(dy, dx);
      if (e.field.at(x, y) + e.P.sigma < 14) continue;
      // 身后的涟漪圈
      for (let q = 1; q <= 2; q++) {
        const aa = a - q * .10 * k.dir;
        const rx = k.x + Math.cos(aa) * k.R, ry = k.y + Math.sin(aa) * k.R * .86;
        g.strokeStyle = U.rgba('#d8f2e8', .10 + .03 * q);
        g.lineWidth = 1.1;
        g.beginPath(); g.ellipse(rx, ry, 11 + q * 6, (11 + q * 6) * .72, 0, 0, TAU); g.stroke();
      }
      drawKoi(g, k, x, y, head, t);
    }

    // 蜻蜓：在固定的几片水面上来回点水
    for (const d of geo.dragonflies) {
      const x = d.x + Math.sin(t * .55 + d.ph) * 34 + Math.sin(t * 1.6 + d.ph * 2) * 9;
      const y = d.y + Math.cos(t * .47 + d.ph) * 24 + Math.sin(t * 1.9 + d.ph) * 6;
      if (e.field.at(x, y) + e.P.sigma < 8) continue;
      const vx = Math.cos(t * .55 + d.ph) * 34 * .55 + Math.cos(t * 1.6 + d.ph * 2) * 9 * 1.6;
      const vy = -Math.sin(t * .47 + d.ph) * 24 * .47 + Math.cos(t * 1.9 + d.ph) * 6 * 1.9;
      const ang = Math.atan2(vy, vx);
      // 水面上的小影子
      g.fillStyle = U.rgba('#0b2e2a', .18);
      g.beginPath(); g.ellipse(x + 6, y + 9, 6, 2.6, ang, 0, TAU); g.fill();
      g.save(); g.translate(x, y); g.rotate(ang);
      // 四片半透明的翅膀，轻轻扇
      const flap = .55 + .45 * Math.abs(Math.sin(t * 8 + d.ph));
      g.fillStyle = U.rgba(NP.wing, .6);
      g.strokeStyle = U.rgba(NP.dragon, .35); g.lineWidth = .8;
      for (const [wx, wy, wr] of [[-1, -6, -.5], [2, -8, .1], [-1, 6, .5], [2, 8, -.1]]) {
        g.save(); g.translate(wx, wy); g.rotate(wr);
        g.beginPath(); g.ellipse(0, 0, 10, 2.8 * flap, 0, 0, TAU); g.fill();
        g.stroke();
        g.restore();
      }
      g.strokeStyle = U.rgba(NP.dragon, .95); g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke();
      g.fillStyle = U.rgba(NP.dragon, .95);
      g.beginPath(); g.arc(8, 0, 2.3, 0, TAU); g.fill();
      g.fillStyle = U.rgba('#d9a53b', .9);
      g.beginPath(); g.arc(9.6, 0, 1, 0, TAU); g.fill();
      g.restore();
    }

    // 细碎光点
    for (const s of geo.sparkles) {
      const a = .15 + .55 * Math.max(0, Math.sin(t * s.sp + s.ph));
      if (a < .18) continue;
      g.strokeStyle = U.rgba(NP.sparkle, a); g.lineWidth = 1;
      g.beginPath();
      g.moveTo(s.x - s.s, s.y); g.lineTo(s.x + s.s, s.y);
      g.moveTo(s.x, s.y - s.s); g.lineTo(s.x, s.y + s.s);
      g.stroke();
    }
  }

  SCENES['lotus'] = {
    title: '荷塘',
    defaults: { sigma: 65, koi: 6, pads: .8, bloom: .6 },
    paintStatic: lotusStatic,
    paint: lotusPaint
  };
})();
