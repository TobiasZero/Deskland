'use strict';
/* ======================================================================
   Deskland · 森林 / 粉色森林
   ----------------------------------------------------------------------
   两个主题共用一套"林间空地"的骨架：
   - 图标坐在空地上：地面本身就是浅色的草地，树只长在空地外面。
     落点用 field.at() 和图标矩形的净空一起判断（树冠中心、树根各查一次），
     树冠、树干都不会压到图标。
   - paintStatic 画全部树、灌木、蕨、蘑菇、小花、光斑；paint 只画飘落的叶子 /
     花瓣、风里摇的草叶和小鸟 —— 不新建 canvas、不新建渐变。

   森林：微俯视的水彩卡通林。阔叶 / 白杨 / 松树三种树形，2~4 团树冠叠在一起，
         空地里有草、花、蘑菇和漏下来的光。
   粉色森林：米白纸底、抖动的墨线树干、半透明的粉 / 桃 / 金树冠、飘落花瓣、小鸟。
   ====================================================================== */
(function () {
  const TAU = Math.PI * 2;

  /* ====================================================================
     公共小工具
     ==================================================================== */
  function mixc(a, b, t) {
    const p = U.rgb(a), q = U.rgb(b);
    return 'rgb(' + Math.round(U.lerp(p[0], q[0], t)) + ',' + Math.round(U.lerp(p[1], q[1], t)) + ',' +
      Math.round(U.lerp(p[2], q[2], t)) + ')';
  }
  function shadec(a, f) {
    const p = U.rgb(a);
    return 'rgb(' + Math.round(U.clamp(p[0] * f, 0, 255)) + ',' + Math.round(U.clamp(p[1] * f, 0, 255)) + ',' +
      Math.round(U.clamp(p[2] * f, 0, 255)) + ')';
  }
  function pick(arr, r) { return arr[(r() * arr.length) | 0]; }

  // 一个圆形的范围（树冠 / 草叶）是否离所有图标都够远
  function iconClear(e, x, y, rad) {
    for (const ic of e.icons) {
      const dx = Math.max(ic.x - x, 0, x - (ic.x + ic.w));
      const dy = Math.max(ic.y - y, 0, y - (ic.y + ic.h));
      if (dx * dx + dy * dy < (rad + 10) * (rad + 10)) return false;
    }
    return true;
  }

  // 按"离图标的距离"取点：空地边缘 / 空地里面 / 全画面
  function placePoints(e, r, n, lo, hi) {
    const out = [];
    const has = e.icons.length > 0;
    for (let i = 0; i < n * 6 && out.length < n; i++) {
      const x = r() * e.W, y = r() * e.H, d = e.field.at(x, y);
      if (!has || (d > lo && d < hi)) out.push([x, y]);
    }
    return out;
  }

  // 一片叶子（两个二次曲线，柳叶形）
  function leafPath(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y - s);
    g.quadraticCurveTo(x + s * .95, y - s * .15, x, y + s);
    g.quadraticCurveTo(x - s * .95, y - s * .15, x, y - s);
    g.closePath();
  }

  /* ====================================================================
     森林 · 调色板（有限色：黄绿的草地、几种绿、暖木色 + 几个小点缀）
     ==================================================================== */
  const FP = {
    grass: '#e4ecb2',
    washes: ['#cddb96', '#dce7aa', '#c6d78f', '#eef3c4', '#d3e0a0'],
    farHaze: '#edf2cd',
    canopy: ['#2f6b4e', '#3c7a55', '#4b8a5c', '#5d9a60', '#71a765', '#3c7467', '#30604f', '#86b06b'],
    trunk: '#7c583e',
    fern: '#4f8a5b',
    mushCap: '#d9664e', mushSpot: '#f7e8c6', mushStem: '#f2e4c2',
    flowers: ['#fbf4d8', '#f3d071', '#e99aa3', '#dfe8f5'],
    stone: '#b9c49a', stoneLit: '#d5dcb8',
    leaf: ['#8fae4e', '#c9a94f', '#d97f4a', '#a8bf5e'],
    vignette: '#26452f'
  };

  /* ---- 地面：浅色草地，空地更亮、树多的地方更沉 ---- */
  function forestGround(g, e, r) {
    const { W, H, P } = e;
    g.fillStyle = FP.grass;
    g.fillRect(0, 0, W, H);
    // 空地外：深一点的草色晕染（水彩块，平涂、边缘清楚）
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H;
      if (e.field.at(x, y) < P.sigma * .55) continue;
      const s = U.lerp(.06, .19, r()) * Math.min(W, H);
      g.fillStyle = FP.washes[(r() * FP.washes.length) | 0];
      g.globalAlpha = .20 + r() * .18;
      U.blob(g, x, y, s * 1.5, s, 12, .22, r);
      g.fill();
    }
    // 空地里的亮斑
    for (let i = 0; i < 34; i++) {
      const x = r() * W, y = r() * H;
      if (e.field.at(x, y) > P.sigma * 1.1) continue;
      const s = 18 + r() * 60;
      g.fillStyle = r() < .5 ? '#f0f5c6' : '#e9f0bd';
      g.globalAlpha = .20 + r() * .16;
      U.blob(g, x, y, s * 1.4, s * .8, 10, .26, r);
      g.fill();
    }
    g.globalAlpha = 1;
    // 地势：几道很淡的横向弧线（俯视时草坡的起伏）
    g.strokeStyle = 'rgba(166,190,122,.20)';
    g.lineWidth = Math.max(1, H * .0022);
    for (let i = 0; i < 5; i++) {
      const y = H * (.14 + i * .17);
      g.beginPath();
      g.moveTo(-20, y);
      g.bezierCurveTo(W * .3, y - H * .028, W * .66, y + H * .028, W + 20, y - H * .012);
      g.stroke();
    }
  }

  /* ---- 远处树墙：把画面上缘封住，树才有"后面还有很多树"的感觉 ---- */
  function forestHedge(g, e, r) {
    const { W, H } = e;
    for (let x = -34; x < W + 44; x += 26 + r() * 16) {
      const y = H * (.02 + r() * .06);
      const s = (14 + r() * 24) * (.7 + y / H);
      g.fillStyle = mixc(pick(FP.canopy, r), FP.farHaze, .5 + r() * .14);
      U.blob(g, x, y, s * 1.35, s * .9, 10, .13, r);
      g.fill();
    }
  }

  /* ---- 空地里的光斑（树影之间漏下来的光） ---- */
  function forestLight(g, e, r) {
    const { W, H, P } = e;
    for (let i = 0; i < 16; i++) {
      const x = r() * W, y = r() * H;
      if (e.field.at(x, y) > P.sigma * 1.15) continue;
      g.fillStyle = 'rgba(253,251,215,.26)';
      U.blob(g, x, y, 14 + r() * 42, 6 + r() * 18, 10, .26, r);
      g.fill();
    }
    g.fillStyle = 'rgba(255,252,222,.40)';
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = r() * H;
      if (e.field.at(x, y) > P.sigma * 1.2) continue;
      g.beginPath();
      g.arc(x, y, .7 + r() * 1.9, 0, TAU);
      g.fill();
    }
  }

  /* ---- 单棵树：阔叶（2~4 团）/ 白杨（竖着叠）/ 松树（一层层三角） ---- */
  function makeTree(e, r, x, y, depth, sizeK) {
    sizeK = sizeK || 1;
    const haze = U.clamp((.48 - depth) * 1.05, 0, .5);
    const base = pick(FP.canopy, r);
    const main = mixc(base, FP.farHaze, haze);
    const lite = mixc(main, '#f7fbd4', .38);
    const R = (15 + 44 * depth) * (.62 + r() * .72) * sizeK;
    const sp = r();
    const species = sp < .16 ? 2 : sp < .4 ? 1 : 0;
    const trunkH = R * (species === 1 ? 1.95 + r() * .65 : 1.2 + r() * .7);
    const lean = (r() * 2 - 1) * R * .55;
    const w = Math.max(1.5, R * .12);
    const cx = x + lean, cy = y - trunkH;
    const blobs = [];
    if (species === 1) {
      // 白杨：几团竖着叠起来的高树冠
      const n = 2 + (r() < .5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const rx = R * (.5 + r() * .14) * (1 - i * .1);
        blobs.push({
          x: cx + (r() * 2 - 1) * R * .14, y: cy - i * R * .66, rx,
          ry: rx * (1.3 + r() * .28),
          c: mixc(main, i === 0 ? '#1d4636' : lite, i === 0 ? .06 : .14)
        });
      }
    } else {
      // 阔叶：一大团 + 2~3 团错开的小团（叠出层叠的轮廓）
      const n = 2 + (r() * 3 | 0);
      blobs.push({ x: cx, y: cy, rx: R, ry: R * (.76 + r() * .14), c: mixc(main, '#1d4636', .06) });
      for (let i = 1; i < n; i++) {
        const a = -Math.PI / 2 + (r() * 2 - 1) * 1.7;
        const d = R * (.42 + r() * .38);
        const rx = R * (.5 + r() * .3);
        blobs.push({
          x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * .72, rx,
          ry: rx * (.78 + r() * .14),
          c: mixc(main, r() < .45 ? '#1d4636' : lite, .08 + r() * .14)
        });
      }
    }
    return {
      x, y, R, trunkH, lean, w, cx, cy, blobs, main, lite, species, depth,
      trunkCol: mixc(FP.trunk, FP.farHaze, haze * .45),
      hi: { x: cx - R * .32, y: cy - R * .34, rx: R * .5, ry: R * .34 }
    };
  }

  function drawTree(g, t, r) {
    const R = t.R;
    // 俯视时树冠压在地面上的那一小块阴影
    g.fillStyle = 'rgba(72,102,64,.15)';
    g.beginPath();
    g.ellipse(t.x + R * .2, t.y + 2, R * .88, R * .2, 0, 0, TAU);
    g.fill();

    // 树干（微弯，下粗上细）
    const cx = t.cx, cy = t.cy, tw = t.w;
    g.fillStyle = t.trunkCol;
    g.beginPath();
    g.moveTo(t.x - tw, t.y + 2);
    g.quadraticCurveTo(t.x - tw * .55 + t.lean * .4, t.y - t.trunkH * .5, cx - tw * .5, cy + 4);
    g.lineTo(cx + tw * .5, cy + 4);
    g.quadraticCurveTo(t.x + tw * .55 + t.lean * .4, t.y - t.trunkH * .5, t.x + tw, t.y + 2);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(74,50,34,.26)';
    g.lineWidth = Math.max(1, tw * .42);
    g.beginPath();
    g.moveTo(t.x + tw * .55, t.y - 2);
    g.quadraticCurveTo(t.x + tw * .2 + t.lean * .4, t.y - t.trunkH * .55, cx + tw * .22, cy);
    g.stroke();

    if (t.species === 2) {
      // 松树：一根细树干 + 几层墨绿的三角
      const topY = cy - R * .9, botY = t.y - t.trunkH * .3;
      for (let i = 0; i < 4; i++) {
        const k = i / 3;
        const yy = U.lerp(topY, botY, k);
        const w2 = R * (.42 + k * 1.0);
        const hh = R * (.5 + k * .22);
        g.fillStyle = mixc(t.main, '#173a2c', .12 + k * .04);
        g.beginPath();
        g.moveTo(cx, yy - R * .52);
        g.lineTo(cx - w2, yy + hh);
        g.quadraticCurveTo(cx, yy + hh * .7, cx + w2, yy + hh);
        g.closePath();
        g.fill();
      }
      return;
    }

    // 树冠：每团单独填（色调略不同 → 叠在一起能看出层次）
    for (const b of t.blobs) {
      g.fillStyle = b.c;
      U.blob(g, b.x, b.y, b.rx, b.ry, 12, .06, r);
      g.fill();
    }
    // 受光面
    g.globalAlpha = .5;
    g.fillStyle = t.lite;
    U.blob(g, t.hi.x, t.hi.y, t.hi.rx, t.hi.ry, 10, .18, r);
    g.fill();
    g.globalAlpha = 1;
  }

  /* ---- 树的位置：噪声成团 + 空地留白 + 空地边的小树 + 前景大树 ---- */
  function buildForest(e, r) {
    const { W, H, P } = e, sigma = P.sigma;
    const trees = [];
    const cell = U.clamp(Math.min(W, H) * .058, 44, 72);
    const cols = Math.ceil(W / cell) + 2, rows = Math.ceil(H / cell) + 2;
    for (let j = -1; j <= rows; j++) {
      for (let i = -1; i <= cols; i++) {
        const x = (i + .1 + r() * .8) * cell;
        const y = (j + .1 + r() * .8) * cell;
        const depth = U.clamp(y / H, 0, 1);
        const clump = e.noise.fbm(x * .0055 + 7, y * .0055 + 2);
        let p = (.1 + .56 * P.trees) * (.45 + clump * 1.35);
        // 画面边缘更密：把空地围起来
        p *= .92 + .35 * (1 - Math.min(x + 20, W - x + 20) / (W * .5));
        if (r() > p) continue;
        const t = makeTree(e, r, x, y, depth);
        if (!iconClear(e, t.cx, t.cy, t.R * 1.15 + 6)) continue;
        if (!iconClear(e, x, y, 8)) continue;
        if (e.field.at(t.cx, t.cy) < Math.max(sigma * .2, t.R * .3)) continue;
        trees.push(t);
      }
    }
    // 空地边缘的小树苗
    for (const [x, y] of placePoints(e, r, 26, -sigma * .05, sigma * .95)) {
      const t = makeTree(e, r, x, y, U.clamp(y / H, .15, 1), .46 + r() * .2);
      if (!iconClear(e, t.cx, t.cy, t.R * 1.15 + 4)) continue;
      trees.push(t);
    }
    // 前景：画面下角的大树，只露一部分
    const spots = [[-.04, 1.04, 2.1], [.97, 1.06, 2.5]];
    for (let i = 0; i < 2; i++) {
      const x = spots[i][0] * W + (r() - .5) * W * .07;
      const y = H * spots[i][1];
      const t = makeTree(e, r, x, y, 1, spots[i][2]);
      if (!iconClear(e, t.cx, t.cy, t.R * 1.15 + 6)) continue;
      trees.push(t);
    }
    trees.sort((a, b) => a.y - b.y);
    return trees;
  }

  /* ---- 小物 ---- */
  function drawBush(g, x, y, s, depth, r) {
    const haze = U.clamp((.46 - depth) * .9, 0, .4);
    const main = mixc(pick(FP.canopy, r), FP.farHaze, haze);
    g.fillStyle = 'rgba(72,102,64,.13)';
    g.beginPath();
    g.ellipse(x + s * .12, y + 1, s * 1.0, s * .24, 0, 0, TAU);
    g.fill();
    g.fillStyle = mixc(main, '#1d4636', .1);
    U.blob(g, x, y - s * .2, s * 1.02, s * .7, 10, .12, r);
    g.fill();
    g.fillStyle = main;
    U.blob(g, x - s * .12, y - s * .34, s * .82, s * .6, 10, .14, r);
    g.fill();
    g.globalAlpha = .4;
    g.fillStyle = mixc(main, '#f6fad2', .4);
    U.blob(g, x - s * .3, y - s * .6, s * .42, s * .26, 8, .2, r);
    g.fill();
    g.globalAlpha = 1;
  }

  function drawFern(g, x, y, s, rot, r) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.lineCap = 'round';
    for (let f = 0; f < 4; f++) {
      const a = -Math.PI / 2 + (f - 1.5) * .36;
      const L = s * (.75 + (f % 2) * .16);
      const ex = Math.cos(a) * L, ey = Math.sin(a) * L;
      const qx = Math.cos(a) * L * .42 - L * .08, qy = Math.sin(a) * L * .52 + L * .06;
      g.strokeStyle = 'rgba(62,110,74,.85)';
      g.lineWidth = Math.max(1, s * .05);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(qx, qy, ex, ey);
      g.stroke();
      for (let k = 1; k <= 5; k++) {
        const tq = k / 6.2, u = 1 - tq;
        const px = 2 * u * tq * qx + tq * tq * ex;
        const py = 2 * u * tq * qy + tq * tq * ey;
        const ln = s * .2 * (1 - tq * .5);
        for (const sd of [-1, 1]) {
          g.fillStyle = sd < 0 ? 'rgba(80,136,90,.92)' : 'rgba(110,164,108,.92)';
          g.beginPath();
          g.ellipse(px + sd * ln * .5, py - ln * .05, ln * 1.2, ln * .4, a + sd * .95, 0, TAU);
          g.fill();
        }
      }
    }
    g.restore();
  }

  function drawMushroom(g, x, y, s, r) {
    g.fillStyle = FP.mushStem;
    g.fillRect(x - s * .24, y - s * .9, s * .48, s * .9);
    g.fillStyle = FP.mushCap;
    g.beginPath();
    g.moveTo(x - s, y - s * .88);
    g.quadraticCurveTo(x, y - s * 1.95, x + s, y - s * .88);
    g.closePath();
    g.fill();
    g.fillStyle = FP.mushSpot;
    g.beginPath();
    g.arc(x - s * .33, y - s * 1.14, s * .16, 0, TAU);
    g.arc(x + s * .27, y - s * 1.06, s * .11, 0, TAU);
    g.fill();
  }

  function drawFlower(g, x, y, s, col, r) {
    g.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + r() * .2;
      g.beginPath();
      g.arc(x + Math.cos(a) * s * .8, y + Math.sin(a) * s * .8, s * .62, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#f0c451';
    g.beginPath();
    g.arc(x, y, s * .5, 0, TAU);
    g.fill();
  }

  function drawGrass(g, x, y, s, col, r) {
    g.strokeStyle = U.rgba(col, .5);
    g.lineWidth = Math.max(1, s * .1);
    g.lineCap = 'round';
    const k = 4 + (r() * 3 | 0);
    g.beginPath();
    for (let i = 0; i < k; i++) {
      const a = -Math.PI / 2 + (r() * 2 - 1) * .6;
      const L = s * (.65 + r() * .6);
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * L * .4, y + Math.sin(a) * L * .6,
        x + Math.cos(a) * L, y + Math.sin(a) * L);
    }
    g.stroke();
  }

  function drawStone(g, x, y, s, r) {
    g.fillStyle = FP.stone;
    g.beginPath();
    g.moveTo(x - s, y);
    g.lineTo(x - s * .5, y - s * .7);
    g.lineTo(x + s * .45, y - s * .55);
    g.lineTo(x + s, y + s * .05);
    g.closePath();
    g.fill();
    g.fillStyle = FP.stoneLit;
    g.beginPath();
    g.moveTo(x - s * .5, y - s * .7);
    g.lineTo(x + s * .45, y - s * .55);
    g.lineTo(x - s * .1, y - s * .25);
    g.closePath();
    g.fill();
  }

  /* ---- 空地周围的小物（整层掩掉图标，绝不压到图标） ---- */
  function forestProps(g, e) {
    U.mask(g, cg => drawForestProps(cg, e), U.iconHoles(e, .3));
  }
  function drawForestProps(g, e) {
    const r = U.rng((e.seed ^ 0x1f7c3) >>> 0);
    const { H, P } = e, sigma = P.sigma;

    // 灌木：空地外圈
    for (const [x, y] of placePoints(e, r, Math.round(12 + P.trees * 14), 2, sigma * 1.5))
      drawBush(g, x, y, 15 + r() * 24, y / H, r);
    // 蕨
    for (const [x, y] of placePoints(e, r, 14, -sigma * .25, sigma * 1.4))
      drawFern(g, x, y, 20 + r() * 30, (r() * 2 - 1) * .3, r);
    // 蘑菇（两三朵一簇）
    for (const [x, y] of placePoints(e, r, 11, 0, sigma * 1.2)) {
      const n = 1 + (r() * 3 | 0);
      for (let k = 0; k < n; k++)
        drawMushroom(g, x + (r() * 2 - 1) * 22, y + (r() * 2 - 1) * 8, 5 + r() * 6, r);
    }
    // 小花
    for (const [x, y] of placePoints(e, r, 70, -sigma * .55, 1e9))
      drawFlower(g, x, y, 2.2 + r() * 2.4, pick(FP.flowers, r), r);
    // 草丛：空地里的更密
    for (const [x, y] of placePoints(e, r, 150, -sigma * .6, 1e9))
      drawGrass(g, x, y, 6 + r() * 11, r() < .5 ? FP.fern : '#7fae6a', r);
    // 石头
    for (const [x, y] of placePoints(e, r, 10, -sigma * .35, 1e9))
      drawStone(g, x, y, 3 + r() * 7, r);
    // 地上的落叶
    for (const [x, y] of placePoints(e, r, 26, -sigma * .6, 1e9)) {
      g.save();
      g.translate(x, y);
      g.rotate(r() * TAU);
      g.fillStyle = U.rgba(pick(FP.leaf, r), .8);
      leafPath(g, 0, 0, 2.6 + r() * 2.6);
      g.fill();
      g.restore();
    }
  }

  /* ---- 林间的光柱 ---- */
  function forestRays(g, e) {
    const { W, H } = e;
    U.glow(g, W * .1, -H * .06, Math.min(W, H) * .8, '#fff4c2', .1);
    for (let i = 0; i < 4; i++) {
      const x0 = W * (.01 + i * .17);
      const w = W * (.03 + i * .012);
      const sh = H * .8;
      g.fillStyle = 'rgba(255,247,205,.05)';
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x0 + w, 0);
      g.lineTo(x0 + w + sh, H);
      g.lineTo(x0 + sh, H);
      g.closePath();
      g.fill();
    }
  }

  /* ---- 前景草叶（会被风摇动，所以每帧画） ---- */
  function buildSprigs(e, r) {
    const { W, H } = e;
    const spots = [[.5, 1.005, 1], [.7, 1.01, -1], [.92, 1.0, 1], [.31, 1.012, -1], [.44, 1.008, 1]];
    const out = [];
    for (const [sx, sy, dir] of spots) {
      const x = W * sx, y = H * sy, h = H * (.05 + r() * .035);
      if (!iconClear(e, x, y - h * .45, h * .55 + 6)) continue;
      const blades = [];
      const nb = 8 + (r() * 5 | 0);
      for (let i = 0; i < nb; i++) {
        blades.push({
          dx: (r() * 2 - 1) * h * .24,
          bend: (r() * 2 - 1) * h * .3 + dir * h * .06,
          len: h * (.5 + r() * .6),
          w: Math.max(1, h * (.05 + r() * .03)),
          ph: r() * TAU
        });
      }
      out.push({ x, y, h, dir, ph: r() * TAU, blades });
    }
    return out;
  }

  function drawSprig(g, s, t, wind) {
    const sway = Math.sin(t * (1.3 + wind * .5) + s.ph) * (.04 + .06 * wind);
    g.save();
    g.translate(s.x, s.y);
    g.rotate(sway * s.dir);
    g.lineCap = 'round';
    for (const b of s.blades) {
      const wave = Math.sin(t * (1.6 + wind * .7) + b.ph) * wind;
      g.strokeStyle = 'rgba(48,86,54,.8)';
      g.lineWidth = b.w;
      g.beginPath();
      g.moveTo(b.dx, 0);
      g.quadraticCurveTo(b.dx + b.bend * .5 + wave * 2, -b.len * .55, b.dx + b.bend + wave * 6, -b.len);
      g.stroke();
    }
    g.restore();
  }

  /* ---- 森林的静态图层 ---- */
  function forestStatic(g, e) {
    const r = e.rng;
    forestGround(g, e, r);
    forestHedge(g, e, r);
    forestLight(g, e, r);

    const trees = buildForest(e, r);
    const back = trees.filter(t => t.depth < .55);
    const front = trees.filter(t => t.depth >= .55);
    for (const t of back) drawTree(g, t, r);
    forestProps(g, e);
    for (const t of front) drawTree(g, t, r);

    e.st.sprigs = buildSprigs(e, r);
    e.st.leafC = FP.leaf.map(c => U.rgba(c, .92));

    forestRays(g, e);
    U.grain(g, e.W, e.H, .06);
    U.vignette(g, e.W, e.H, FP.vignette, .22);
  }

  /* ---- 森林的动画：风里的草叶、飘落的叶子、空中的光尘 ---- */
  function forestPaint(g, e) {
    const { W, H, P, t } = e;
    const wind = U.clamp(P.wind, 0, 3);

    for (const s of e.st.sprigs || []) drawSprig(g, s, t, wind);

    // 飘落的叶子
    const cols = e.st.leafC || FP.leaf;
    const n = Math.round(U.clamp(P.leaves, 0, 1) * 28);
    const speed = .55 + wind * .9;
    for (let i = 0; i < n; i++) {
      const y = (i * 131.7 + t * (24 + (i % 5) * 10) * speed) % (H + 120) - 60;
      const x = (i * .618034 % 1) * W + Math.sin(t * (.5 + wind * .6) + i * 1.7) * (8 + wind * 16) +
        Math.sin(t * .23 + i) * 10;
      const sz = 3 + (i % 4) * 1.2;
      g.save();
      g.translate(x, y);
      g.rotate(t * (.5 + wind * .8) * (i % 2 ? 1 : -1) + i);
      g.fillStyle = cols[i % cols.length];
      leafPath(g, 0, 0, sz);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.20)';
      g.lineWidth = .8;
      g.beginPath();
      g.moveTo(0, -sz * .7);
      g.lineTo(0, sz * .7);
      g.stroke();
      g.restore();
    }

    // 阳光里的浮尘
    for (let i = 0; i < 16; i++) {
      const x = (i * .37 % 1) * W + Math.sin(t * .3 + i * 2) * 24;
      const y = H - ((t * (3 + i % 4) + i * 53) % (H + 40));
      g.fillStyle = 'rgba(255,250,206,.32)';
      g.beginPath();
      g.arc(x, y, 1 + (i % 3) * .7, 0, TAU);
      g.fill();
    }
  }

  /* ====================================================================
     粉色森林 · 调色板（米白纸 + 粉 / 桃 / 金 + 墨线 + 一点点灰绿）
     ==================================================================== */
  const PP = {
    paper: '#fbf6ee',
    paperWash: ['#f7ecdd', '#f8e9e3', '#faf1da', '#f6eee6'],
    ink: '#5a4842', inkSoft: '#806b64',
    pink: ['#ee8fa2', '#ea7f95', '#f2a6b3', '#f0a48c', '#f4c3b3', '#f2cd82', '#ecb4c5', '#e992a2'],
    deep: ['#cd6a80', '#c75f78', '#cf7d6a'],
    green: '#a9bd94',
    roof: '#d97c68',
    petal: ['#ef9fb1', '#f3bda8', '#f0cd82', '#e88b9f', '#f6d4ca'],
    vignette: '#b58f7e'
  };

  /* ---- 纸底 ---- */
  function pinkPaper(g, e, r) {
    const { W, H } = e;
    g.fillStyle = PP.paper;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = pick(PP.paperWash, r);
      g.globalAlpha = .14 + r() * .12;
      U.blob(g, r() * W, r() * H * .95, (.16 + r() * .3) * W, (.1 + r() * .22) * H, 12, .26, r);
      g.fill();
    }
    g.globalAlpha = 1;
    // 底部一层很淡的暖色地面
    const gr = g.createLinearGradient(0, H * .6, 0, H);
    gr.addColorStop(0, 'rgba(246,232,216,0)');
    gr.addColorStop(1, 'rgba(242,223,201,.5)');
    g.fillStyle = gr;
    g.fillRect(0, H * .6, W, H * .4);
  }

  /* ---- 地面：几道淡淡的水彩带 + 草和落瓣 ---- */
  function pinkGround(g, e, r) {
    const { W, H } = e;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#f8efdf' : '#f9f0e4';
      g.globalAlpha = .45;
      U.blob(g, r() * W, H * (.72 + r() * .28), W * (.12 + r() * .22), H * (.03 + r() * .04), 12, .3, r);
      g.fill();
    }
    g.globalAlpha = 1;
    // 地面细草
    g.strokeStyle = 'rgba(150,132,118,.26)';
    g.lineWidth = 1;
    g.lineCap = 'round';
    for (let i = 0; i < 80; i++) {
      const x = r() * W, y = H * (.68 + r() * .32), h = 3 + r() * 7;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (r() * 2 - 1) * 2, y - h * .6, x + (r() * 2 - 1) * 5, y - h);
      g.stroke();
    }
    // 地上的落瓣
    for (let i = 0; i < 30; i++) {
      const x = r() * W, y = H * (.62 + r() * .38);
      g.save();
      g.translate(x, y);
      g.rotate(r() * TAU);
      g.fillStyle = U.rgba(pick(PP.petal, r), .65);
      g.beginPath();
      g.ellipse(0, 0, 2.4 + r() * 2, 1.4 + r(), 0, 0, TAU);
      g.fill();
      g.restore();
    }
  }

  /* ---- 抖动的墨线 ---- */
  function inkLine(g, x0, y0, x1, y1, w, r, col) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const j = Math.min(3, len * .05);
    g.strokeStyle = col;
    g.lineWidth = Math.max(.6, w);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y0);
    g.bezierCurveTo(
      x0 + dx * .33 + nx * (r() * 2 - 1) * j, y0 + dy * .33 + ny * (r() * 2 - 1) * j,
      x0 + dx * .68 + nx * (r() * 2 - 1) * j, y0 + dy * .68 + ny * (r() * 2 - 1) * j,
      x1, y1);
    g.stroke();
    // 根部加粗一点
    g.lineWidth = Math.max(.8, w * 1.7);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + dx * .1, y0 + dy * .1);
    g.stroke();
  }

  /* ---- 粉色森林的树 ---- */
  function makePinkTree(e, r, x, y, depth, sizeK) {
    sizeK = sizeK || 1;
    const s = (.6 + depth * .68) * sizeK;
    const k = r();
    const type = k < .54 ? 0 : k < .74 ? 1 : 2;

    if (type === 2) {
      // 小松树：一根墨线 + 几层灰绿的三角
      const h = (42 + r() * 44) * s;
      return {
        type, x, y, h, R: (9 + r() * 8) * s, lean: (r() * 2 - 1) * 5 * s,
        w: Math.max(.8, 1.05 * s), tiers: 3 + (r() * 3 | 0),
        cx: x, canopyY: y - h, blobs: [], branches: [], buds: null
      };
    }

    const h = (48 + r() * 74) * s;
    const lean = (r() * 2 - 1) * h * .13;
    const w = Math.max(.8, (.8 + r() * .75) * s);
    const R = (15 + r() * 20) * s;
    const cx = x + lean * 1.15, cy = y - h - R * .1;

    // 两根向上的小枝（大部分会被树冠盖住）
    const branches = [];
    for (let i = 0; i < 2; i++) {
      const bh = h * (.52 + r() * .3);
      const bx = x + lean * (bh / h), by = y - bh;
      const side = i ? 1 : -1;
      branches.push([bx, by, bx + side * R * (.55 + r() * .3), by - R * (.55 + r() * .3)]);
    }

    if (type === 1) {
      // 细枝树：只有墨线和小花点（很轻，透气）
      const buds = [];
      for (let i = 0; i < 4; i++) {
        const bh = h * (.28 + i * .18);
        const bx = x + lean * (bh / h), by = y - bh;
        const side = i % 2 ? 1 : -1;
        const bl = h * (.17 + r() * .16);
        const tipX = bx + side * bl, tipY = by - bl * (.75 + r() * .5);
        branches.push([bx, by, tipX, tipY]);
        buds.push([tipX, tipY]);
      }
      return {
        type, x, y, h, lean, w, R, cx, cy, blobs: [], branches, buds,
        canopyY: cy
      };
    }

    // 普通树冠树：2~4 团半透明的粉色块，底下垫一层深粉当阴影
    const blobs = [];
    const nb = 2 + (r() * 3 | 0);
    const baseCol = pick(PP.pink, r), altCol = pick(PP.pink, r);
    blobs.push({ x: cx, y: cy, r: R, c: baseCol, a: .62, uc: pick(PP.deep, r), ua: .22 });
    for (let i = 1; i < nb; i++) {
      const a = -Math.PI / 2 + (r() * 2 - 1) * 1.9;
      const d = R * (.46 + r() * .42);
      const rr = R * (.5 + r() * .32);
      blobs.push({
        x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * .78, r: rr,
        c: r() < .5 ? altCol : baseCol, a: .3 + r() * .3,
        uc: pick(PP.deep, r), ua: .1 + r() * .12
      });
    }
    return { type, x, y, h, lean, w, R, cx, cy, blobs, branches, buds: null, canopyY: cy };
  }

  function drawPinkTree(g, t, r) {
    // 很淡的落影
    g.fillStyle = 'rgba(198,158,146,.10)';
    g.beginPath();
    g.ellipse(t.x + t.R * .35, t.y + 1, t.R * 1.0, t.R * .16, 0, 0, TAU);
    g.fill();

    if (t.type === 2) {
      g.strokeStyle = PP.inkSoft;
      g.lineWidth = Math.max(.7, t.w * .8);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(t.x, t.y);
      g.lineTo(t.x + t.lean, t.y - t.h);
      g.stroke();
      const top = t.y - t.h, x = t.x + t.lean;
      for (let i = 0; i < t.tiers; i++) {
        const k = i / t.tiers;
        const yy = top + t.h * .9 * k;
        const w = t.R * (.3 + k * 1.0);
        g.fillStyle = mixc(PP.green, PP.paper, .06 + k * .1);
        g.beginPath();
        g.moveTo(x, yy - t.R * .45);
        g.lineTo(x - w, yy + t.h * .17);
        g.quadraticCurveTo(x, yy + t.h * .1, x + w, yy + t.h * .17);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(110,124,100,.3)';
        g.lineWidth = .7;
        g.beginPath();
        g.moveTo(x, yy - t.R * .4);
        g.lineTo(x, yy + t.h * .14);
        g.stroke();
      }
      return;
    }

    // 墨线树干 + 枝
    inkLine(g, t.x, t.y, t.x + t.lean, t.y - t.h, t.w, r, PP.ink);
    for (const b of t.branches) inkLine(g, b[0], b[1], b[2], b[3], Math.max(.7, t.w * .62), r, PP.inkSoft);

    // 细枝树：枝梢的小花
    if (t.buds) {
      for (const [bx, by] of t.buds) {
        g.fillStyle = 'rgba(230,140,158,.62)';
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.arc(bx + (r() * 2 - 1) * 3.6, by + (r() * 2 - 1) * 3.6, 1.4 + r(), 0, TAU);
          g.fill();
        }
      }
    }

    // 树冠：先垫深粉的底，再叠半透明的粉色块（叠到的地方自然深一点）
    for (const b of t.blobs) {
      g.globalAlpha = b.ua;
      g.fillStyle = b.uc;
      U.blob(g, b.x, b.y + b.r * .2, b.r * 1.02, b.r * .84, 11, .17, r);
      g.fill();
    }
    for (const b of t.blobs) {
      g.globalAlpha = b.a;
      g.fillStyle = b.c;
      U.blob(g, b.x, b.y, b.r, b.r * .84, 11, .16, r);
      g.fill();
    }
    g.globalAlpha = 1;

    // 树冠边缘垂下的一根细枝，把树和线稿连起来
    if (t.blobs.length) {
      const b0 = t.blobs[0];
      g.strokeStyle = 'rgba(122,102,94,.28)';
      g.lineWidth = .8;
      g.beginPath();
      g.moveTo(b0.x - b0.r * .3, b0.y + b0.r * .2);
      g.quadraticCurveTo(b0.x - b0.r * .5, b0.y + b0.r * .8, b0.x - b0.r * .35, b0.y + b0.r * 1.05);
      g.stroke();
    }
  }

  /* ---- 粉色森林的树：密度 + 空地（树冠整体避开图标） ---- */
  function buildPinkForest(e, r) {
    const { W, H, P } = e, sigma = P.sigma;
    const trees = [];
    const cell = U.clamp(Math.min(W, H) * .044, 34, 54);
    const cols = Math.ceil(W / cell) + 2, rows = Math.ceil(H / cell) + 2;
    for (let j = -1; j <= rows; j++) {
      for (let i = -1; i <= cols; i++) {
        const x = (i + .12 + r() * .76) * cell;
        const y = (j + .12 + r() * .76) * cell;
        const depth = U.clamp(y / H, 0, 1);
        const clump = e.noise.fbm(x * .0055 + 3, y * .0055 + 9);
        const p = (.12 + .44 * P.trees) * (.55 + clump * 1.05);
        if (r() > p) continue;
        const t = makePinkTree(e, r, x, y, depth);
        if (!iconClear(e, t.cx, t.canopyY, t.R * 1.2 + 6)) continue;
        if (!iconClear(e, t.x, t.y, 8)) continue;
        if (e.field.at(t.cx, t.canopyY) < Math.max(sigma * .3, t.R * .3)) continue;
        trees.push(t);
      }
    }
    // 空地边的小树苗
    for (const [x, y] of placePoints(e, r, 16, -sigma * .05, sigma * .8)) {
      const t = makePinkTree(e, r, x, y, U.clamp(y / H, .2, 1), .5 + r() * .15);
      if (!iconClear(e, t.cx, t.canopyY, t.R * 1.2 + 4)) continue;
      trees.push(t);
    }
    // 前景：下角两棵大树
    const spots = [[-.05, 1.03, 1.9], [.98, 1.05, 2.1]];
    for (let i = 0; i < 2; i++) {
      const x = spots[i][0] * W + (r() - .5) * W * .06;
      const y = H * spots[i][1];
      const t = makePinkTree(e, r, x, y, 1, spots[i][2]);
      if (!iconClear(e, t.cx, t.canopyY, t.R * 1.2 + 6)) continue;
      trees.push(t);
    }
    trees.sort((a, b) => a.y - b.y);
    return trees;
  }

  /* ---- 小房子（很淡的远景点缀） ---- */
  function drawHouse(g, x, y, s) {
    g.fillStyle = '#f7e8d8';
    g.strokeStyle = 'rgba(122,94,84,.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.rect(x - s * .5, y - s, s, s);
    g.fill();
    g.stroke();
    g.fillStyle = PP.roof;
    g.beginPath();
    g.moveTo(x - s * .66, y - s);
    g.lineTo(x, y - s * 1.55);
    g.lineTo(x + s * .66, y - s);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(122,94,84,.45)';
    g.fillRect(x - s * .16, y - s * .62, s * .32, s * .3);
    g.fillStyle = '#f7e8d8';
    g.fillRect(x + s * .2, y - s * 1.32, s * .14, s * .34);
  }

  function drawPerchedBird(g, x, y, s) {
    g.fillStyle = '#6d544c';
    g.beginPath();
    g.ellipse(x, y, s, s * .62, -.15, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(x + s * .82, y - s * .34, s * .42, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(x - s * .7, y - s * .1);
    g.lineTo(x - s * 1.55, y - s * .45);
    g.lineTo(x - s * .75, y + s * .35);
    g.closePath();
    g.fill();
  }

  /* ---- 粉色森林的空地：一点草、小花和低矮的花丛 ---- */
  function pinkGroundDetail(g, e, r) {
    const sigma = e.P.sigma;
    U.mask(g, cg => {
      // 低矮的花丛
      for (let i = 0; i < 7; i++) {
        const x = r() * e.W, y = e.H * (.35 + r() * .62), s = 9 + r() * 10;
        if (e.field.at(x, y) < 4) continue;
        cg.fillStyle = 'rgba(122,102,94,.5)';
        cg.lineWidth = .8;
        cg.beginPath();
        cg.moveTo(x, y);
        cg.quadraticCurveTo(x + 2, y - s * .5, x + 1, y - s);
        cg.stroke();
        cg.fillStyle = U.rgba(pick(PP.pink, r), .55);
        U.blob(cg, x + 1, y - s, s * .62, s * .48, 9, .3, r);
        cg.fill();
      }
      // 草
      for (const [x, y] of placePoints(e, r, 70, -sigma * .55, 1e9)) {
        cg.strokeStyle = 'rgba(140,124,112,.3)';
        cg.lineWidth = 1;
        cg.lineCap = 'round';
        const h = 4 + r() * 8;
        cg.beginPath();
        cg.moveTo(x, y);
        cg.quadraticCurveTo(x + (r() * 2 - 1) * 3, y - h * .6, x + (r() * 2 - 1) * 7, y - h);
        cg.stroke();
      }
      // 小花
      for (let i = 0; i < 26; i++) {
        const x = r() * e.W, y = r() * e.H;
        cg.fillStyle = U.rgba(pick(PP.petal, r), .5);
        for (let k = 0; k < 4; k++) {
          const a = k / 4 * TAU;
          cg.beginPath();
          cg.arc(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 1.9, 0, TAU);
          cg.fill();
        }
        cg.fillStyle = 'rgba(240,196,120,.75)';
        cg.beginPath();
        cg.arc(x, y, 1.3, 0, TAU);
        cg.fill();
      }
    }, U.iconHoles(e, .22));
  }

  /* ---- 粉色森林的静态图层 ---- */
  function pinkStatic(g, e) {
    const r = e.rng;
    pinkPaper(g, e, r);
    pinkGround(g, e, r);
    pinkGroundDetail(g, e, r);

    // 远远的几棵树影，让上缘分出层次
    for (let i = 0; i < 12; i++) {
      const x = r() * e.W, y = e.H * (.02 + r() * .1), s = 14 + r() * 22;
      g.globalAlpha = .25 + r() * .18;
      g.fillStyle = pick(PP.pink, r);
      U.blob(g, x, y, s, s * .8, 10, .2, r);
      g.fill();
    }
    g.globalAlpha = 1;

    // 小房子：远景，先画，后面树可以挡住一点
    for (let i = 0; i < 2; i++) {
      const x = e.W * (.18 + r() * .64), y = e.H * (.22 + r() * .3), s = 15 + r() * 8;
      if (!iconClear(e, x, y - s * .8, s * 1.2)) continue;
      drawHouse(g, x, y, s);
    }

    const trees = buildPinkForest(e, r);
    for (const t of trees) drawPinkTree(g, t, r);

    // 停在树上的小鸟
    for (let i = 0; i < 3 && trees.length; i++) {
      const t = trees[(r() * trees.length) | 0];
      if (t.type === 2) continue;
      drawPerchedBird(g, t.cx + (r() * 2 - 1) * t.R * .4, t.canopyY + t.R * .4, 2.8 + r() * 1.4);
    }

    e.st.sprigs = buildPinkSprigs(e, r);
    e.st.petalC = PP.petal.map(c => U.rgba(c, .9));

    U.vignette(g, e.W, e.H, PP.vignette, .1);
    U.grain(g, e.W, e.H, .04);
  }

  /* ---- 前景的小树苗（风里摇） ---- */
  function buildPinkSprigs(e, r) {
    const { W, H } = e;
    const spots = [[.06, 1.005, -1], [.36, 1.012, 1], [.52, 1.005, -1], [.7, 1.01, 1], [.9, 1.005, -1]];
    const out = [];
    for (const [sx, sy, dir] of spots) {
      const h = H * (.06 + r() * .05);
      const x = W * sx, y = H * sy;
      if (!iconClear(e, x, y - h * .5, h * .6 + 6)) continue;
      const branches = [];
      for (let i = 0; i < 4; i++) {
        const bh = h * (.3 + i * .16);
        const side = i % 2 ? 1 : -1;
        branches.push({ x: 0, y: -bh, dx: side * h * (.22 + r() * .12), dy: -h * (.1 + r() * .16) });
      }
      out.push({ x, y, h, dir, ph: r() * TAU, w: Math.max(.9, h * .011), branches });
    }
    return out;
  }

  function drawPinkSprig(g, s, t, wind) {
    const sway = Math.sin(t * (1.0 + wind * .5) + s.ph) * (.05 + .05 * wind);
    g.save();
    g.translate(s.x, s.y);
    g.rotate(sway * s.dir);
    g.strokeStyle = 'rgba(96,76,68,.8)';
    g.lineWidth = s.w;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(s.h * .12, -s.h * .6, 0, -s.h);
    g.stroke();
    for (const b of s.branches) {
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.quadraticCurveTo(b.x + b.dx * .5, b.y + b.dy * .4, b.x + b.dx, b.y + b.dy);
      g.stroke();
      g.fillStyle = 'rgba(234,150,168,.85)';
      g.beginPath();
      g.arc(b.x + b.dx, b.y + b.dy, 2.2, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  /* ---- 粉色森林的动画：花瓣、小鸟、风里的树苗 ---- */
  function pinkPaint(g, e) {
    const { W, H, P, t } = e;
    const wind = U.clamp(P.wind, 0, 3);

    for (const s of e.st.sprigs || []) drawPinkSprig(g, s, t, wind);

    // 飘落的花瓣
    const cols = e.st.petalC || PP.petal;
    const n = Math.round(U.clamp(P.petals, 0, 1) * 40);
    const speed = .5 + wind * .8;
    for (let i = 0; i < n; i++) {
      const y = (i * 149.3 + t * (18 + (i % 6) * 8) * speed) % (H + 120) - 60;
      const x = (i * .618034 % 1) * W + Math.sin(t * (.45 + wind * .5) + i * 1.3) * (12 + wind * 20) +
        Math.sin(t * .19 + i * .7) * 12;
      const s = 2.6 + (i % 4) * .8;
      g.save();
      g.translate(x, y);
      g.rotate(t * (.35 + wind * .5) * (i % 2 ? 1 : -1) + i * .9);
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.ellipse(0, 0, s * 1.7, s, 0, 0, TAU);
      g.fill();
      g.restore();
    }

    // 飞过的小鸟
    g.strokeStyle = 'rgba(96,76,68,.72)';
    g.lineWidth = 1.5;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = ((t * (.008 + i * .003) + i * .37) % 1.3 - .15) * W;
      const y = H * (.1 + i * .05 + .018 * Math.sin(t * .4 + i * 2));
      const s = 5.5 + (i % 2) * 2.5;
      const f = Math.sin(t * 5.5 + i * 1.7) * .6;
      g.beginPath();
      g.moveTo(x - s, y);
      g.quadraticCurveTo(x - s * .5, y - s * (.55 + f), x, y - s * .1);
      g.quadraticCurveTo(x + s * .5, y - s * (.55 + f), x + s, y);
      g.stroke();
    }
  }

  /* ====================================================================
     注册两个主题（参数与 themes.json 完全一致）
     ==================================================================== */
  SCENES.forest = {
    title: '森林',
    defaults: { sigma: 80, trees: .7, wind: 1, leaves: .5 },
    paintStatic: forestStatic,
    paint: forestPaint
  };
  SCENES.pinkforest = {
    title: '粉色森林',
    defaults: { sigma: 80, trees: .7, wind: 1, petals: .6 },
    paintStatic: pinkStatic,
    paint: pinkPaint
  };
})();
