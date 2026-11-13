// 生成 prototype/themes.json（所有主题都已解锁：status ready + product free）
// 用法：node tools/gen-themes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const file = new URL('../prototype/themes.json', import.meta.url);
const old = JSON.parse(readFileSync(file, 'utf8'));
const pick = id => old.themes.find(t => t.id === id);

const sigma = (def, min = 40, max = 160, hint = '风景离图标多远') => ({
  key: 'sigma', label: '风景距离', hint, min, max, step: 1, default: def, unit: 'px'
});
const pct = (key, label, hint, def) => ({ key, label, hint, min: 0, max: 1, step: .01, default: def, format: 'percent' });
const count = (key, label, hint, def, max, unit) => ({ key, label, hint, min: 0, max, step: 1, default: def, unit });
const speed = (key, label, hint, def, max = 2) => ({ key, label, hint, min: 0, max, step: .05, default: def, format: 'times' });

const themes = [
  {
    id: 'volcano', name: '火山', desc: '赤红的火山口与冷却的黑色熔岩原，熔岩河绕着你的图标流下',
    page: 'volcano.html', thumb: 'url(thumbs/volcano.webp?v=1) center / cover no-repeat, linear-gradient(160deg, #ffe4cf 0%, #f3b39f 46%, #5a3a45 52%, #33232b 100%)',
    groups: [
      { name: '图标周围', params: [sigma(60)] },
      { name: '火山', params: [
        pct('lava', '熔岩', '火山口和山坡上熔岩河的多少', .55),
        pct('smoke', '烟雾', '火山口冒出的烟有多浓', .6),
        pct('embers', '火星', '被热气带上天空的火星', .5)] },
      { name: '元素', params: [count('birds', '飞鸟', '在山谷上空盘旋的鸟', 3, 6, '只')] }
    ]
  },
  {
    id: 'volcano-night', name: '火山之夜', desc: '夜色里的火山：熔岩河发光，火星升上星空',
    page: 'volcano-night.html', thumb: 'url(thumbs/volcano-night.webp?v=1) center / cover no-repeat, linear-gradient(160deg, #06070f 0%, #1b1428 46%, #4a1f26 52%, #120e18 100%)',
    groups: [
      { name: '图标周围', params: [sigma(60)] },
      { name: '火山', params: [
        pct('lava', '熔岩', '熔岩河和火山口的光有多亮', .85),
        pct('smoke', '烟雾', '夜空里烟柱的浓度', .7),
        pct('embers', '火星', '升上星空的火星', .8)] },
      { name: '元素', params: [count('birds', '飞鸟', '白天才有鸟；夜里默认不显示', 0, 6, '只')] }
    ]
  },
  pick('meadow'),
  pick('beach'),
  {
    id: 'beach-turquoise', name: '马尔代夫', desc: '青绿色海水与浅米黄沙滩，暗色珊瑚礁间的小鱼成群游动',
    page: 'maldives.html', thumb: pick('beach-turquoise').thumb,
    groups: [
      { name: '图标周围', params: [sigma(70, 40, 160, '沙洲从图标往外铺多远')] },
      { name: '海水', params: [
        pct('reef', '珊瑚礁', '水下深色珊瑚礁的多少', .6),
        pct('fish', '鱼群', '在礁石间游动的小鱼', .6)] },
      { name: '元素', params: [count('palms', '椰子树', '大沙洲上的椰子树，沙地不够时会减少', 4, 10, '棵')] }
    ]
  },
  {
    id: 'lake', name: '湖泊', desc: '水彩草地环绕清澈湖水，近岸浅水中显露青绿石块，湖面映出圆鼓鼓的云朵',
    page: 'lake.html', thumb: pick('lake').thumb,
    groups: [
      { name: '图标周围', params: [sigma(80, 40, 180, '湖岸离图标多远')] },
      { name: '水面', params: [
        pct('reeds', '芦苇', '岸边长着芦苇的密度', .5),
        speed('wind', '风', '水面波纹和芦苇摇晃的速度', 1)] },
      { name: '元素', params: [count('ducks', '野鸭', '在湖面上慢慢游的野鸭', 2, 5, '只')] }
    ]
  },
  {
    id: 'sky', name: '天空', desc: '卡通风的蓝天白云，图标坐在一团团圆鼓鼓的云上；可选白天、傍晚、晚上',
    page: 'sky.html', thumb: pick('sky').thumb,
    groups: [
      { name: '图标周围', params: [sigma(90, 40, 180, '图标所在的云从图标往外铺多远')] },
      { name: '天空', params: [
        { key: 'time', label: '时间', hint: '白天、傍晚或夜晚的天空', options: ['白天', '傍晚', '夜晚'], default: 0 },
        pct('cover', '云量', '天上飘着的云有多少', .55),
        speed('drift', '流动速度', '云飘动的速度', 1, 3)] }
    ]
  },
  {
    id: 'ocean', name: '大海', desc: '俯看蓝色的大海，图标藏在一朵朵白云里，云影落在海面上',
    page: 'ocean.html', thumb: pick('ocean').thumb,
    groups: [
      { name: '图标周围', params: [sigma(85, 40, 180, '图标所在的云有多大')] },
      { name: '海面', params: [
        pct('cover', '云量', '海面上空飘着的云有多少', .6),
        speed('drift', '流动速度', '云和云影飘动的速度', 1, 3)] },
      { name: '元素', params: [count('boats', '帆船', '在海面上航行的帆船', 2, 4, '艘')] }
    ]
  },
  {
    id: 'forest', name: '森林', desc: '图标在林间的空地上，四周长满水粉风的卡通树，风吹得树梢轻轻摇',
    page: 'forest.html', thumb: pick('forest').thumb,
    groups: [
      { name: '图标周围', params: [sigma(80, 40, 180, '林间空地离图标多远')] },
      { name: '树林', params: [
        pct('trees', '树木密度', '空地四周树有多密', .7),
        speed('wind', '风', '树梢摇晃和落叶的速度', 1)] },
      { name: '元素', params: [pct('leaves', '落叶', '随风飘落的叶子', .5)] }
    ]
  },
  {
    id: 'pinkforest', name: '粉色森林', desc: '水彩画的森林：一团团透明的粉色树冠，细细的墨线树干',
    page: 'pinkforest.html', thumb: pick('pinkforest').thumb,
    groups: [
      { name: '图标周围', params: [sigma(80, 40, 180, '林间空地离图标多远')] },
      { name: '树林', params: [
        pct('trees', '树木密度', '空地四周树有多密', .7),
        speed('wind', '风', '树梢摇晃和落花的速度', 1)] },
      { name: '元素', params: [pct('petals', '落花', '飘落的花瓣', .6)] }
    ]
  },
  {
    id: 'map', name: '手绘城市', desc: '老城的鸟瞰地图：一排排墨线画的房子沿街排开，图标在广场上',
    page: 'map.html', thumb: pick('map').thumb,
    groups: [
      { name: '图标周围', params: [sigma(60, 30, 140, '广场离图标多远')] },
      { name: '城市', params: [
        pct('houses', '房屋密度', '街道两旁房子的多少', .7),
        pct('age', '纸张做旧', '羊皮纸上的陈年斑点和墨色深浅', .5)] },
      { name: '元素', params: [count('traffic', '马车', '沿街往来的小马车', 2, 4, '辆')] }
    ]
  },
  {
    id: 'citymap', name: '彩色城市', desc: '彩色的城市插画地图：红屋顶、黄粉蓝的墙，图标在广场上',
    page: 'citymap.html', thumb: pick('citymap').thumb,
    groups: [
      { name: '图标周围', params: [sigma(60, 30, 140, '广场离图标多远')] },
      { name: '城市', params: [
        pct('houses', '房屋密度', '街道两旁房子的多少', .7),
        pct('color', '色彩', '房子颜色的鲜艳程度', .8)] },
      { name: '元素', params: [count('traffic', '汽车', '沿街行驶的小汽车', 2, 4, '辆')] }
    ]
  },
  {
    id: 'worldmap', name: '老地图', desc: '羊皮纸上的大陆：图标化为海域，城镇以虚线陆路相连，马车往返运送物资',
    page: 'worldmap.html', thumb: pick('worldmap').thumb,
    groups: [
      { name: '图标周围', params: [sigma(70, 30, 160, '图标周围的海域有多大')] },
      { name: '地图', params: [
        pct('towns', '城镇', '大陆上城镇和森林的多少', .6),
        pct('age', '纸张做旧', '羊皮纸的陈旧程度', .6)] },
      { name: '元素', params: [count('wagons', '马车', '沿虚线陆路往返的马车', 2, 4, '辆')] }
    ]
  },
  {
    id: 'nauticalmap', name: '航海地图', desc: '羊皮纸上的航海图：图标聚成陆地，沿岸有港口小镇和灯塔，弯曲航道穿过点缀着帆船与海怪的海洋',
    page: 'nauticalmap.html', thumb: pick('nauticalmap').thumb,
    groups: [
      { name: '图标周围', params: [sigma(70, 30, 160, '图标所在的海域有多大')] },
      { name: '海图', params: [
        pct('depth', '水深标注', '海面上的水深数字和波纹', .6),
        pct('age', '纸张做旧', '羊皮纸的陈旧程度', .5)] },
      { name: '元素', params: [count('ships', '帆船', '在海面上航行的帆船', 3, 5, '艘')] }
    ]
  },
  {
    id: 'lotus', name: '荷塘', desc: '荷叶荷花长满池塘，一群锦鲤在荷叶和图标之间游，荡开一圈圈涟漪',
    page: 'lotus.html', thumb: pick('lotus').thumb,
    groups: [
      { name: '图标周围', params: [sigma(65, 30, 150, '荷叶离图标多远')] },
      { name: '池塘', params: [
        pct('pads', '荷叶', '水面上荷叶的多少', .8),
        pct('bloom', '荷花', '开了花的荷有多少', .6)] },
      { name: '元素', params: [count('koi', '锦鲤', '在荷叶之间游的锦鲤', 6, 12, '条')] }
    ]
  }
].filter(Boolean);

// 11 个原先锁定的主题：缩略图换成按实际场景重新生成的文件（旧的是壁纸版的宣传图），渐变留作加载前的底色
for (const t of themes) {
  const before = pick(t.id);
  if (!before || t.id === 'meadow' || t.id === 'beach') continue;
  const old = before.thumb || '';
  const gi = old.indexOf('linear-gradient(');
  const grad = gi >= 0 ? old.slice(gi) : 'linear-gradient(160deg, #cfcfcf 0%, #8a8a8a 100%)';
  t.thumb = 'url(thumbs/' + t.id + '.webp?v=1) center / cover no-repeat, ' + grad;
}

const out = {
  version: 2,
  note: '全部主题已解锁（status ready / product free），每个主题都有自己的页面与参数。',
  themes: themes.map(t => Object.assign({ status: 'ready', product: 'free', adaptive: false }, t))
};
writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('写入', themes.length, '个主题 ->', file.pathname);
