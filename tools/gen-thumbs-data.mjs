// 由 prototype/themes.json 里的缩略图路径生成 prototype/thumbs-data.js（内嵌 data URI，设置页不依赖缓存）。
// 用法：node tools/gen-thumbs-data.mjs
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url)) + '/../prototype/';
const themes = JSON.parse(readFileSync(join(root, 'themes.json'), 'utf8')).themes;
const out = {};
for (const th of themes) {
  const m = String(th.thumb || '').match(/url\(([^)]+)\)/);
  if (!m) continue;
  const rel = decodeURIComponent(m[1].split('?')[0]);
  if (!/\.webp$/i.test(rel)) continue;
  const buf = readFileSync(join(root, rel));
  if (buf.slice(8, 12).toString() !== 'WEBP') throw new Error('not webp: ' + rel);
  out[th.id] = 'data:image/webp;base64,' + buf.toString('base64');
}
const js = 'window.DESKLAND_THUMBS = Object.freeze(' + JSON.stringify(out) + ');\n';
writeFileSync(join(root, 'thumbs-data.js'), js, 'utf8');
console.log('thumbs-data.js:', Object.keys(out).length, 'thumbs,', statSync(join(root, 'thumbs-data.js')).size, 'bytes');
