// 把新主题（火山、火山之夜）和全部主题的新参数补进英文文字表，并加上"全部解锁"提示。
// 用法：node tools/gen-i18n-themes.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../prototype/', import.meta.url);
const read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const write = (f, j) => writeFileSync(new URL(f, root), JSON.stringify(j, null, 2) + '\n', 'utf8');

const P = {
  sigma: { label: 'Landscape distance', hint: 'How far the scenery stays away from your icons', unit: 'px' },
  lava: { label: 'Lava', hint: 'How much lava fills the crater and runs down the slopes' },
  smoke: { label: 'Smoke', hint: 'How thick the plume rising from the crater is' },
  embers: { label: 'Embers', hint: 'Sparks lifted into the sky by the heat' },
  birds: { label: 'Birds', hint: 'Birds circling above the valley', unit: '' },
  fish: { label: 'Fish', hint: 'Small fish swimming around the reef' },
  reef: { label: 'Coral reef', hint: 'Dark coral patches under the water' },
  palms: { label: 'Palm trees', hint: 'Palms on the larger sandbanks; fewer appear when sand is scarce', unit: '' },
  reeds: { label: 'Reeds', hint: 'How many reeds grow along the shore' },
  wind: { label: 'Wind', hint: 'Speed of the ripples and swaying reeds' },
  ducks: { label: 'Ducks', hint: 'Ducks paddling across the lake', unit: '' },
  cover: { label: 'Cloud cover', hint: 'How many clouds are in the sky' },
  drift: { label: 'Drift speed', hint: 'How fast the clouds move' },
  time: { label: 'Time of day', hint: 'Day, dusk or night sky', options: ['Day', 'Dusk', 'Night'] },
  boats: { label: 'Sailboats', hint: 'Sailboats crossing the sea', unit: '' },
  trees: { label: 'Tree density', hint: 'How dense the forest grows around the clearing' },
  leaves: { label: 'Falling leaves', hint: 'Leaves drifting down in the wind' },
  petals: { label: 'Falling petals', hint: 'Petals drifting down in the wind' },
  houses: { label: 'House density', hint: 'How many houses line the streets' },
  age: { label: 'Paper ageing', hint: 'Stains and ink fading on the parchment' },
  traffic: { label: 'Traffic', hint: 'Carts or cars moving along the streets', unit: '' },
  color: { label: 'Colour', hint: 'How vivid the buildings are' },
  towns: { label: 'Towns', hint: 'Towns, forests and landmarks on the continents' },
  wagons: { label: 'Wagons', hint: 'Wagons travelling the dashed roads', unit: '' },
  ships: { label: 'Ships', hint: 'Sailing ships crossing the chart', unit: '' },
  depth: { label: 'Soundings', hint: 'Depth numbers and ink waves on the sea' },
  koi: { label: 'Koi', hint: 'Koi swimming between the lotus leaves', unit: '' },
  pads: { label: 'Lotus leaves', hint: 'How much of the water is covered by leaves' },
  bloom: { label: 'Lotus flowers', hint: 'How many lotus flowers are in bloom' }
};

const groups = {
  volcano: ['Around icons', 'Volcano', 'Details'],
  'volcano-night': ['Around icons', 'Volcano', 'Details'],
  'beach-turquoise': ['Around icons', 'Water', 'Details'],
  lake: ['Around icons', 'Water', 'Details'],
  sky: ['Around icons', 'Sky'],
  ocean: ['Around icons', 'Sea', 'Details'],
  forest: ['Around icons', 'Forest', 'Details'],
  pinkforest: ['Around icons', 'Forest', 'Details'],
  map: ['Around icons', 'City', 'Details'],
  citymap: ['Around icons', 'City', 'Details'],
  worldmap: ['Around icons', 'Chart', 'Details'],
  nauticalmap: ['Around icons', 'Chart', 'Details'],
  lotus: ['Around icons', 'Pond', 'Details']
};

const keys = {
  volcano: ['sigma', 'lava', 'smoke', 'embers', 'birds'],
  'volcano-night': ['sigma', 'lava', 'smoke', 'embers', 'birds'],
  'beach-turquoise': ['sigma', 'reef', 'fish', 'palms'],
  lake: ['sigma', 'reeds', 'wind', 'ducks'],
  sky: ['sigma', 'time', 'cover', 'drift'],
  ocean: ['sigma', 'cover', 'drift', 'boats'],
  forest: ['sigma', 'trees', 'wind', 'leaves'],
  pinkforest: ['sigma', 'trees', 'wind', 'petals'],
  map: ['sigma', 'houses', 'age', 'traffic'],
  citymap: ['sigma', 'houses', 'color', 'traffic'],
  worldmap: ['sigma', 'towns', 'age', 'wagons'],
  nauticalmap: ['sigma', 'depth', 'age', 'ships'],
  lotus: ['sigma', 'pads', 'bloom', 'koi']
};

const extra = {
  volcano: { name: 'Volcano', desc: 'A glowing crater above a plain of cooled lava; the lava river bends around your icons' },
  'volcano-night': { name: 'Volcano at Night', desc: 'Lava glows in the dark and embers rise into the stars' }
};

const overrides = {
  forest: { wind: { label: 'Wind', hint: 'Speed of the swaying trees and falling leaves' } },
  pinkforest: { wind: { label: 'Wind', hint: 'Speed of the swaying branches and falling petals' } },
  lake: { wind: { label: 'Wind', hint: 'Speed of the ripples and swaying reeds' } },
  sky: { cover: { label: 'Cloud cover', hint: 'How many clouds fill the sky' } },
  ocean: { cover: { label: 'Cloud cover', hint: 'How many clouds float over the sea' } },
  map: { traffic: { label: 'Carts', hint: 'Horse carts rolling along the streets' } },
  citymap: { traffic: { label: 'Cars', hint: 'Little cars driving around the city' } },
  worldmap: { towns: { label: 'Towns', hint: 'Towns, forests and landmarks on the continents' } },
  nauticalmap: { depth: { label: 'Soundings', hint: 'Depth numbers and ink waves around the coast' } }
};

for (const lang of ['en']) {
  const file = `i18n/${lang}.json`;
  const j = read(file);
  for (const id of Object.keys(groups)) {
    const t = j.themes[id] || (j.themes[id] = {});
    if (extra[id]) Object.assign(t, extra[id]);
    t.groups = groups[id];
    const params = {};
    for (const k of keys[id]) params[k] = Object.assign({}, P[k], (overrides[id] || {})[k]);
    t.params = params;
  }
  j.ui = j.ui || {};
  j.ui.allUnlocked = 'All themes unlocked — switch freely';
  j.ui.collectionSubtitle = 'Your desktop icons become part of the scenery.';
  write(file, j);
}

const zh = read('i18n/zh-CN.json');
zh.ui = zh.ui || {};
zh.ui.allUnlocked = '全部主题已解锁，随意切换';
write('i18n/zh-CN.json', zh);
console.log('ok');
